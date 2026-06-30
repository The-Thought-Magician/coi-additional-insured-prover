import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { carriers } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const carrierSchema = z.object({
  name: z.string().min(1),
  naic: z.string().min(1).optional().nullable(),
  am_best_rating: z.string().optional().nullable(),
  admitted: z.boolean().optional().default(true),
})

// Public read: carrier/rating registry
router.get('/', async (c) => {
  const all = await db.select().from(carriers).orderBy(carriers.name)
  return c.json(all)
})

// Public read: single carrier
router.get('/:id', async (c) => {
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, c.req.param('id')))
  if (!carrier) return c.json({ error: 'Not found' }, 404)
  return c.json(carrier)
})

// Auth: add carrier
router.post('/', authMiddleware, zValidator('json', carrierSchema), async (c) => {
  getUserId(c)
  const body = c.req.valid('json')
  try {
    const [created] = await db
      .insert(carriers)
      .values({
        name: body.name,
        naic: body.naic ?? null,
        am_best_rating: body.am_best_rating ?? null,
        admitted: body.admitted ?? true,
      })
      .returning()
    return c.json(created, 201)
  } catch {
    return c.json({ error: 'Carrier with this NAIC already exists' }, 409)
  }
})

// Auth: update carrier
router.put('/:id', authMiddleware, zValidator('json', carrierSchema.partial()), async (c) => {
  getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(carriers).where(eq(carriers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')
  const [updated] = await db.update(carriers).set(body).where(eq(carriers.id, id)).returning()
  return c.json(updated)
})

// Auth: delete carrier
router.delete('/:id', authMiddleware, async (c) => {
  getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(carriers).where(eq(carriers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await db.delete(carriers).where(eq(carriers.id, id))
  return c.json({ success: true })
})

export default router
