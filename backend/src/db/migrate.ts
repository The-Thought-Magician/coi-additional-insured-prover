import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  // -------------------------------------------------------------------------
  // Tenancy
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    invite_code text NOT NULL UNIQUE,
    created_by text NOT NULL,
    default_gl_each_occurrence integer NOT NULL DEFAULT 1000000,
    default_gl_aggregate integer NOT NULL DEFAULT 2000000,
    require_pnc_default boolean NOT NULL DEFAULT true,
    require_waiver_default boolean NOT NULL DEFAULT true,
    fiscal_year_start_month integer NOT NULL DEFAULT 1,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS workspace_members (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'reviewer',
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
  )`,

  // -------------------------------------------------------------------------
  // Requirement templates (created before projects/certificates that FK them)
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS requirement_templates (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    applies_to_risk_tier text,
    require_ai_ongoing boolean NOT NULL DEFAULT true,
    require_ai_completed boolean NOT NULL DEFAULT true,
    accept_blanket_ai boolean NOT NULL DEFAULT true,
    require_pnc boolean NOT NULL DEFAULT true,
    require_waiver_subrogation boolean NOT NULL DEFAULT true,
    min_carrier_am_best text,
    is_active boolean NOT NULL DEFAULT true,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS template_line_requirements (
    id text PRIMARY KEY,
    template_id text NOT NULL REFERENCES requirement_templates(id),
    coverage_type text NOT NULL,
    required boolean NOT NULL DEFAULT true,
    min_each_occurrence integer,
    min_aggregate integer,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (template_id, coverage_type)
  )`,

  // -------------------------------------------------------------------------
  // Vendors / Projects
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS vendors (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    legal_name text NOT NULL,
    dba text,
    trade text,
    ein text,
    contact_name text,
    contact_email text,
    contact_phone text,
    address text,
    status text NOT NULL DEFAULT 'active',
    risk_tier text NOT NULL DEFAULT 'medium',
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    name text NOT NULL,
    address text,
    owner_developer text,
    lender text,
    prime_contract_ref text,
    template_id text REFERENCES requirement_templates(id),
    lender_mandated boolean NOT NULL DEFAULT false,
    holder_entity_text text,
    start_date timestamptz,
    end_date timestamptz,
    status text NOT NULL DEFAULT 'active',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS vendor_project_assignments (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    vendor_id text NOT NULL REFERENCES vendors(id),
    project_id text NOT NULL REFERENCES projects(id),
    onsite_start timestamptz,
    onsite_end timestamptz,
    scope_of_work text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vendor_id, project_id)
  )`,

  // -------------------------------------------------------------------------
  // Certificates & parsing
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS certificates (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    vendor_id text NOT NULL REFERENCES vendors(id),
    project_id text REFERENCES projects(id),
    template_id text REFERENCES requirement_templates(id),
    template_version integer,
    holder_text text,
    producer text,
    insured_name text,
    description_of_operations text,
    issue_date timestamptz,
    status text NOT NULL DEFAULT 'pending',
    compliance_status text NOT NULL DEFAULT 'pending',
    source text NOT NULL DEFAULT 'manual',
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS coverage_lines (
    id text PRIMARY KEY,
    certificate_id text NOT NULL REFERENCES certificates(id),
    coverage_type text NOT NULL,
    carrier_name text,
    carrier_naic text,
    policy_number text,
    effective_date timestamptz,
    expiry_date timestamptz,
    each_occurrence integer,
    aggregate_limit integer,
    additional_insured_box boolean NOT NULL DEFAULT false,
    subrogation_waived_box boolean NOT NULL DEFAULT false,
    pnc_box boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS endorsements (
    id text PRIMARY KEY,
    certificate_id text NOT NULL REFERENCES certificates(id),
    form_number text NOT NULL,
    edition_date text,
    endorsement_type text NOT NULL,
    coverage_type text,
    scope text,
    is_blanket boolean NOT NULL DEFAULT false,
    scheduled_holder_text text,
    provided boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // -------------------------------------------------------------------------
  // Grading & deficiencies
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS gradings (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    certificate_id text NOT NULL REFERENCES certificates(id),
    template_id text REFERENCES requirement_templates(id),
    template_version integer,
    overall_status text NOT NULL,
    score real,
    passed_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    results jsonb DEFAULT '[]'::jsonb,
    graded_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS reason_codes (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    default_severity text NOT NULL DEFAULT 'high',
    remediation text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS deficiencies (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    certificate_id text NOT NULL REFERENCES certificates(id),
    grading_id text REFERENCES gradings(id),
    reason_code text NOT NULL REFERENCES reason_codes(id),
    severity text NOT NULL DEFAULT 'high',
    detail text,
    status text NOT NULL DEFAULT 'open',
    assigned_to text,
    due_date timestamptz,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS coverage_gaps (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    assignment_id text NOT NULL REFERENCES vendor_project_assignments(id),
    vendor_id text NOT NULL REFERENCES vendors(id),
    project_id text NOT NULL REFERENCES projects(id),
    coverage_type text NOT NULL,
    gap_start timestamptz NOT NULL,
    gap_end timestamptz NOT NULL,
    gap_days integer NOT NULL,
    worked_uninsured boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // -------------------------------------------------------------------------
  // Evidence, carriers, waivers
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS evidence_packs (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    vendor_id text REFERENCES vendors(id),
    project_id text REFERENCES projects(id),
    certificate_id text REFERENCES certificates(id),
    title text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb,
    generated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS carriers (
    id text PRIMARY KEY,
    name text NOT NULL,
    naic text,
    am_best_rating text,
    admitted boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (naic)
  )`,

  `CREATE TABLE IF NOT EXISTS waivers (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    deficiency_id text NOT NULL REFERENCES deficiencies(id),
    justification text NOT NULL,
    waived_by text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // -------------------------------------------------------------------------
  // Renewals, notifications, tasks, activity, attachments, saved views
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS renewal_reminders (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    vendor_id text NOT NULL REFERENCES vendors(id),
    certificate_id text REFERENCES certificates(id),
    coverage_type text,
    expiry_date timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    requested_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    title text NOT NULL,
    description text,
    task_type text NOT NULL DEFAULT 'follow_up',
    status text NOT NULL DEFAULT 'open',
    assigned_to text,
    due_date timestamptz,
    vendor_id text REFERENCES vendors(id),
    project_id text REFERENCES projects(id),
    certificate_id text REFERENCES certificates(id),
    deficiency_id text REFERENCES deficiencies(id),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    actor_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    certificate_id text REFERENCES certificates(id),
    filename text NOT NULL,
    file_type text,
    url text,
    uploaded_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS saved_views (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    entity text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // -------------------------------------------------------------------------
  // Billing
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  // -------------------------------------------------------------------------
  // Indexes on FKs / workspace_id
  // -------------------------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_requirement_templates_workspace ON requirement_templates(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_template_line_requirements_template ON template_line_requirements(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vendors_workspace ON vendors(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_template ON projects(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vpa_workspace ON vendor_project_assignments(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vpa_vendor ON vendor_project_assignments(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vpa_project ON vendor_project_assignments(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_certificates_workspace ON certificates(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_certificates_vendor ON certificates(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_certificates_project ON certificates(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coverage_lines_certificate ON coverage_lines(certificate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_endorsements_certificate ON endorsements(certificate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gradings_workspace ON gradings(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gradings_certificate ON gradings(certificate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deficiencies_workspace ON deficiencies(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deficiencies_certificate ON deficiencies(certificate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deficiencies_reason ON deficiencies(reason_code)`,
  `CREATE INDEX IF NOT EXISTS idx_coverage_gaps_workspace ON coverage_gaps(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coverage_gaps_assignment ON coverage_gaps(assignment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_packs_workspace ON evidence_packs(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_waivers_workspace ON waivers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_waivers_deficiency ON waivers(deficiency_id)`,
  `CREATE INDEX IF NOT EXISTS idx_renewal_reminders_workspace ON renewal_reminders(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_renewal_reminders_vendor ON renewal_reminders(vendor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_log_workspace ON activity_log(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_workspace ON attachments(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_certificate ON attachments(certificate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_views_workspace ON saved_views(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  console.log(`Applied ${statements.length} migration statements`)
}
