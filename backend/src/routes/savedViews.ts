import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { saved_views, workspace_members } from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return m?.workspace_id ?? null
}

const savedViewSchema = z.object({
  name: z.string().min(1),
  entity: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
})

// GET / — the current user's saved list-filter views in their workspace.
// Optional ?entity= filter narrows to one entity kind (e.g. "vendors").
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = await resolveWorkspaceId(userId)
  if (!workspaceId) return c.json([])

  const entity = c.req.query('entity')
  const conditions = [
    eq(saved_views.workspace_id, workspaceId),
    eq(saved_views.user_id, userId),
  ]
  if (entity) conditions.push(eq(saved_views.entity, entity))

  const rows = await db
    .select()
    .from(saved_views)
    .where(and(...conditions))
    .orderBy(desc(saved_views.created_at))

  return c.json(rows)
})

// POST / — create a saved view for the current user.
router.post('/', authMiddleware, zValidator('json', savedViewSchema), async (c) => {
  const userId = getUserId(c)
  const workspaceId = await resolveWorkspaceId(userId)
  if (!workspaceId) return c.json({ error: 'No workspace' }, 403)

  const body = c.req.valid('json')
  const [created] = await db
    .insert(saved_views)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: body.name,
      entity: body.entity,
      filters: body.filters as Record<string, unknown>,
    })
    .returning()

  return c.json(created, 201)
})

// DELETE /:id — delete one of the current user's saved views.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(saved_views).where(eq(saved_views.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(saved_views).where(eq(saved_views.id, id))
  return c.json({ success: true })
})

export default router
