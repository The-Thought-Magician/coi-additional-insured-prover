import { Hono } from 'hono'
import { db } from '../db/index.js'
import { notifications, workspace_members } from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Resolve the workspace ids the user is a member of.
async function userWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

// GET / — current user's notifications across the workspaces they belong to.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await userWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
  // Only surface notifications that belong to a workspace the user is in.
  const visible = rows.filter((n) => wsIds.includes(n.workspace_id))
  return c.json(visible)
})

// POST /:id/read — mark a single notification read (must be the user's own).
router.post('/:id/read', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning()
  return c.json(updated)
})

// POST /read-all — mark every notification for the current user read.
router.post('/read-all', authMiddleware, async (c) => {
  const userId = getUserId(c)
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)))
  return c.json({ success: true })
})

export default router
