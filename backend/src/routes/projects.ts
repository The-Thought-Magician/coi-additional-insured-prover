import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  projects,
  workspace_members,
  vendor_project_assignments,
  vendors,
  certificates,
} from '../db/schema.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

router.use('*', authMiddleware)

async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [mem] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
    .limit(1)
  return mem ? mem.workspace_id : null
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [mem] = await db
    .select({ id: workspace_members.id })
    .from(workspace_members)
    .where(
      and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)),
    )
  return !!mem
}

const projectSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  owner_developer: z.string().optional().nullable(),
  lender: z.string().optional().nullable(),
  prime_contract_ref: z.string().optional().nullable(),
  template_id: z.string().optional().nullable(),
  lender_mandated: z.boolean().optional(),
  holder_entity_text: z.string().optional().nullable(),
  start_date: z.string().datetime().optional().nullable(),
  end_date: z.string().datetime().optional().nullable(),
  status: z.enum(['active', 'completed', 'on_hold', 'archived']).optional(),
})

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(v)
}

// GET / — list projects in workspace
router.get('/', async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json([])
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspace_id, wsId))
    .orderBy(desc(projects.created_at))
  return c.json(rows)
})

// DELETE /assignments/:assignmentId — unassign a vendor (declared before /:id to avoid clash)
router.delete('/assignments/:assignmentId', async (c) => {
  const userId = getUserId(c)
  const assignmentId = c.req.param('assignmentId')
  const [a] = await db
    .select()
    .from(vendor_project_assignments)
    .where(eq(vendor_project_assignments.id, assignmentId))
  if (!a) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, a.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(vendor_project_assignments).where(eq(vendor_project_assignments.id, assignmentId))
  return c.json({ success: true })
})

// GET /:id — project detail
router.get('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  return c.json(p)
})

// POST / — create project
router.post('/', zValidator('json', projectSchema), async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json({ error: 'No workspace' }, 400)
  const body = c.req.valid('json')
  const [p] = await db
    .insert(projects)
    .values({
      workspace_id: wsId,
      name: body.name,
      address: body.address ?? null,
      owner_developer: body.owner_developer ?? null,
      lender: body.lender ?? null,
      prime_contract_ref: body.prime_contract_ref ?? null,
      template_id: body.template_id ?? null,
      ...(body.lender_mandated !== undefined && { lender_mandated: body.lender_mandated }),
      holder_entity_text: body.holder_entity_text ?? null,
      start_date: toDate(body.start_date) ?? null,
      end_date: toDate(body.end_date) ?? null,
      ...(body.status && { status: body.status }),
      created_by: userId,
    })
    .returning()
  return c.json(p, 201)
})

// PUT /:id — update project
router.put('/:id', zValidator('json', projectSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  for (const key of [
    'name',
    'address',
    'owner_developer',
    'lender',
    'prime_contract_ref',
    'template_id',
    'lender_mandated',
    'holder_entity_text',
    'status',
  ] as const) {
    if (body[key] !== undefined) patch[key] = body[key]
  }
  if (body.start_date !== undefined) patch.start_date = toDate(body.start_date)
  if (body.end_date !== undefined) patch.end_date = toDate(body.end_date)
  const [updated] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning()
  return c.json(updated)
})

// DELETE /:id — delete project
router.delete('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(projects).where(eq(projects.id, id))
  return c.json({ success: true })
})

// GET /:id/rollup — per-project compliance rollup
router.get('/:id/rollup', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  const assignments = await db
    .select()
    .from(vendor_project_assignments)
    .where(eq(vendor_project_assignments.project_id, id))
  const totalVendors = assignments.length

  const certs = await db
    .select()
    .from(certificates)
    .where(eq(certificates.project_id, id))

  // Latest certificate per vendor decides that vendor's standing on the project.
  const latestByVendor = new Map<string, (typeof certs)[number]>()
  for (const cert of certs) {
    const prev = latestByVendor.get(cert.vendor_id)
    if (!prev || (cert.created_at?.getTime() ?? 0) > (prev.created_at?.getTime() ?? 0)) {
      latestByVendor.set(cert.vendor_id, cert)
    }
  }

  let compliant = 0
  let deficient = 0
  let expiring = 0
  const now = Date.now()
  const in30 = now + 30 * 24 * 60 * 60 * 1000
  for (const a of assignments) {
    const cert = latestByVendor.get(a.vendor_id)
    if (!cert) {
      deficient++
      continue
    }
    if (cert.compliance_status === 'compliant') compliant++
    else deficient++
    if (
      cert.compliance_status === 'expired' ||
      (a.onsite_end && a.onsite_end.getTime() >= now && a.onsite_end.getTime() <= in30)
    ) {
      expiring++
    }
  }

  return c.json({
    total_vendors: totalVendors,
    compliant,
    deficient,
    expiring,
  })
})

// GET /:id/vendors — vendors mapped to project with assignments
router.get('/:id/vendors', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  if (!p) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

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
      vendor_legal_name: vendors.legal_name,
      vendor_trade: vendors.trade,
      vendor_risk_tier: vendors.risk_tier,
      vendor_status: vendors.status,
    })
    .from(vendor_project_assignments)
    .leftJoin(vendors, eq(vendor_project_assignments.vendor_id, vendors.id))
    .where(eq(vendor_project_assignments.project_id, id))
    .orderBy(desc(vendor_project_assignments.created_at))
  return c.json(rows)
})

// POST /:id/assign — assign a vendor with on-site dates
router.post(
  '/:id/assign',
  zValidator(
    'json',
    z.object({
      vendor_id: z.string().min(1),
      onsite_start: z.string().datetime().optional().nullable(),
      onsite_end: z.string().datetime().optional().nullable(),
      scope_of_work: z.string().optional().nullable(),
    }),
  ),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const [p] = await db.select().from(projects).where(eq(projects.id, id))
    if (!p) return c.json({ error: 'Not found' }, 404)
    if (!(await isMember(userId, p.workspace_id))) return c.json({ error: 'Forbidden' }, 403)
    const body = c.req.valid('json')

    // Vendor must exist in the same workspace.
    const [v] = await db.select().from(vendors).where(eq(vendors.id, body.vendor_id))
    if (!v || v.workspace_id !== p.workspace_id) {
      return c.json({ error: 'Vendor not in workspace' }, 400)
    }

    // Honor the UNIQUE(vendor_id, project_id) constraint — update if it exists.
    const [existing] = await db
      .select()
      .from(vendor_project_assignments)
      .where(
        and(
          eq(vendor_project_assignments.vendor_id, body.vendor_id),
          eq(vendor_project_assignments.project_id, id),
        ),
      )
    if (existing) {
      const [updated] = await db
        .update(vendor_project_assignments)
        .set({
          onsite_start: toDate(body.onsite_start) ?? null,
          onsite_end: toDate(body.onsite_end) ?? null,
          scope_of_work: body.scope_of_work ?? null,
        })
        .where(eq(vendor_project_assignments.id, existing.id))
        .returning()
      return c.json(updated, 201)
    }

    const [a] = await db
      .insert(vendor_project_assignments)
      .values({
        workspace_id: p.workspace_id,
        vendor_id: body.vendor_id,
        project_id: id,
        onsite_start: toDate(body.onsite_start) ?? null,
        onsite_end: toDate(body.onsite_end) ?? null,
        scope_of_work: body.scope_of_work ?? null,
      })
      .returning()
    return c.json(a, 201)
  },
)

export default router
