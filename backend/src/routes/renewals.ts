import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  renewal_reminders,
  certificates,
  coverage_lines,
  vendors,
  workspace_members,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()
router.use('*', authMiddleware)

async function activeWorkspaceId(userId: string): Promise<string | null> {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
  return member?.workspace_id ?? null
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.user_id, userId), eq(workspace_members.workspace_id, workspaceId)))
  return !!member
}

const DAY_MS = 24 * 60 * 60 * 1000

// Expiry/renewal radar: bucket coverage lines by days-until-expiry.
router.get('/radar', async (c) => {
  const userId = getUserId(c)
  const workspaceId = await activeWorkspaceId(userId)
  const empty = { expired: [], in30: [], in60: [], in90: [] }
  if (!workspaceId) return c.json(empty)

  const rows = await db
    .select({
      line: coverage_lines,
      certificate_id: certificates.id,
      vendor_id: certificates.vendor_id,
      vendor_name: vendors.legal_name,
      compliance_status: certificates.compliance_status,
    })
    .from(coverage_lines)
    .innerJoin(certificates, eq(coverage_lines.certificate_id, certificates.id))
    .leftJoin(vendors, eq(certificates.vendor_id, vendors.id))
    .where(eq(certificates.workspace_id, workspaceId))

  const now = Date.now()
  const expired: unknown[] = []
  const in30: unknown[] = []
  const in60: unknown[] = []
  const in90: unknown[] = []

  for (const r of rows) {
    if (!r.line.expiry_date) continue
    const days = Math.floor((new Date(r.line.expiry_date).getTime() - now) / DAY_MS)
    const entry = {
      coverage_line_id: r.line.id,
      certificate_id: r.certificate_id,
      vendor_id: r.vendor_id,
      vendor_name: r.vendor_name,
      coverage_type: r.line.coverage_type,
      carrier_name: r.line.carrier_name,
      policy_number: r.line.policy_number,
      expiry_date: r.line.expiry_date,
      days_until_expiry: days,
      compliance_status: r.compliance_status,
    }
    if (days < 0) expired.push(entry)
    else if (days <= 30) in30.push(entry)
    else if (days <= 60) in60.push(entry)
    else if (days <= 90) in90.push(entry)
  }

  return c.json({ expired, in30, in60, in90 })
})

// List renewal reminders
router.get('/reminders', async (c) => {
  const userId = getUserId(c)
  const workspaceId = await activeWorkspaceId(userId)
  if (!workspaceId) return c.json([])
  const rows = await db
    .select()
    .from(renewal_reminders)
    .where(eq(renewal_reminders.workspace_id, workspaceId))
    .orderBy(renewal_reminders.expiry_date)
  return c.json(rows)
})

const reminderSchema = z.object({
  vendor_id: z.string().min(1),
  certificate_id: z.string().min(1).optional().nullable(),
  expiry_date: z.string().datetime(),
  coverage_type: z.string().min(1).optional().nullable(),
})

// Create a renewal reminder
router.post('/reminders', zValidator('json', reminderSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, body.vendor_id))
  if (!vendor) return c.json({ error: 'Vendor not found' }, 404)
  if (!(await isMember(userId, vendor.workspace_id))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (body.certificate_id) {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.id, body.certificate_id))
    if (!cert || cert.workspace_id !== vendor.workspace_id) {
      return c.json({ error: 'Certificate not found in workspace' }, 404)
    }
  }

  const [created] = await db
    .insert(renewal_reminders)
    .values({
      workspace_id: vendor.workspace_id,
      vendor_id: body.vendor_id,
      certificate_id: body.certificate_id ?? null,
      coverage_type: body.coverage_type ?? null,
      expiry_date: new Date(body.expiry_date),
      status: 'pending',
    })
    .returning()

  return c.json(created, 201)
})

// Log a renewal request: set status + requested_at
router.post('/reminders/:id/request', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(renewal_reminders)
    .where(eq(renewal_reminders.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const [updated] = await db
    .update(renewal_reminders)
    .set({ status: 'requested', requested_at: new Date() })
    .where(eq(renewal_reminders.id, id))
    .returning()

  await db.insert(activity_log).values({
    workspace_id: existing.workspace_id,
    actor_id: userId,
    action: 'renewal.request',
    entity_type: 'renewal_reminder',
    entity_id: id,
    metadata: { vendor_id: existing.vendor_id, coverage_type: existing.coverage_type },
  })

  return c.json(updated)
})

export default router
