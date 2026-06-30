import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { workspaces, workspace_members } from '../db/schema.js'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

router.use('*', authMiddleware)

function genInviteCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

const createSchema = z.object({
  name: z.string().min(1),
  default_gl_each_occurrence: z.number().int().positive().optional(),
  default_gl_aggregate: z.number().int().positive().optional(),
  require_pnc_default: z.boolean().optional(),
  require_waiver_default: z.boolean().optional(),
  fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

const updateSchema = createSchema.partial()

// Helper: collect the workspace ids a user belongs to.
async function memberWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

// GET / — workspaces the user is a member of
router.get('/', async (c) => {
  const userId = getUserId(c)
  const ids = await memberWorkspaceIds(userId)
  if (ids.length === 0) return c.json([])
  const rows = await db
    .select()
    .from(workspaces)
    .where(inArray(workspaces.id, ids))
    .orderBy(desc(workspaces.created_at))
  return c.json(rows)
})

// GET /current — the user's active (first) workspace
router.get('/current', async (c) => {
  const userId = getUserId(c)
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
    .limit(1)
  if (!mem) return c.json(null)
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, mem.workspace_id))
  return c.json(ws ?? null)
})

// POST / — create workspace, generate invite_code, add creator as owner
router.post('/', zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  let invite_code = genInviteCode()
  // Ensure uniqueness against collisions.
  for (let i = 0; i < 5; i++) {
    const [clash] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.invite_code, invite_code))
    if (!clash) break
    invite_code = genInviteCode()
  }
  const [ws] = await db
    .insert(workspaces)
    .values({
      name: body.name,
      invite_code,
      created_by: userId,
      ...(body.default_gl_each_occurrence !== undefined && {
        default_gl_each_occurrence: body.default_gl_each_occurrence,
      }),
      ...(body.default_gl_aggregate !== undefined && {
        default_gl_aggregate: body.default_gl_aggregate,
      }),
      ...(body.require_pnc_default !== undefined && {
        require_pnc_default: body.require_pnc_default,
      }),
      ...(body.require_waiver_default !== undefined && {
        require_waiver_default: body.require_waiver_default,
      }),
      ...(body.fiscal_year_start_month !== undefined && {
        fiscal_year_start_month: body.fiscal_year_start_month,
      }),
      ...(body.settings !== undefined && { settings: body.settings }),
    })
    .returning()
  await db.insert(workspace_members).values({
    workspace_id: ws.id,
    user_id: userId,
    role: 'owner',
  })
  return c.json(ws, 201)
})

// GET /:id — workspace detail (member check)
router.get('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, id), eq(workspace_members.user_id, userId)))
  if (!mem) return c.json({ error: 'Forbidden' }, 403)
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  return c.json(ws)
})

// PUT /:id — update workspace settings (owner only)
router.put('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!ws) return c.json({ error: 'Not found' }, 404)
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, id), eq(workspace_members.user_id, userId)))
  if (!mem || mem.role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(workspaces)
    .set({ ...body, updated_at: new Date() })
    .where(eq(workspaces.id, id))
    .returning()
  return c.json(updated)
})

// POST /join — join via { invite_code }
router.post('/join', zValidator('json', z.object({ invite_code: z.string().min(1) })), async (c) => {
  const userId = getUserId(c)
  const { invite_code } = c.req.valid('json')
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.invite_code, invite_code.toUpperCase()))
  if (!ws) return c.json({ error: 'Invalid invite code' }, 404)
  const [existing] = await db
    .select()
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, ws.id), eq(workspace_members.user_id, userId)),
    )
  if (!existing) {
    await db.insert(workspace_members).values({
      workspace_id: ws.id,
      user_id: userId,
      role: 'reviewer',
    })
  }
  return c.json(ws)
})

// GET /:id/members — list members (member check)
router.get('/:id/members', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, id), eq(workspace_members.user_id, userId)))
  if (!mem) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.workspace_id, id))
    .orderBy(workspace_members.joined_at)
  return c.json(rows)
})

export default router
