import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  evidence_packs,
  workspace_members,
  vendors,
  projects,
  certificates,
  coverage_lines,
  endorsements,
  gradings,
  deficiencies,
  coverage_gaps,
} from '../db/schema.js'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function memberWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

async function userInWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.workspace_id, workspaceId),
        eq(workspace_members.user_id, userId),
      ),
    )
  return !!m
}

// GET / — list evidence packs across the user's workspaces (filter vendor_id/project_id).
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await memberWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const conds = [inArray(evidence_packs.workspace_id, wsIds)]
  const vendorId = c.req.query('vendor_id')
  const projectId = c.req.query('project_id')
  const certificateId = c.req.query('certificate_id')
  if (vendorId) conds.push(eq(evidence_packs.vendor_id, vendorId))
  if (projectId) conds.push(eq(evidence_packs.project_id, projectId))
  if (certificateId) conds.push(eq(evidence_packs.certificate_id, certificateId))

  const rows = await db
    .select()
    .from(evidence_packs)
    .where(and(...conds))
    .orderBy(desc(evidence_packs.created_at))
  return c.json(rows)
})

// GET /:id — immutable pack detail (returns the stored snapshot verbatim).
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [pack] = await db.select().from(evidence_packs).where(eq(evidence_packs.id, id))
  if (!pack) return c.json({ error: 'Not found' }, 404)
  if (!(await userInWorkspace(userId, pack.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)
  return c.json(pack)
})

const generateSchema = z
  .object({
    vendor_id: z.string().optional(),
    project_id: z.string().optional(),
    certificate_id: z.string().optional(),
    workspace_id: z.string().optional(),
    title: z.string().min(1),
  })
  .refine((b) => b.certificate_id || b.vendor_id, {
    message: 'certificate_id or vendor_id is required',
  })

// POST / — generate an immutable evidence pack: snapshot of the certificate(s) plus their
// coverage lines, endorsements, latest grading, deficiencies, and any computed coverage gaps.
router.post('/', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Resolve the workspace from the supplied certificate, then validate membership.
  let workspaceId = body.workspace_id ?? null

  // Determine which certificates the pack covers.
  let certRows: Array<typeof certificates.$inferSelect> = []
  if (body.certificate_id) {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.id, body.certificate_id))
    if (!cert) return c.json({ error: 'Certificate not found' }, 404)
    workspaceId = cert.workspace_id
    certRows = [cert]
  } else if (body.vendor_id) {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, body.vendor_id))
    if (!vendor) return c.json({ error: 'Vendor not found' }, 404)
    workspaceId = vendor.workspace_id
    const conds = [
      eq(certificates.workspace_id, workspaceId),
      eq(certificates.vendor_id, body.vendor_id),
    ]
    if (body.project_id) conds.push(eq(certificates.project_id, body.project_id))
    certRows = await db
      .select()
      .from(certificates)
      .where(and(...conds))
      .orderBy(desc(certificates.created_at))
  }

  if (!workspaceId) return c.json({ error: 'Unable to resolve workspace' }, 400)
  if (!(await userInWorkspace(userId, workspaceId)))
    return c.json({ error: 'Forbidden' }, 403)

  // Build the immutable per-certificate snapshot.
  const certSnapshots = []
  for (const cert of certRows) {
    const lines = await db
      .select()
      .from(coverage_lines)
      .where(eq(coverage_lines.certificate_id, cert.id))
    const endos = await db
      .select()
      .from(endorsements)
      .where(eq(endorsements.certificate_id, cert.id))
    const [latestGrading] = await db
      .select()
      .from(gradings)
      .where(eq(gradings.certificate_id, cert.id))
      .orderBy(desc(gradings.created_at))
      .limit(1)
    const defs = await db
      .select()
      .from(deficiencies)
      .where(eq(deficiencies.certificate_id, cert.id))
    certSnapshots.push({
      certificate: cert,
      coverage_lines: lines,
      endorsements: endos,
      grading: latestGrading ?? null,
      deficiencies: defs,
    })
  }

  // Include any computed coverage gaps scoped to vendor/project where applicable.
  let gapRows: Array<typeof coverage_gaps.$inferSelect> = []
  {
    const gapConds = [eq(coverage_gaps.workspace_id, workspaceId)]
    if (body.vendor_id) gapConds.push(eq(coverage_gaps.vendor_id, body.vendor_id))
    if (body.project_id) gapConds.push(eq(coverage_gaps.project_id, body.project_id))
    gapRows = await db
      .select()
      .from(coverage_gaps)
      .where(and(...gapConds))
      .orderBy(coverage_gaps.gap_start)
  }

  // Optional vendor / project context for the audit record.
  let vendorRecord: typeof vendors.$inferSelect | null = null
  if (body.vendor_id) {
    const [v] = await db.select().from(vendors).where(eq(vendors.id, body.vendor_id))
    vendorRecord = v ?? null
  } else if (certRows[0]) {
    const [v] = await db.select().from(vendors).where(eq(vendors.id, certRows[0].vendor_id))
    vendorRecord = v ?? null
  }
  let projectRecord: typeof projects.$inferSelect | null = null
  const projId = body.project_id ?? certRows.find((r) => r.project_id)?.project_id ?? null
  if (projId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, projId))
    projectRecord = p ?? null
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    generated_by: userId,
    vendor: vendorRecord,
    project: projectRecord,
    certificates: certSnapshots,
    coverage_gaps: gapRows,
    summary: {
      certificate_count: certSnapshots.length,
      total_coverage_lines: certSnapshots.reduce(
        (n, s) => n + s.coverage_lines.length,
        0,
      ),
      total_endorsements: certSnapshots.reduce((n, s) => n + s.endorsements.length, 0),
      open_deficiencies: certSnapshots.reduce(
        (n, s) => n + s.deficiencies.filter((d) => d.status === 'open').length,
        0,
      ),
      coverage_gap_count: gapRows.length,
      worked_uninsured: gapRows.some((g) => g.worked_uninsured),
    },
  }

  const [pack] = await db
    .insert(evidence_packs)
    .values({
      workspace_id: workspaceId,
      vendor_id: body.vendor_id ?? certRows[0]?.vendor_id ?? null,
      project_id: projId,
      certificate_id: body.certificate_id ?? null,
      title: body.title,
      snapshot,
      generated_by: userId,
    })
    .returning()

  return c.json(pack, 201)
})

export default router
