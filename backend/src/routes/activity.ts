import { Hono } from 'hono'
import { db } from '../db/index.js'
import { activity_log, workspace_members } from '../db/schema.js'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Resolve the workspace the user belongs to. The COI app is single-workspace
// per user in practice (first membership), so we anchor the audit log to the
// caller's first workspace membership and reject if they belong to none.
async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return m?.workspace_id ?? null
}

// GET / — append-only workspace audit log.
// Filters: entity_type, actor (actor_id), from / to (ISO dates on created_at).
// Most-recent first. Bounded result set.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const workspaceId = await resolveWorkspaceId(userId)
  if (!workspaceId) return c.json([])

  const entityType = c.req.query('entity_type')
  const actor = c.req.query('actor') ?? c.req.query('actor_id')
  const from = c.req.query('from')
  const to = c.req.query('to')
  const limitRaw = parseInt(c.req.query('limit') ?? '200', 10)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 200

  const conditions = [eq(activity_log.workspace_id, workspaceId)]
  if (entityType) conditions.push(eq(activity_log.entity_type, entityType))
  if (actor) conditions.push(eq(activity_log.actor_id, actor))
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) conditions.push(gte(activity_log.created_at, d))
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) conditions.push(lte(activity_log.created_at, d))
  }

  const rows = await db
    .select()
    .from(activity_log)
    .where(and(...conditions))
    .orderBy(desc(activity_log.created_at))
    .limit(limit)

  return c.json(rows)
})

export default router
