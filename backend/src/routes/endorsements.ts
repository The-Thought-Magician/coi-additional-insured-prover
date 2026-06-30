import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { endorsements, certificates, workspace_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Endorsement ledger per certificate. Endorsement types model the AI/waiver
// forms that prove additional-insured / P&NC / waiver-of-subrogation status:
//   - CG 20 10  : Additional Insured — Owners, Lessees or Contractors (ongoing ops)
//   - CG 20 37  : Additional Insured — Completed Operations
//   - blanket_ai: Blanket additional-insured by written contract
//   - CG 24 04  : Waiver of Transfer of Rights of Recovery (waiver of subrogation)
//   - P&NC      : Primary & Non-Contributory
const endorsementTypeEnum = z.enum([
  'cg_20_10',
  'cg_20_37',
  'blanket_ai',
  'cg_24_04',
  'pnc',
  'other',
])

const createSchema = z.object({
  certificate_id: z.string().min(1),
  form_number: z.string().min(1),
  edition_date: z.string().optional().nullable(),
  endorsement_type: endorsementTypeEnum,
  coverage_type: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  is_blanket: z.boolean().optional().default(false),
  scheduled_holder_text: z.string().optional().nullable(),
  provided: z.boolean().optional().default(true),
})

const updateSchema = createSchema.partial().omit({ certificate_id: true })

// Confirm a user belongs to the workspace that owns a certificate.
async function memberOfCertWorkspace(certificateId: string, userId: string) {
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId))
  if (!cert) return { ok: false as const, status: 404 as const, error: 'Certificate not found' }
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, cert.workspace_id), eq(workspace_members.user_id, userId)))
  if (!member) return { ok: false as const, status: 403 as const, error: 'Forbidden' }
  return { ok: true as const, cert }
}

// Public read: full endorsement ledger for a certificate.
router.get('/certificate/:certificateId', async (c) => {
  const certificateId = c.req.param('certificateId')
  const rows = await db
    .select()
    .from(endorsements)
    .where(eq(endorsements.certificate_id, certificateId))
    .orderBy(desc(endorsements.created_at))
  return c.json(rows)
})

// Add an endorsement to a certificate (auth + workspace membership).
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const access = await memberOfCertWorkspace(body.certificate_id, userId)
  if (!access.ok) return c.json({ error: access.error }, access.status)
  const [row] = await db
    .insert(endorsements)
    .values({
      certificate_id: body.certificate_id,
      form_number: body.form_number,
      edition_date: body.edition_date ?? null,
      endorsement_type: body.endorsement_type,
      coverage_type: body.coverage_type ?? null,
      scope: body.scope ?? null,
      is_blanket: body.is_blanket ?? false,
      scheduled_holder_text: body.scheduled_holder_text ?? null,
      provided: body.provided ?? true,
    })
    .returning()
  return c.json(row, 201)
})

// Update an endorsement (auth + workspace membership via parent certificate).
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(endorsements).where(eq(endorsements.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await memberOfCertWorkspace(existing.certificate_id, userId)
  if (!access.ok) return c.json({ error: access.error }, access.status)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.form_number !== undefined) patch.form_number = body.form_number
  if (body.edition_date !== undefined) patch.edition_date = body.edition_date
  if (body.endorsement_type !== undefined) patch.endorsement_type = body.endorsement_type
  if (body.coverage_type !== undefined) patch.coverage_type = body.coverage_type
  if (body.scope !== undefined) patch.scope = body.scope
  if (body.is_blanket !== undefined) patch.is_blanket = body.is_blanket
  if (body.scheduled_holder_text !== undefined) patch.scheduled_holder_text = body.scheduled_holder_text
  if (body.provided !== undefined) patch.provided = body.provided
  if (Object.keys(patch).length === 0) return c.json(existing)
  const [updated] = await db.update(endorsements).set(patch).where(eq(endorsements.id, id)).returning()
  return c.json(updated)
})

// Delete an endorsement (auth + workspace membership via parent certificate).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(endorsements).where(eq(endorsements.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const access = await memberOfCertWorkspace(existing.certificate_id, userId)
  if (!access.ok) return c.json({ error: access.error }, access.status)
  await db.delete(endorsements).where(eq(endorsements.id, id))
  return c.json({ success: true })
})

export default router
