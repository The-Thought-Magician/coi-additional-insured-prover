import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { attachments, certificates, workspace_members, activity_log } from '../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return m?.workspace_id ?? null
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [m] = await db
    .select()
    .from(workspace_members)
    .where(
      and(eq(workspace_members.user_id, userId), eq(workspace_members.workspace_id, workspaceId)),
    )
  return !!m
}

const attachmentSchema = z.object({
  certificate_id: z.string().min(1),
  filename: z.string().min(1),
  file_type: z.string().optional(),
  url: z.string().optional(),
})

// GET /certificate/:certificateId — attachment metadata for a certificate.
// Auth-gated: the caller must be a member of the certificate's workspace.
router.get('/certificate/:certificateId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const certificateId = c.req.param('certificateId')

  const [cert] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, certificateId))
  if (!cert) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, cert.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.certificate_id, certificateId))
    .orderBy(desc(attachments.created_at))

  return c.json(rows)
})

// POST / — register attachment metadata for a certificate.
router.post('/', authMiddleware, zValidator('json', attachmentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [cert] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, body.certificate_id))
  if (!cert) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(userId, cert.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  const [created] = await db
    .insert(attachments)
    .values({
      workspace_id: cert.workspace_id,
      certificate_id: body.certificate_id,
      filename: body.filename,
      file_type: body.file_type ?? null,
      url: body.url ?? null,
      uploaded_by: userId,
    })
    .returning()

  await db.insert(activity_log).values({
    workspace_id: cert.workspace_id,
    actor_id: userId,
    action: 'attachment.register',
    entity_type: 'attachment',
    entity_id: created.id,
    metadata: { certificate_id: body.certificate_id, filename: body.filename },
  })

  return c.json(created, 201)
})

// DELETE /:id — delete an attachment (workspace membership required).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')

  const [existing] = await db.select().from(attachments).where(eq(attachments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id))) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(attachments).where(eq(attachments.id, id))

  await db.insert(activity_log).values({
    workspace_id: existing.workspace_id,
    actor_id: userId,
    action: 'attachment.delete',
    entity_type: 'attachment',
    entity_id: id,
    metadata: { filename: existing.filename },
  })

  return c.json({ success: true })
})

export default router
