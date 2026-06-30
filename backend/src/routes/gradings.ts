import { Hono } from 'hono'
import { db } from '../db/index.js'
import { gradings, certificates, workspace_members } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Confirm the caller is a member of a workspace.
async function isMember(workspaceId: string, userId: string) {
  const [member] = await db
    .select()
    .from(workspace_members)
    .where(and(eq(workspace_members.workspace_id, workspaceId), eq(workspace_members.user_id, userId)))
  return !!member
}

// Grading run history for a certificate (most recent first). Each grading row
// carries the rule-level results (rule, passed, detail) in `results`.
router.get('/certificate/:certificateId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const certificateId = c.req.param('certificateId')
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, certificateId))
  if (!cert) return c.json({ error: 'Certificate not found' }, 404)
  if (!(await isMember(cert.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(gradings)
    .where(eq(gradings.certificate_id, certificateId))
    .orderBy(desc(gradings.created_at))
  return c.json(rows)
})

// Single grading detail with full rule results.
router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [grading] = await db.select().from(gradings).where(eq(gradings.id, id))
  if (!grading) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(grading.workspace_id, userId))) return c.json({ error: 'Forbidden' }, 403)
  return c.json(grading)
})

export default router
