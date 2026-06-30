import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  coverage_gaps,
  vendor_project_assignments,
  workspace_members,
  certificates,
  coverage_lines,
} from '../db/schema.js'
import { and, eq, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 24 * 60 * 60 * 1000

// Coverage types whose lapses we track against onsite windows.
const TRACKED_COVERAGE_TYPES = ['general_liability', 'auto_liability', 'workers_comp', 'umbrella']

// Resolve the set of workspace ids the current user belongs to.
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

// Merge a set of [start,end] intervals (ms) into sorted, non-overlapping spans.
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = intervals
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e)
    } else {
      merged.push([s, e])
    }
  }
  return merged
}

// Subtract covered spans from a required window → uncovered gap spans (ms).
function subtractCoverage(
  windowStart: number,
  windowEnd: number,
  covered: Array<[number, number]>,
): Array<[number, number]> {
  const gaps: Array<[number, number]> = []
  let cursor = windowStart
  for (const [s, e] of covered) {
    if (e <= cursor) continue
    if (s >= windowEnd) break
    const clampedStart = Math.max(s, windowStart)
    const clampedEnd = Math.min(e, windowEnd)
    if (clampedStart > cursor) gaps.push([cursor, clampedStart])
    cursor = Math.max(cursor, clampedEnd)
    if (cursor >= windowEnd) break
  }
  if (cursor < windowEnd) gaps.push([cursor, windowEnd])
  return gaps
}

// Compute, per coverage type, the uncovered spans within one assignment's onsite window.
async function computeGapsForAssignment(assignment: {
  id: string
  workspace_id: string
  vendor_id: string
  project_id: string
  onsite_start: Date | null
  onsite_end: Date | null
}): Promise<Array<typeof coverage_gaps.$inferInsert>> {
  const windowStart = assignment.onsite_start ? assignment.onsite_start.getTime() : null
  // If no end, treat the window as running through "now".
  const windowEnd = assignment.onsite_end ? assignment.onsite_end.getTime() : Date.now()
  if (windowStart === null || windowEnd <= windowStart) return []

  // Gather all coverage lines belonging to this vendor's certificates in the workspace.
  const certs = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(
      and(
        eq(certificates.workspace_id, assignment.workspace_id),
        eq(certificates.vendor_id, assignment.vendor_id),
      ),
    )
  const certIds = certs.map((cert) => cert.id)

  const lines =
    certIds.length > 0
      ? await db
          .select()
          .from(coverage_lines)
          .where(inArray(coverage_lines.certificate_id, certIds))
      : []

  // Group covered intervals by coverage type.
  const byType = new Map<string, Array<[number, number]>>()
  for (const line of lines) {
    if (!line.effective_date || !line.expiry_date) continue
    const arr = byType.get(line.coverage_type) ?? []
    arr.push([line.effective_date.getTime(), line.expiry_date.getTime()])
    byType.set(line.coverage_type, arr)
  }

  // Only evaluate coverage types that are either tracked defaults or actually present.
  const typesToCheck = new Set<string>([...TRACKED_COVERAGE_TYPES, ...byType.keys()])

  const now = Date.now()
  const out: Array<typeof coverage_gaps.$inferInsert> = []
  for (const coverageType of typesToCheck) {
    const covered = mergeIntervals(byType.get(coverageType) ?? [])
    const gaps = subtractCoverage(windowStart, windowEnd, covered)
    for (const [gs, ge] of gaps) {
      const gapDays = Math.max(1, Math.round((ge - gs) / DAY_MS))
      // worked_uninsured: any part of the lapse is in the past (vendor was onsite uncovered).
      const workedUninsured = gs < now
      out.push({
        workspace_id: assignment.workspace_id,
        assignment_id: assignment.id,
        vendor_id: assignment.vendor_id,
        project_id: assignment.project_id,
        coverage_type: coverageType,
        gap_start: new Date(gs),
        gap_end: new Date(ge),
        gap_days: gapDays,
        worked_uninsured: workedUninsured,
      })
    }
  }
  return out
}

// GET / — all computed gaps in the user's workspaces. Filters: vendor_id, project_id,
// assignment_id, worked_uninsured.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await memberWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const conds = [inArray(coverage_gaps.workspace_id, wsIds)]
  const vendorId = c.req.query('vendor_id')
  const projectId = c.req.query('project_id')
  const assignmentId = c.req.query('assignment_id')
  const workedUninsured = c.req.query('worked_uninsured')
  if (vendorId) conds.push(eq(coverage_gaps.vendor_id, vendorId))
  if (projectId) conds.push(eq(coverage_gaps.project_id, projectId))
  if (assignmentId) conds.push(eq(coverage_gaps.assignment_id, assignmentId))
  if (workedUninsured === 'true') conds.push(eq(coverage_gaps.worked_uninsured, true))
  if (workedUninsured === 'false') conds.push(eq(coverage_gaps.worked_uninsured, false))

  const rows = await db
    .select()
    .from(coverage_gaps)
    .where(and(...conds))
    .orderBy(coverage_gaps.gap_start)
  return c.json(rows)
})

const recomputeSchema = z.object({
  assignment_id: z.string().optional(),
  workspace_id: z.string().optional(),
})

// POST /recompute — recompute gaps from assignments + coverage lines. If assignment_id is
// given, recompute just that assignment; otherwise recompute every assignment in the
// resolved workspace(s). Replaces existing gap rows for the recomputed assignments.
router.post('/recompute', authMiddleware, zValidator('json', recomputeSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  let assignments: Array<typeof vendor_project_assignments.$inferSelect> = []

  if (body.assignment_id) {
    const [a] = await db
      .select()
      .from(vendor_project_assignments)
      .where(eq(vendor_project_assignments.id, body.assignment_id))
    if (!a) return c.json({ error: 'Not found' }, 404)
    if (!(await userInWorkspace(userId, a.workspace_id)))
      return c.json({ error: 'Forbidden' }, 403)
    assignments = [a]
  } else {
    let wsIds = await memberWorkspaceIds(userId)
    if (body.workspace_id) {
      if (!(await userInWorkspace(userId, body.workspace_id)))
        return c.json({ error: 'Forbidden' }, 403)
      wsIds = [body.workspace_id]
    }
    if (wsIds.length === 0) return c.json([])
    assignments = await db
      .select()
      .from(vendor_project_assignments)
      .where(inArray(vendor_project_assignments.workspace_id, wsIds))
  }

  const inserted: Array<typeof coverage_gaps.$inferSelect> = []
  for (const a of assignments) {
    // Clear previously computed gaps for this assignment so recompute is idempotent.
    await db.delete(coverage_gaps).where(eq(coverage_gaps.assignment_id, a.id))
    const computed = await computeGapsForAssignment(a)
    if (computed.length > 0) {
      const rows = await db.insert(coverage_gaps).values(computed).returning()
      inserted.push(...rows)
    }
  }

  inserted.sort((x, y) => x.gap_start.getTime() - y.gap_start.getTime())
  return c.json(inserted)
})

// GET /assignment/:assignmentId — computed gaps for a single assignment.
router.get('/assignment/:assignmentId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const assignmentId = c.req.param('assignmentId')
  const [a] = await db
    .select()
    .from(vendor_project_assignments)
    .where(eq(vendor_project_assignments.id, assignmentId))
  if (!a) return c.json({ error: 'Not found' }, 404)
  if (!(await userInWorkspace(userId, a.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(coverage_gaps)
    .where(eq(coverage_gaps.assignment_id, assignmentId))
    .orderBy(coverage_gaps.gap_start)
  return c.json(rows)
})

export default router
