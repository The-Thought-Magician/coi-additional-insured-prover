import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tasks, workspace_members } from '../db/schema.js'
import { and, desc, eq, inArray } from 'drizzle-orm'
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

// First workspace the user belongs to — the active workspace for new tasks.
async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .limit(1)
  return row?.workspace_id ?? null
}

const isoToDate = (v: string | null | undefined): Date | null =>
  v ? new Date(v) : null

const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  task_type: z.string().optional(),
  status: z.string().optional(),
  assigned_to: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  vendor_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  certificate_id: z.string().optional().nullable(),
  deficiency_id: z.string().optional().nullable(),
})

const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  task_type: z.string().optional(),
  status: z.string().optional(),
  assigned_to: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  vendor_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  certificate_id: z.string().optional().nullable(),
  deficiency_id: z.string().optional().nullable(),
})

// GET / — tasks in the user's workspaces.
// Query: status, assigned_to, mine=true, overdue=true.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await userWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const rows = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.workspace_id, wsIds))
    .orderBy(desc(tasks.created_at))

  const status = c.req.query('status')
  const assignedTo = c.req.query('assigned_to')
  const mine = c.req.query('mine') === 'true'
  const overdue = c.req.query('overdue') === 'true'
  const now = Date.now()

  const filtered = rows.filter((t) => {
    if (status && t.status !== status) return false
    if (assignedTo && t.assigned_to !== assignedTo) return false
    if (mine && t.assigned_to !== userId) return false
    if (overdue) {
      if (!t.due_date) return false
      if (t.status === 'done' || t.status === 'closed' || t.status === 'completed') return false
      if (new Date(t.due_date).getTime() >= now) return false
    }
    return true
  })

  return c.json(filtered)
})

// GET /:id — task detail (workspace member check).
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!t) return c.json({ error: 'Not found' }, 404)
  const wsIds = await userWorkspaceIds(userId)
  if (!wsIds.includes(t.workspace_id)) return c.json({ error: 'Forbidden' }, 403)
  return c.json(t)
})

// POST / — create a task in the user's active workspace.
router.post('/', authMiddleware, zValidator('json', taskCreateSchema), async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json({ error: 'No workspace' }, 400)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(tasks)
    .values({
      workspace_id: wsId,
      title: body.title,
      description: body.description ?? null,
      task_type: body.task_type ?? 'follow_up',
      status: body.status ?? 'open',
      assigned_to: body.assigned_to ?? null,
      due_date: isoToDate(body.due_date),
      vendor_id: body.vendor_id ?? null,
      project_id: body.project_id ?? null,
      certificate_id: body.certificate_id ?? null,
      deficiency_id: body.deficiency_id ?? null,
      created_by: userId,
    })
    .returning()
  return c.json(created, 201)
})

// PUT /:id — update task (status, assignee, due, links).
router.put('/:id', authMiddleware, zValidator('json', taskUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const wsIds = await userWorkspaceIds(userId)
  if (!wsIds.includes(existing.workspace_id)) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.title !== undefined) patch.title = body.title
  if (body.description !== undefined) patch.description = body.description
  if (body.task_type !== undefined) patch.task_type = body.task_type
  if (body.status !== undefined) patch.status = body.status
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to
  if (body.due_date !== undefined) patch.due_date = isoToDate(body.due_date)
  if (body.vendor_id !== undefined) patch.vendor_id = body.vendor_id
  if (body.project_id !== undefined) patch.project_id = body.project_id
  if (body.certificate_id !== undefined) patch.certificate_id = body.certificate_id
  if (body.deficiency_id !== undefined) patch.deficiency_id = body.deficiency_id

  const [updated] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — delete a task.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const wsIds = await userWorkspaceIds(userId)
  if (!wsIds.includes(existing.workspace_id)) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(tasks).where(eq(tasks.id, id))
  return c.json({ success: true })
})

export default router
