import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  coverage_lines,
  certificates,
  workspace_members,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function certWorkspace(certificateId: string): Promise<string | null> {
  const [cert] = await db
    .select({ workspace_id: certificates.workspace_id })
    .from(certificates)
    .where(eq(certificates.id, certificateId))
  return cert?.workspace_id ?? null
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
      entity_type: 'coverage_line',
      entity_id: entityId,
      metadata,
    })
  } catch {
    /* best-effort */
  }
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? null : new Date(t)
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  certificate_id: z.string().min(1),
  coverage_type: z.string().min(1),
  carrier_name: z.string().nullable().optional(),
  carrier_naic: z.string().nullable().optional(),
  policy_number: z.string().nullable().optional(),
  effective_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  each_occurrence: z.number().int().nonnegative().nullable().optional(),
  aggregate_limit: z.number().int().nonnegative().nullable().optional(),
  additional_insured_box: z.boolean().optional(),
  subrogation_waived_box: z.boolean().optional(),
  pnc_box: z.boolean().optional(),
})

const updateSchema = createSchema.partial().omit({ certificate_id: true })

// ---------------------------------------------------------------------------
// GET /certificate/:certificateId — public read: coverage lines for a cert
// ---------------------------------------------------------------------------

router.get('/certificate/:certificateId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const certificateId = c.req.param('certificateId')
  const wsId = await certWorkspace(certificateId)
  if (!wsId) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, wsId))) return c.json({ error: 'Forbidden' }, 403)
  const lines = await db
    .select()
    .from(coverage_lines)
    .where(eq(coverage_lines.certificate_id, certificateId))
    .orderBy(coverage_lines.coverage_type)
  return c.json(lines)
})

// ---------------------------------------------------------------------------
// POST / — add a coverage line (auth-gated, ownership via certificate workspace)
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const ws = await certWorkspace(body.certificate_id)
  if (!ws) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, ws))) return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(coverage_lines)
    .values({
      certificate_id: body.certificate_id,
      coverage_type: body.coverage_type,
      carrier_name: body.carrier_name ?? null,
      carrier_naic: body.carrier_naic ?? null,
      policy_number: body.policy_number ?? null,
      effective_date: toDate(body.effective_date),
      expiry_date: toDate(body.expiry_date),
      each_occurrence: body.each_occurrence ?? null,
      aggregate_limit: body.aggregate_limit ?? null,
      additional_insured_box: body.additional_insured_box ?? false,
      subrogation_waived_box: body.subrogation_waived_box ?? false,
      pnc_box: body.pnc_box ?? false,
    })
    .returning()

  await logActivity(ws, userId, 'coverage_line.create', created.id, {
    certificate_id: body.certificate_id,
    coverage_type: created.coverage_type,
  })
  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update a coverage line
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(coverage_lines).where(eq(coverage_lines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const ws = await certWorkspace(existing.certificate_id)
  if (!ws) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, ws))) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const updates: Record<string, unknown> = {}
  if (body.coverage_type !== undefined) updates.coverage_type = body.coverage_type
  if (body.carrier_name !== undefined) updates.carrier_name = body.carrier_name
  if (body.carrier_naic !== undefined) updates.carrier_naic = body.carrier_naic
  if (body.policy_number !== undefined) updates.policy_number = body.policy_number
  if (body.effective_date !== undefined) updates.effective_date = toDate(body.effective_date)
  if (body.expiry_date !== undefined) updates.expiry_date = toDate(body.expiry_date)
  if (body.each_occurrence !== undefined) updates.each_occurrence = body.each_occurrence
  if (body.aggregate_limit !== undefined) updates.aggregate_limit = body.aggregate_limit
  if (body.additional_insured_box !== undefined)
    updates.additional_insured_box = body.additional_insured_box
  if (body.subrogation_waived_box !== undefined)
    updates.subrogation_waived_box = body.subrogation_waived_box
  if (body.pnc_box !== undefined) updates.pnc_box = body.pnc_box

  if (Object.keys(updates).length === 0) return c.json(existing)

  const [updated] = await db
    .update(coverage_lines)
    .set(updates)
    .where(eq(coverage_lines.id, id))
    .returning()

  await logActivity(ws, userId, 'coverage_line.update', id)
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete a coverage line
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(coverage_lines).where(eq(coverage_lines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const ws = await certWorkspace(existing.certificate_id)
  if (!ws) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, ws))) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(coverage_lines).where(eq(coverage_lines.id, id))

  await logActivity(ws, userId, 'coverage_line.delete', id)
  return c.json({ success: true })
})

export default router
