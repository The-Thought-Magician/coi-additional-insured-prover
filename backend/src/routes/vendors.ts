import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  vendors,
  workspace_members,
  certificates,
  deficiencies,
  vendor_project_assignments,
  projects,
} from '../db/schema.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

router.use('*', authMiddleware)

// Resolve the caller's active workspace (first joined). Returns null if none.
async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
    .limit(1)
  return mem ? mem.workspace_id : null
}

// True if the user is a member of the given workspace.
async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [mem] = await db
    .select({ id: workspace_members.id })
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
    )
  return !!mem
}

const vendorSchema = z.object({
  legal_name: z.string().min(1),
  dba: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
  ein: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  risk_tier: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
})

// GET / — list vendors in workspace (filter status/risk_tier/search)
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json([])
  const status = c.req.query('status')
  const riskTier = c.req.query('risk_tier')
  const search = c.req.query('search')?.toLowerCase()

  const conds = [eq(vendors.workspace_id, wsId)]
  if (status) conds.push(eq(vendors.status, status))
  if (riskTier) conds.push(eq(vendors.risk_tier, riskTier))

  let rows = await db
    .select()
    .from(vendors)
    .where(and(...conds))
    .orderBy(desc(vendors.created_at))

  if (search) {
    rows = rows.filter(
      (v) =>
        v.legal_name.toLowerCase().includes(search) ||
        (v.dba ?? '').toLowerCase().includes(search) ||
        (v.trade ?? '').toLowerCase().includes(search),
    )
  }
  return c.json(rows)
})

// GET /:id — vendor detail
router.get('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id))
  if (!v) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, v.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  return c.json(v)
})

// POST / — create vendor
router.post('/', zValidator('json', vendorSchema), async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json({ error: 'No workspace' }, 400)
  const body = c.req.valid('json')
  const [v] = await db
    .insert(vendors)
    .values({
      workspace_id: wsId,
      legal_name: body.legal_name,
      dba: body.dba ?? null,
      trade: body.trade ?? null,
      ein: body.ein ?? null,
      contact_name: body.contact_name ?? null,
      contact_email: body.contact_email ?? null,
      contact_phone: body.contact_phone ?? null,
      address: body.address ?? null,
      ...(body.status && { status: body.status }),
      ...(body.risk_tier && { risk_tier: body.risk_tier }),
      ...(body.tags && { tags: body.tags }),
      notes: body.notes ?? null,
      created_by: userId,
    })
    .returning()
  return c.json(v, 201)
})

// PUT /:id — update vendor (workspace membership)
router.put('/:id', zValidator('json', vendorSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id))
  if (!v) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, v.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(vendors)
    .set({ ...body, updated_at: new Date() })
    .where(eq(vendors.id, id))
    .returning()
  return c.json(updated)
})

// DELETE /:id — delete vendor
router.delete('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id))
  if (!v) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, v.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(vendors).where(eq(vendors.id, id))
  return c.json({ success: true })
})

// GET /:id/scorecard — compliance scorecard
router.get('/:id/scorecard', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id))
  if (!v) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, v.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  const certs = await db
    .select()
    .from(certificates)
    .where(eq(certificates.vendor_id, id))
    .orderBy(desc(certificates.created_at))

  let compliant = 0
  let deficient = 0
  let expired = 0
  for (const cert of certs) {
    if (cert.compliance_status === 'compliant') compliant++
    else if (cert.compliance_status === 'expired') expired++
    else if (cert.compliance_status === 'deficient') deficient++
  }

  const certIds = certs.map((cert) => cert.id)
  let openDeficiencies = 0
  if (certIds.length > 0) {
    const defs = await db
      .select()
      .from(deficiencies)
      .where(
        and(
          inArray(deficiencies.certificate_id, certIds),
          eq(deficiencies.status, 'open'),
        ),
      )
    openDeficiencies = defs.length
  }

  return c.json({
    compliant,
    deficient,
    expired,
    open_deficiencies: openDeficiencies,
    certificates: certs,
  })
})

// GET /:id/assignments — projects this vendor is assigned to
router.get('/:id/assignments', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id))
  if (!v) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, v.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select({
      id: vendor_project_assignments.id,
      workspace_id: vendor_project_assignments.workspace_id,
      vendor_id: vendor_project_assignments.vendor_id,
      project_id: vendor_project_assignments.project_id,
      onsite_start: vendor_project_assignments.onsite_start,
      onsite_end: vendor_project_assignments.onsite_end,
      scope_of_work: vendor_project_assignments.scope_of_work,
      created_at: vendor_project_assignments.created_at,
      project_name: projects.name,
      project_status: projects.status,
    })
    .from(vendor_project_assignments)
    .leftJoin(projects, eq(vendor_project_assignments.project_id, projects.id))
    .where(eq(vendor_project_assignments.vendor_id, id))
    .orderBy(desc(vendor_project_assignments.created_at))
  return c.json(rows)
})

export default router
