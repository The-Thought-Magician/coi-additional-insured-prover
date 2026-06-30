import { Hono } from 'hono'
import { db } from '../db/index.js'
import { reason_codes } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const router = new Hono()

// GET / — public read-only: full deficiency reason-code catalog.
router.get('/', async (c) => {
  const all = await db.select().from(reason_codes).orderBy(reason_codes.id)
  return c.json(all)
})

// GET /:id — public read-only: a single reason code by its (text) id.
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [rc] = await db.select().from(reason_codes).where(eq(reason_codes.id, id))
  if (!rc) return c.json({ error: 'Not found' }, 404)
  return c.json(rc)
})

export default router
