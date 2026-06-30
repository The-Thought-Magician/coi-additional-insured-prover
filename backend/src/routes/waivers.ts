import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { waivers, deficiencies, workspace_members, activity_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()
router.use('*', authMiddleware)

// Resolve the caller's active workspace (first membership).
async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
  return member?.workspace_id ?? null
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.user_id, userId), eq(workspace_members.workspace_id, workspaceId)))
  return !!member
}

const waiverSchema = z.object({
  deficiency_id: z.string().min(1),
  justification: z.string().min(1),
  expires_at: z.string().datetime().optional().nullable(),
})

// List waivers in the caller's workspace
router.get('/', async (c) => {
  const userId = getUserId(c)
  const workspaceId = await activeWorkspaceId(userId)
  if (!workspaceId) return c.json([])
  const rows = await db
    .select()
    .from(waivers)
    .where(eq(waivers.workspace_id, workspaceId))
    .orderBy(desc(waivers.created_at))
  return c.json(rows)
})

// Create a waiver for a deficiency; sets deficiency status = waived
router.post('/', zValidator('json', waiverSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [deficiency] = await db
    .select()
    .from(deficiencies)
    .where(eq(deficiencies.id, body.deficiency_id))
  if (!deficiency) return c.json({ error: 'Deficiency not found' }, 404)
  if (!(await isMember(userId, deficiency.workspace_id))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(waivers)
    .values({
      workspace_id: deficiency.workspace_id,
      deficiency_id: body.deficiency_id,
      justification: body.justification,
      waived_by: userId,
      expires_at: body.expires_at ? new Date(body.expires_at) : null,
    })
    .returning()

  await db
    .update(deficiencies)
    .set({ status: 'waived', updated_at: new Date() })
    .where(eq(deficiencies.id, body.deficiency_id))

  await db.insert(activity_log).values({
    workspace_id: deficiency.workspace_id,
    actor_id: userId,
    action: 'waiver.create',
    entity_type: 'deficiency',
    entity_id: body.deficiency_id,
    metadata: { waiver_id: created.id },
  })

  return c.json(created, 201)
})

// Revoke a waiver; reopens the deficiency
router.delete('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(waivers).where(eq(waivers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await db.delete(waivers).where(eq(waivers.id, id))

  await db
    .update(deficiencies)
    .set({ status: 'open', resolved_at: null, updated_at: new Date() })
    .where(eq(deficiencies.id, existing.deficiency_id))

  await db.insert(activity_log).values({
    workspace_id: existing.workspace_id,
    actor_id: userId,
    action: 'waiver.revoke',
    entity_type: 'deficiency',
    entity_id: existing.deficiency_id,
    metadata: { waiver_id: id },
  })

  return c.json({ success: true })
})

export default router
