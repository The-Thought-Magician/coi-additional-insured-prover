import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  invite_code: text('invite_code').notNull().unique(),
  created_by: text('created_by').notNull(),
  default_gl_each_occurrence: integer('default_gl_each_occurrence').default(1000000).notNull(),
  default_gl_aggregate: integer('default_gl_aggregate').default(2000000).notNull(),
  require_pnc_default: boolean('require_pnc_default').default(true).notNull(),
  require_waiver_default: boolean('require_waiver_default').default(true).notNull(),
  fiscal_year_start_month: integer('fiscal_year_start_month').default(1).notNull(),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const workspace_members = pgTable('workspace_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  role: text('role').notNull().default('reviewer'),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
}, (t) => [unique().on(t.workspace_id, t.user_id)])

// ---------------------------------------------------------------------------
// Vendors / Projects
// ---------------------------------------------------------------------------

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  legal_name: text('legal_name').notNull(),
  dba: text('dba'),
  trade: text('trade'),
  ein: text('ein'),
  contact_name: text('contact_name'),
  contact_email: text('contact_email'),
  contact_phone: text('contact_phone'),
  address: text('address'),
  status: text('status').notNull().default('active'),
  risk_tier: text('risk_tier').notNull().default('medium'),
  tags: jsonb('tags').$type<string[]>().default([]),
  notes: text('notes'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const projects = pgTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  address: text('address'),
  owner_developer: text('owner_developer'),
  lender: text('lender'),
  prime_contract_ref: text('prime_contract_ref'),
  template_id: text('template_id').references(() => requirement_templates.id),
  lender_mandated: boolean('lender_mandated').default(false).notNull(),
  holder_entity_text: text('holder_entity_text'),
  start_date: timestamp('start_date'),
  end_date: timestamp('end_date'),
  status: text('status').notNull().default('active'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const vendor_project_assignments = pgTable('vendor_project_assignments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  vendor_id: text('vendor_id').notNull().references(() => vendors.id),
  project_id: text('project_id').notNull().references(() => projects.id),
  onsite_start: timestamp('onsite_start'),
  onsite_end: timestamp('onsite_end'),
  scope_of_work: text('scope_of_work'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.vendor_id, t.project_id)])

// ---------------------------------------------------------------------------
// Requirement templates
// ---------------------------------------------------------------------------

export const requirement_templates = pgTable('requirement_templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  description: text('description'),
  version: integer('version').notNull().default(1),
  applies_to_risk_tier: text('applies_to_risk_tier'),
  require_ai_ongoing: boolean('require_ai_ongoing').default(true).notNull(),
  require_ai_completed: boolean('require_ai_completed').default(true).notNull(),
  accept_blanket_ai: boolean('accept_blanket_ai').default(true).notNull(),
  require_pnc: boolean('require_pnc').default(true).notNull(),
  require_waiver_subrogation: boolean('require_waiver_subrogation').default(true).notNull(),
  min_carrier_am_best: text('min_carrier_am_best'),
  is_active: boolean('is_active').default(true).notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const template_line_requirements = pgTable('template_line_requirements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  template_id: text('template_id').notNull().references(() => requirement_templates.id),
  coverage_type: text('coverage_type').notNull(),
  required: boolean('required').default(true).notNull(),
  min_each_occurrence: integer('min_each_occurrence'),
  min_aggregate: integer('min_aggregate'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.template_id, t.coverage_type)])

// ---------------------------------------------------------------------------
// Certificates & parsing
// ---------------------------------------------------------------------------

export const certificates = pgTable('certificates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  vendor_id: text('vendor_id').notNull().references(() => vendors.id),
  project_id: text('project_id').references(() => projects.id),
  template_id: text('template_id').references(() => requirement_templates.id),
  template_version: integer('template_version'),
  holder_text: text('holder_text'),
  producer: text('producer'),
  insured_name: text('insured_name'),
  description_of_operations: text('description_of_operations'),
  issue_date: timestamp('issue_date'),
  status: text('status').notNull().default('pending'),
  compliance_status: text('compliance_status').notNull().default('pending'),
  source: text('source').notNull().default('manual'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const coverage_lines = pgTable('coverage_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  certificate_id: text('certificate_id').notNull().references(() => certificates.id),
  coverage_type: text('coverage_type').notNull(),
  carrier_name: text('carrier_name'),
  carrier_naic: text('carrier_naic'),
  policy_number: text('policy_number'),
  effective_date: timestamp('effective_date'),
  expiry_date: timestamp('expiry_date'),
  each_occurrence: integer('each_occurrence'),
  aggregate_limit: integer('aggregate_limit'),
  additional_insured_box: boolean('additional_insured_box').default(false).notNull(),
  subrogation_waived_box: boolean('subrogation_waived_box').default(false).notNull(),
  pnc_box: boolean('pnc_box').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const endorsements = pgTable('endorsements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  certificate_id: text('certificate_id').notNull().references(() => certificates.id),
  form_number: text('form_number').notNull(),
  edition_date: text('edition_date'),
  endorsement_type: text('endorsement_type').notNull(),
  coverage_type: text('coverage_type'),
  scope: text('scope'),
  is_blanket: boolean('is_blanket').default(false).notNull(),
  scheduled_holder_text: text('scheduled_holder_text'),
  provided: boolean('provided').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Grading & deficiencies
// ---------------------------------------------------------------------------

export const gradings = pgTable('gradings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  certificate_id: text('certificate_id').notNull().references(() => certificates.id),
  template_id: text('template_id').references(() => requirement_templates.id),
  template_version: integer('template_version'),
  overall_status: text('overall_status').notNull(),
  score: real('score'),
  passed_count: integer('passed_count').default(0).notNull(),
  failed_count: integer('failed_count').default(0).notNull(),
  results: jsonb('results').$type<Array<{ rule: string; passed: boolean; detail: string }>>().default([]),
  graded_by: text('graded_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const reason_codes = pgTable('reason_codes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  default_severity: text('default_severity').notNull().default('high'),
  remediation: text('remediation'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const deficiencies = pgTable('deficiencies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  certificate_id: text('certificate_id').notNull().references(() => certificates.id),
  grading_id: text('grading_id').references(() => gradings.id),
  reason_code: text('reason_code').notNull().references(() => reason_codes.id),
  severity: text('severity').notNull().default('high'),
  detail: text('detail'),
  status: text('status').notNull().default('open'),
  assigned_to: text('assigned_to'),
  due_date: timestamp('due_date'),
  resolved_at: timestamp('resolved_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const coverage_gaps = pgTable('coverage_gaps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  assignment_id: text('assignment_id').notNull().references(() => vendor_project_assignments.id),
  vendor_id: text('vendor_id').notNull().references(() => vendors.id),
  project_id: text('project_id').notNull().references(() => projects.id),
  coverage_type: text('coverage_type').notNull(),
  gap_start: timestamp('gap_start').notNull(),
  gap_end: timestamp('gap_end').notNull(),
  gap_days: integer('gap_days').notNull(),
  worked_uninsured: boolean('worked_uninsured').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Evidence, carriers, waivers
// ---------------------------------------------------------------------------

export const evidence_packs = pgTable('evidence_packs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  vendor_id: text('vendor_id').references(() => vendors.id),
  project_id: text('project_id').references(() => projects.id),
  certificate_id: text('certificate_id').references(() => certificates.id),
  title: text('title').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().default({}),
  generated_by: text('generated_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const carriers = pgTable('carriers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  naic: text('naic'),
  am_best_rating: text('am_best_rating'),
  admitted: boolean('admitted').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.naic)])

export const waivers = pgTable('waivers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  deficiency_id: text('deficiency_id').notNull().references(() => deficiencies.id),
  justification: text('justification').notNull(),
  waived_by: text('waived_by').notNull(),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Renewals, notifications, tasks, activity, attachments, saved views
// ---------------------------------------------------------------------------

export const renewal_reminders = pgTable('renewal_reminders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  vendor_id: text('vendor_id').notNull().references(() => vendors.id),
  certificate_id: text('certificate_id').references(() => certificates.id),
  coverage_type: text('coverage_type'),
  expiry_date: timestamp('expiry_date').notNull(),
  status: text('status').notNull().default('pending'),
  requested_at: timestamp('requested_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  link: text('link'),
  read: boolean('read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  description: text('description'),
  task_type: text('task_type').notNull().default('follow_up'),
  status: text('status').notNull().default('open'),
  assigned_to: text('assigned_to'),
  due_date: timestamp('due_date'),
  vendor_id: text('vendor_id').references(() => vendors.id),
  project_id: text('project_id').references(() => projects.id),
  certificate_id: text('certificate_id').references(() => certificates.id),
  deficiency_id: text('deficiency_id').references(() => deficiencies.id),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const activity_log = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  actor_id: text('actor_id').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  certificate_id: text('certificate_id').references(() => certificates.id),
  filename: text('filename').notNull(),
  file_type: text('file_type'),
  url: text('url'),
  uploaded_by: text('uploaded_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const saved_views = pgTable('saved_views', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  entity: text('entity').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free'),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
