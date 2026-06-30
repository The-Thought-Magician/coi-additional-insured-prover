import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  certificates,
  coverage_gaps,
  coverage_lines,
  deficiencies,
  projects,
  reason_codes,
  vendor_project_assignments,
  vendors,
  workspace_members,
} from '../db/schema.js'
import { eq, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()
router.use('*', authMiddleware)

// First workspace the user belongs to — the active workspace for reporting.
async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .limit(1)
  return row?.workspace_id ?? null
}

function isCompliant(status: string): boolean {
  return status === 'compliant'
}

function isDeficient(status: string): boolean {
  return status === 'deficient' || status === 'non_compliant' || status === 'failed'
}

function isExpired(status: string): boolean {
  return status === 'expired'
}

// GET /overview — workspace KPIs.
router.get('/overview', async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) {
    return c.json({
      kpis: {
        total_vendors: 0,
        compliant_vendors: 0,
        compliant_pct: 0,
        total_certificates: 0,
        open_deficiencies: 0,
      },
      deficiency_by_reason: [],
      expiring_count: 0,
      uninsured_vendors: 0,
    })
  }

  const wsVendors = await db.select().from(vendors).where(eq(vendors.workspace_id, wsId))
  const wsCerts = await db
    .select()
    .from(certificates)
    .where(eq(certificates.workspace_id, wsId))
  const wsDefs = await db
    .select()
    .from(deficiencies)
    .where(eq(deficiencies.workspace_id, wsId))

  // A vendor is compliant when it has at least one certificate and none of its
  // certificates are deficient or expired.
  const certsByVendor = new Map<string, typeof wsCerts>()
  for (const cert of wsCerts) {
    const arr = certsByVendor.get(cert.vendor_id) ?? []
    arr.push(cert)
    certsByVendor.set(cert.vendor_id, arr)
  }

  let compliantVendors = 0
  for (const v of wsVendors) {
    const certs = certsByVendor.get(v.id) ?? []
    if (certs.length === 0) continue
    const bad = certs.some(
      (cert) => isDeficient(cert.compliance_status) || isExpired(cert.compliance_status),
    )
    if (!bad && certs.some((cert) => isCompliant(cert.compliance_status))) compliantVendors++
  }

  const totalVendors = wsVendors.length
  const compliantPct =
    totalVendors === 0 ? 0 : Math.round((compliantVendors / totalVendors) * 1000) / 10

  // Open deficiencies grouped by reason code.
  const openDefs = wsDefs.filter((d) => d.status === 'open')
  const byReason = new Map<string, number>()
  for (const d of openDefs) {
    byReason.set(d.reason_code, (byReason.get(d.reason_code) ?? 0) + 1)
  }
  const deficiencyByReason = [...byReason.entries()]
    .map(([reason_code, count]) => ({ reason_code, count }))
    .sort((a, b) => b.count - a.count)

  // Certificates / coverage lines expiring this calendar month.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  const certIds = wsCerts.map((cert) => cert.id)
  let expiringCount = 0
  if (certIds.length > 0) {
    const lines = await db
      .select()
      .from(coverage_lines)
      .where(inArray(coverage_lines.certificate_id, certIds))
    expiringCount = lines.filter((l) => {
      if (!l.expiry_date) return false
      const t = new Date(l.expiry_date).getTime()
      return t >= monthStart && t < monthEnd
    }).length
  }

  // Vendors with at least one coverage gap flagged worked_uninsured.
  const gaps = await db
    .select()
    .from(coverage_gaps)
    .where(eq(coverage_gaps.workspace_id, wsId))
  const uninsuredSet = new Set<string>()
  for (const g of gaps) {
    if (g.worked_uninsured) uninsuredSet.add(g.vendor_id)
  }

  return c.json({
    kpis: {
      total_vendors: totalVendors,
      compliant_vendors: compliantVendors,
      compliant_pct: compliantPct,
      total_certificates: wsCerts.length,
      open_deficiencies: openDefs.length,
    },
    deficiency_by_reason: deficiencyByReason,
    expiring_count: expiringCount,
    uninsured_vendors: uninsuredSet.size,
  })
})

// GET /by-project — per-project compliance rollup list.
router.get('/by-project', async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json([])

  const wsProjects = await db.select().from(projects).where(eq(projects.workspace_id, wsId))
  const wsCerts = await db
    .select()
    .from(certificates)
    .where(eq(certificates.workspace_id, wsId))
  const assignments = await db
    .select()
    .from(vendor_project_assignments)
    .where(eq(vendor_project_assignments.workspace_id, wsId))

  const certIds = wsCerts.map((cert) => cert.id)
  const linesByCert = new Map<string, Array<{ expiry_date: Date | null }>>()
  if (certIds.length > 0) {
    const lines = await db
      .select()
      .from(coverage_lines)
      .where(inArray(coverage_lines.certificate_id, certIds))
    for (const l of lines) {
      const arr = linesByCert.get(l.certificate_id) ?? []
      arr.push({ expiry_date: l.expiry_date })
      linesByCert.set(l.certificate_id, arr)
    }
  }

  const now = Date.now()
  const in30 = now + 30 * 24 * 60 * 60 * 1000

  const rollup = wsProjects.map((p) => {
    const projAssignments = assignments.filter((a) => a.project_id === p.id)
    const vendorIds = new Set(projAssignments.map((a) => a.vendor_id))
    const projCerts = wsCerts.filter((cert) => cert.project_id === p.id)

    let compliant = 0
    let deficient = 0
    for (const cert of projCerts) {
      if (isCompliant(cert.compliance_status)) compliant++
      else if (isDeficient(cert.compliance_status) || isExpired(cert.compliance_status)) deficient++
    }

    let expiring = 0
    for (const cert of projCerts) {
      const lines = linesByCert.get(cert.id) ?? []
      const soon = lines.some((l) => {
        if (!l.expiry_date) return false
        const t = new Date(l.expiry_date).getTime()
        return t >= now && t <= in30
      })
      if (soon) expiring++
    }

    return {
      project_id: p.id,
      project_name: p.name,
      status: p.status,
      total_vendors: vendorIds.size,
      total_certificates: projCerts.length,
      compliant,
      deficient,
      expiring,
    }
  })

  return c.json(rollup)
})

// GET /by-reason — open-deficiency counts grouped by reason code.
router.get('/by-reason', async (c) => {
  const userId = getUserId(c)
  const wsId = await activeWorkspaceId(userId)
  if (!wsId) return c.json([])

  const wsDefs = await db
    .select()
    .from(deficiencies)
    .where(eq(deficiencies.workspace_id, wsId))
  const openDefs = wsDefs.filter((d) => d.status === 'open')

  const counts = new Map<string, number>()
  for (const d of openDefs) {
    counts.set(d.reason_code, (counts.get(d.reason_code) ?? 0) + 1)
  }

  const codes = await db.select().from(reason_codes)
  const codeMap = new Map(codes.map((rc) => [rc.id, rc]))

  const out = [...counts.entries()]
    .map(([reason_code, count]) => {
      const rc = codeMap.get(reason_code)
      return {
        reason_code,
        title: rc?.title ?? reason_code,
        default_severity: rc?.default_severity ?? null,
        count,
      }
    })
    .sort((a, b) => b.count - a.count)

  return c.json(out)
})

export default router
