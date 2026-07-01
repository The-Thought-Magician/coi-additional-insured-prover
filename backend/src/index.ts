process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (ignored):', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (ignored):', err)
})

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import { plans, reason_codes, workspaces, workspace_members, carriers } from './db/schema.js'

import workspacesRoutes from './routes/workspaces.js'
import vendorsRoutes from './routes/vendors.js'
import projectsRoutes from './routes/projects.js'
import templatesRoutes from './routes/templates.js'
import certificatesRoutes from './routes/certificates.js'
import coverageLinesRoutes from './routes/coverageLines.js'
import endorsementsRoutes from './routes/endorsements.js'
import gradingsRoutes from './routes/gradings.js'
import deficienciesRoutes from './routes/deficiencies.js'
import reasonCodesRoutes from './routes/reasonCodes.js'
import coverageGapsRoutes from './routes/coverageGaps.js'
import evidencePacksRoutes from './routes/evidencePacks.js'
import carriersRoutes from './routes/carriers.js'
import waiversRoutes from './routes/waivers.js'
import renewalsRoutes from './routes/renewals.js'
import notificationsRoutes from './routes/notifications.js'
import tasksRoutes from './routes/tasks.js'
import reportsRoutes from './routes/reports.js'
import activityRoutes from './routes/activity.js'
import attachmentsRoutes from './routes/attachments.js'
import savedViewsRoutes from './routes/savedViews.js'
import seedRoutes from './routes/seed.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://coi-additional-insured-prover-ventures.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const seedPlans = [
  { id: 'free', name: 'Free', price_cents: 0 },
  { id: 'pro', name: 'Pro', price_cents: 4900 },
]

const seedReasonCodes = [
  {
    id: 'AI_ONGOING_MISSING',
    title: 'Additional Insured (ongoing operations) missing',
    description:
      'No CG 20 10 (or equivalent) endorsement granting additional insured status for ongoing operations.',
    default_severity: 'high',
    remediation: 'Request CG 20 10 endorsement naming the certificate holder as additional insured.',
  },
  {
    id: 'AI_COMPLETED_MISSING',
    title: 'Additional Insured (completed operations) missing',
    description:
      'No CG 20 37 (or equivalent) endorsement extending additional insured status to completed operations.',
    default_severity: 'high',
    remediation: 'Request CG 20 37 endorsement covering completed operations.',
  },
  {
    id: 'PNC_MISSING',
    title: 'Primary & Non-Contributory wording missing',
    description: 'Policy does not include primary and non-contributory language for the additional insured.',
    default_severity: 'high',
    remediation: 'Obtain a primary & non-contributory endorsement (e.g. CG 20 01).',
  },
  {
    id: 'WAIVER_SUBROGATION_MISSING',
    title: 'Waiver of subrogation missing',
    description: 'No waiver of transfer of rights of recovery (subrogation) in favor of the holder.',
    default_severity: 'medium',
    remediation: 'Request a waiver of subrogation endorsement (e.g. CG 24 04).',
  },
  {
    id: 'LIMIT_BELOW_MINIMUM',
    title: 'Coverage limit below required minimum',
    description: 'Each-occurrence or aggregate limit is below the template requirement.',
    default_severity: 'high',
    remediation: 'Request increased limits or supplemental/umbrella coverage.',
  },
  {
    id: 'COVERAGE_EXPIRED',
    title: 'Coverage expired or lapsed',
    description: 'A required coverage line has an expiry date in the past.',
    default_severity: 'high',
    remediation: 'Obtain a renewed certificate with current effective/expiry dates.',
  },
  {
    id: 'CARRIER_RATING_LOW',
    title: 'Carrier rating below minimum',
    description: 'Issuing carrier AM Best rating is below the template-required minimum.',
    default_severity: 'medium',
    remediation: 'Place coverage with a carrier meeting the minimum AM Best rating.',
  },
  {
    id: 'HOLDER_NOT_SCHEDULED',
    title: 'Holder not scheduled / blanket not accepted',
    description: 'Additional insured is scheduled but does not name the holder, and blanket AI is not accepted.',
    default_severity: 'medium',
    remediation: 'Add the holder to the schedule or provide an acceptable blanket AI endorsement.',
  },
  {
    id: 'COVERAGE_TYPE_MISSING',
    title: 'Required coverage type not provided',
    description: 'A coverage type required by the template is absent from the certificate.',
    default_severity: 'high',
    remediation: 'Provide a certificate including the missing coverage type.',
  },
]

const seedCarriers = [
  { name: 'Travelers', naic: '25658', am_best_rating: 'A++', admitted: true },
  { name: 'The Hartford', naic: '19682', am_best_rating: 'A+', admitted: true },
  { name: 'Liberty Mutual', naic: '23043', am_best_rating: 'A', admitted: true },
  { name: 'Zurich American', naic: '16535', am_best_rating: 'A+', admitted: true },
  { name: 'Chubb', naic: '20281', am_best_rating: 'A++', admitted: true },
]

async function seedIfEmpty() {
  // Plans
  try {
    const existing = await db.select().from(plans).limit(1)
    if (existing.length === 0) {
      for (const p of seedPlans) await db.insert(plans).values(p as any)
      console.log('Seeded plans')
    }
  } catch (e) {
    console.error('Seed plans error:', e)
  }

  // Reason codes
  try {
    const existing = await db.select().from(reason_codes).limit(1)
    if (existing.length === 0) {
      for (const r of seedReasonCodes) await db.insert(reason_codes).values(r as any)
      console.log('Seeded reason codes')
    }
  } catch (e) {
    console.error('Seed reason codes error:', e)
  }

  // Carriers (global registry)
  try {
    const existing = await db.select().from(carriers).limit(1)
    if (existing.length === 0) {
      for (const cr of seedCarriers) await db.insert(carriers).values(cr as any)
      console.log('Seeded carriers')
    }
  } catch (e) {
    console.error('Seed carriers error:', e)
  }

  // Demo workspace
  try {
    const existing = await db.select().from(workspaces).limit(1)
    if (existing.length === 0) {
      const [ws] = await db
        .insert(workspaces)
        .values({ name: 'Demo Workspace', invite_code: 'DEMO-COI', created_by: 'demo-user' } as any)
        .returning()
      if (ws) {
        await db
          .insert(workspace_members)
          .values({ workspace_id: ws.id, user_id: 'demo-user', role: 'owner' } as any)
      }
      console.log('Seeded demo workspace')
    }
  } catch (e) {
    console.error('Seed workspace error:', e)
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const api = new Hono()
api.route('/workspaces', workspacesRoutes)
api.route('/vendors', vendorsRoutes)
api.route('/projects', projectsRoutes)
api.route('/templates', templatesRoutes)
api.route('/certificates', certificatesRoutes)
api.route('/coverage-lines', coverageLinesRoutes)
api.route('/endorsements', endorsementsRoutes)
api.route('/gradings', gradingsRoutes)
api.route('/deficiencies', deficienciesRoutes)
api.route('/reason-codes', reasonCodesRoutes)
api.route('/coverage-gaps', coverageGapsRoutes)
api.route('/evidence-packs', evidencePacksRoutes)
api.route('/carriers', carriersRoutes)
api.route('/waivers', waiversRoutes)
api.route('/renewals', renewalsRoutes)
api.route('/notifications', notificationsRoutes)
api.route('/tasks', tasksRoutes)
api.route('/reports', reportsRoutes)
api.route('/activity', activityRoutes)
api.route('/attachments', attachmentsRoutes)
api.route('/saved-views', savedViewsRoutes)
api.route('/seed', seedRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// ---------------------------------------------------------------------------
// Boot — bind the port FIRST so the platform health check sees a live service
// immediately, THEN run migrate() + seedIfEmpty() (each idempotent and isolated
// in its own try/catch). Never block serve() on a cold DB connection.
// ---------------------------------------------------------------------------

const port = parseInt(process.env.PORT ?? '3001')

serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

;(async () => {
  try {
    await migrate()
  } catch (e) {
    console.error('Migration error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
})()

export default app
