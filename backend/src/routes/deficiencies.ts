import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { deficiencies, certificates, workspace_members } from '../db/schema.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Every endpoint here is workspace-scoped and auth-gated.
router.use('*', authMiddleware)

// Return the set of workspace ids the caller belongs to.
async function memberWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

async function isMember(workspaceId: string, userId: string) {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!member
}

// List reason-coded deficiencies across the caller's workspaces, with optional
// filters by status, reason_code, vendor, or project. Vendor/project filters
// resolve through the parent certificate.
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsIds = await memberWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const status = c.req.query('status')
  const reasonCode = c.req.query('reason_code')
  const vendorId = c.req.query('vendor_id')
  const projectId = c.req.query('project_id')

  const conds = [inArray(deficiencies.workspace_id, wsIds)]
  if (status) conds.push(eq(deficiencies.status, status))
  if (reasonCode) conds.push(eq(deficiencies.reason_code, reasonCode))

  let rows = await db
    .select()
    .from(deficiencies)
    .where(and(...conds))
    .orderBy(desc(deficiencies.created_at))

  // Vendor / project filters are applied via the parent certificate.
  if (vendorId || projectId) {
    const certIds = [...new Set(rows.map((r) => r.certificate_id))]
    if (certIds.length === 0) return c.json([])
    const certs = await db.select().from(certificates).where(inArray(certificates.id, certIds))
    const allowed = new Set(
      certs
        .filter((ct) => (!vendorId || ct.vendor_id === vendorId) && (!projectId || ct.project_id === projectId))
        .map((ct) => ct.id),
    )
    rows = rows.filter((r) => allowed.has(r.certificate_id))
  }

  return c.json(rows)
})

// Deficiency detail.
router.get('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [def] = await db.select().from(deficiencies).where(eq(deficiencies.id, id))
  if (!def) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(def.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  return c.json(def)
})

const updateSchema = z.object({
  assigned_to: z.string().optional().nullable(),
  due_date: z.string().datetime().optional().nullable(),
  status: z.enum(['open', 'in_progress', 'resolved', 'waived']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  detail: z.string().optional().nullable(),
})

// Assign / set due date / update status or severity.
router.put('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [def] = await db.select().from(deficiencies).where(eq(deficiencies.id, id))
  if (!def) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(def.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to
  if (body.due_date !== undefined) patch.due_date = body.due_date ? new Date(body.due_date) : null
  if (body.severity !== undefined) patch.severity = body.severity
  if (body.detail !== undefined) patch.detail = body.detail
  if (body.status !== undefined) {
    patch.status = body.status
    // Keep resolved_at consistent with status transitions.
    patch.resolved_at = body.status === 'resolved' ? new Date() : null
  }

  const [updated] = await db.update(deficiencies).set(patch).where(eq(deficiencies.id, id)).returning()
  return c.json(updated)
})

// Mark a deficiency resolved.
router.post('/:id/resolve', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [def] = await db.select().from(deficiencies).where(eq(deficiencies.id, id))
  if (!def) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(def.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(deficiencies)
    .set({ status: 'resolved', resolved_at: new Date(), updated_at: new Date() })
    .where(eq(deficiencies.id, id))
    .returning()
  return c.json(updated)
})

export default router
