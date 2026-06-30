import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  requirement_templates,
  template_line_requirements,
  workspace_members,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function userWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspace_members.id })
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.user_id, userId),
        eq(workspace_members.workspace_id, workspaceId),
      ),
    )
  return !!row
}

async function logActivity(
  workspaceId: string,
  actorId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await db.insert(activity_log).values({
      workspace_id: workspaceId,
      actor_id: actorId,
      action,
      entity_type: 'requirement_template',
      entity_id: entityId,
      metadata,
    })
  } catch {
    /* activity logging is best-effort */
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  applies_to_risk_tier: z.string().optional(),
  require_ai_ongoing: z.boolean().optional(),
  require_ai_completed: z.boolean().optional(),
  accept_blanket_ai: z.boolean().optional(),
  require_pnc: z.boolean().optional(),
  require_waiver_subrogation: z.boolean().optional(),
  min_carrier_am_best: z.string().optional(),
  is_active: z.boolean().optional(),
})

const templateUpdateSchema = templateSchema.partial().omit({ workspace_id: true })

const lineSchema = z.object({
  coverage_type: z.string().min(1),
  required: z.boolean().optional().default(true),
  min_each_occurrence: z.number().int().nonnegative().nullable().optional(),
  min_aggregate: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const linesReplaceSchema = z.object({
  lines: z.array(lineSchema),
})

// ---------------------------------------------------------------------------
// GET / — list requirement templates in the user's workspace(s)
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await userWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const wsFilter = c.req.query('workspace_id')
  if (wsFilter && !wsIds.includes(wsFilter)) return c.json({ error: 'Forbidden' }, 403)

  const all = await db
    .select()
    .from(requirement_templates)
    .orderBy(desc(requirement_templates.created_at))

  const scoped = all.filter((t) =>
    wsFilter ? t.workspace_id === wsFilter : wsIds.includes(t.workspace_id),
  )
  return c.json(scoped)
})

// ---------------------------------------------------------------------------
// GET /:id — template detail incl. line requirements
// ---------------------------------------------------------------------------

router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [template] = await db
    .select()
    .from(requirement_templates)
    .where(eq(requirement_templates.id, id))
  if (!template) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, template.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const lines = await db
    .select()
    .from(template_line_requirements)
    .where(eq(template_line_requirements.template_id, id))
    .orderBy(template_line_requirements.coverage_type)

  return c.json({ template, lines })
})

// ---------------------------------------------------------------------------
// POST / — create template
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', templateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await isMember(userId, body.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(requirement_templates)
    .values({
      workspace_id: body.workspace_id,
      name: body.name,
      description: body.description,
      version: 1,
      applies_to_risk_tier: body.applies_to_risk_tier,
      require_ai_ongoing: body.require_ai_ongoing ?? true,
      require_ai_completed: body.require_ai_completed ?? true,
      accept_blanket_ai: body.accept_blanket_ai ?? true,
      require_pnc: body.require_pnc ?? true,
      require_waiver_subrogation: body.require_waiver_subrogation ?? true,
      min_carrier_am_best: body.min_carrier_am_best,
      is_active: body.is_active ?? true,
      created_by: userId,
    })
    .returning()

  await logActivity(created.workspace_id, userId, 'template.create', created.id, {
    name: created.name,
  })
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update template (bumps version)
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', templateUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(requirement_templates)
    .where(eq(requirement_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(requirement_templates)
    .set({
      ...body,
      version: existing.version + 1,
      updated_at: new Date(),
    })
    .where(eq(requirement_templates.id, id))
    .returning()

  await logActivity(updated.workspace_id, userId, 'template.update', updated.id, {
    version: updated.version,
  })
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete template (and its line requirements)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(requirement_templates)
    .where(eq(requirement_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  await db
    .delete(template_line_requirements)
    .where(eq(template_line_requirements.template_id, id))
  await db.delete(requirement_templates).where(eq(requirement_templates.id, id))

  await logActivity(existing.workspace_id, userId, 'template.delete', id, {
    name: existing.name,
  })
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// PUT /:id/lines — replace per-coverage-line minimum requirements
// ---------------------------------------------------------------------------

router.put(
  '/:id/lines',
  authMiddleware,
  zValidator('json', linesReplaceSchema),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [template] = await db
      .select()
      .from(requirement_templates)
      .where(eq(requirement_templates.id, id))
    if (!template) return c.json({ error: 'Not found' }, 404)
    if (!(await isMember(userId, template.workspace_id)))
      return c.json({ error: 'Forbidden' }, 403)

    const { lines } = c.req.valid('json')

    // De-dupe by coverage_type (UNIQUE(template_id, coverage_type)).
    const seen = new Set<string>()
    const deduped = lines.filter((l) => {
      if (seen.has(l.coverage_type)) return false
      seen.add(l.coverage_type)
      return true
    })

    // Full replace: drop existing, insert the new set.
    await db
      .delete(template_line_requirements)
      .where(eq(template_line_requirements.template_id, id))

    let inserted: typeof template_line_requirements.$inferSelect[] = []
    if (deduped.length > 0) {
      inserted = await db
        .insert(template_line_requirements)
        .values(
          deduped.map((l) => ({
            template_id: id,
            coverage_type: l.coverage_type,
            required: l.required ?? true,
            min_each_occurrence: l.min_each_occurrence ?? null,
            min_aggregate: l.min_aggregate ?? null,
            notes: l.notes ?? null,
          })),
        )
        .returning()
    }

    // Replacing requirements changes the effective template — bump version.
    await db
      .update(requirement_templates)
      .set({ version: template.version + 1, updated_at: new Date() })
      .where(eq(requirement_templates.id, id))

    await logActivity(template.workspace_id, userId, 'template.set_lines', id, {
      count: inserted.length,
    })
    return c.json(inserted)
  },
)

export default router
