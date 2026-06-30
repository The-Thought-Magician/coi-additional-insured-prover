import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  workspaces,
  workspace_members,
  vendors,
  projects,
  vendor_project_assignments,
  requirement_templates,
  template_line_requirements,
  certificates,
  coverage_lines,
  endorsements,
  carriers,
  gradings,
  deficiencies,
  reason_codes,
} from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Resolve the user's active workspace. If they have no membership yet, create a
// fresh "Sample GC" workspace and enroll them as owner. This keeps /seed/sample
// fully self-contained so the seeder always has a tenant to write into.
async function resolveWorkspace(userId: string): Promise<{ id: string; created: boolean }> {
  const [membership] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
    .limit(1)

  if (membership) return { id: membership.workspace_id, created: false }

  const invite = `WS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const [ws] = await db
    .insert(workspaces)
    .values({ name: 'Sample GC Portfolio', invite_code: invite, created_by: userId })
    .returning()
  await db
    .insert(workspace_members)
    .values({ workspace_id: ws.id, user_id: userId, role: 'owner' })
  return { id: ws.id, created: true }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

// Count rows in the major tables for a workspace, used by both /sample and /status.
async function workspaceCounts(workspaceId: string) {
  const [v, p, t, c, a] = await Promise.all([
    db.select().from(vendors).where(eq(vendors.workspace_id, workspaceId)),
    db.select().from(projects).where(eq(projects.workspace_id, workspaceId)),
    db.select().from(requirement_templates).where(eq(requirement_templates.workspace_id, workspaceId)),
    db.select().from(certificates).where(eq(certificates.workspace_id, workspaceId)),
    db
      .select()
      .from(vendor_project_assignments)
      .where(eq(vendor_project_assignments.workspace_id, workspaceId)),
  ])
  return {
    vendors: v.length,
    projects: p.length,
    templates: t.length,
    certificates: c.length,
    assignments: a.length,
  }
}

// ---------------------------------------------------------------------------
// POST /sample — seed a realistic GC subcontractor portfolio
// ---------------------------------------------------------------------------

router.post('/sample', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const { id: workspaceId } = await resolveWorkspace(userId)

  // Idempotency guard: if the workspace already has vendors, don't double-seed.
  const existingVendors = await db
    .select()
    .from(vendors)
    .where(eq(vendors.workspace_id, workspaceId))
    .limit(1)
  if (existingVendors.length > 0) {
    const counts = await workspaceCounts(workspaceId)
    return c.json({ seeded: false, already_seeded: true, counts })
  }

  // --- Global carrier registry (shared, not workspace-scoped). Upsert by NAIC. ---
  const carrierRows = [
    { name: 'Travelers Indemnity Co.', naic: '25658', am_best_rating: 'A++', admitted: true },
    { name: 'The Hartford', naic: '19682', am_best_rating: 'A+', admitted: true },
    { name: 'Liberty Mutual', naic: '23043', am_best_rating: 'A', admitted: true },
    { name: 'Nautilus Insurance Co.', naic: '17370', am_best_rating: 'A+', admitted: false },
    { name: 'Acme Surplus Lines', naic: '99001', am_best_rating: 'B++', admitted: false },
  ]
  for (const cr of carrierRows) {
    await db
      .insert(carriers)
      .values(cr)
      .onConflictDoUpdate({
        target: carriers.naic,
        set: { name: cr.name, am_best_rating: cr.am_best_rating, admitted: cr.admitted },
      })
  }

  // --- Requirement templates ---
  const [standardTpl] = await db
    .insert(requirement_templates)
    .values({
      workspace_id: workspaceId,
      name: 'Standard Subcontractor Requirements',
      description: 'Baseline GL/Auto/WC requirements for standard-risk trades.',
      version: 1,
      applies_to_risk_tier: 'medium',
      require_ai_ongoing: true,
      require_ai_completed: true,
      accept_blanket_ai: true,
      require_pnc: true,
      require_waiver_subrogation: true,
      min_carrier_am_best: 'A-',
      is_active: true,
      created_by: userId,
    })
    .returning()

  const [highRiskTpl] = await db
    .insert(requirement_templates)
    .values({
      workspace_id: workspaceId,
      name: 'High-Risk Trade Requirements',
      description: 'Elevated limits for steel, crane, and roofing scopes.',
      version: 1,
      applies_to_risk_tier: 'high',
      require_ai_ongoing: true,
      require_ai_completed: true,
      accept_blanket_ai: false,
      require_pnc: true,
      require_waiver_subrogation: true,
      min_carrier_am_best: 'A',
      is_active: true,
      created_by: userId,
    })
    .returning()

  await db.insert(template_line_requirements).values([
    {
      template_id: standardTpl.id,
      coverage_type: 'general_liability',
      required: true,
      min_each_occurrence: 1000000,
      min_aggregate: 2000000,
      notes: 'CGL on ISO occurrence form.',
    },
    {
      template_id: standardTpl.id,
      coverage_type: 'auto_liability',
      required: true,
      min_each_occurrence: 1000000,
      min_aggregate: null,
      notes: 'Combined single limit, any auto.',
    },
    {
      template_id: standardTpl.id,
      coverage_type: 'workers_comp',
      required: true,
      min_each_occurrence: 1000000,
      min_aggregate: null,
      notes: 'Statutory + employers liability.',
    },
    {
      template_id: highRiskTpl.id,
      coverage_type: 'general_liability',
      required: true,
      min_each_occurrence: 2000000,
      min_aggregate: 4000000,
      notes: 'Higher limits; no blanket AI accepted.',
    },
    {
      template_id: highRiskTpl.id,
      coverage_type: 'umbrella',
      required: true,
      min_each_occurrence: 5000000,
      min_aggregate: 5000000,
      notes: 'Follow-form excess.',
    },
    {
      template_id: highRiskTpl.id,
      coverage_type: 'workers_comp',
      required: true,
      min_each_occurrence: 1000000,
      min_aggregate: null,
      notes: 'Statutory + employers liability.',
    },
  ])

  // --- Projects ---
  const [towerProj] = await db
    .insert(projects)
    .values({
      workspace_id: workspaceId,
      name: 'Riverfront Tower — Phase 2',
      address: '400 Riverside Dr, Austin, TX',
      owner_developer: 'Riverfront Holdings LLC',
      lender: 'First National Construction Lending',
      prime_contract_ref: 'PC-2025-0142',
      template_id: highRiskTpl.id,
      lender_mandated: true,
      holder_entity_text:
        'Riverfront Holdings LLC, its members, managers, and First National Construction Lending, as their interests may appear',
      start_date: daysFromNow(-120),
      end_date: daysFromNow(240),
      status: 'active',
      created_by: userId,
    })
    .returning()

  const [retailProj] = await db
    .insert(projects)
    .values({
      workspace_id: workspaceId,
      name: 'Maple Square Retail Buildout',
      address: '88 Maple Square, Round Rock, TX',
      owner_developer: 'Maple Square Partners',
      lender: null,
      prime_contract_ref: 'PC-2025-0207',
      template_id: standardTpl.id,
      lender_mandated: false,
      holder_entity_text: 'Maple Square Partners and General Contractor Inc.',
      start_date: daysFromNow(-60),
      end_date: daysFromNow(120),
      status: 'active',
      created_by: userId,
    })
    .returning()

  // --- Vendors ---
  const vendorSeed = [
    {
      legal_name: 'Apex Steel Erectors Inc.',
      dba: 'Apex Steel',
      trade: 'Structural Steel',
      ein: '74-2210045',
      contact_name: 'Marcus Reed',
      contact_email: 'mreed@apexsteel.example',
      contact_phone: '512-555-0140',
      address: '1200 Industrial Pkwy, Austin, TX',
      status: 'active',
      risk_tier: 'high',
      tags: ['steel', 'critical-path'],
      notes: 'Primary steel erector on tower.',
    },
    {
      legal_name: 'Lone Star Electrical LLC',
      dba: null,
      trade: 'Electrical',
      ein: '74-3091122',
      contact_name: 'Dana Whitfield',
      contact_email: 'dana@lonestarelec.example',
      contact_phone: '512-555-0188',
      address: '55 Commerce St, Pflugerville, TX',
      status: 'active',
      risk_tier: 'medium',
      tags: ['electrical'],
      notes: null,
    },
    {
      legal_name: 'Summit Roofing Systems Inc.',
      dba: 'Summit Roofing',
      trade: 'Roofing',
      ein: '74-4456781',
      contact_name: 'Olivia Tran',
      contact_email: 'olivia@summitroof.example',
      contact_phone: '512-555-0211',
      address: '910 Highline Rd, Cedar Park, TX',
      status: 'active',
      risk_tier: 'high',
      tags: ['roofing', 'heights'],
      notes: 'Watch AI endorsement — blanket not accepted on tower.',
    },
    {
      legal_name: 'Clearview Glazing Co.',
      dba: null,
      trade: 'Glazing',
      ein: '74-5567802',
      contact_name: 'Henry Ola',
      contact_email: 'henry@clearviewglaze.example',
      contact_phone: '512-555-0260',
      address: '230 Curtainwall Ave, Austin, TX',
      status: 'active',
      risk_tier: 'medium',
      tags: ['glazing'],
      notes: null,
    },
    {
      legal_name: 'Greenline Landscaping LLC',
      dba: 'Greenline',
      trade: 'Landscaping',
      ein: '74-6678013',
      contact_name: 'Priya Nair',
      contact_email: 'priya@greenline.example',
      contact_phone: '512-555-0299',
      address: '14 Garden Loop, Round Rock, TX',
      status: 'active',
      risk_tier: 'low',
      tags: ['landscape', 'site'],
      notes: null,
    },
  ]

  const insertedVendors = await db
    .insert(vendors)
    .values(vendorSeed.map((v) => ({ ...v, workspace_id: workspaceId, created_by: userId })))
    .returning()

  const [apex, lonestar, summit, clearview, greenline] = insertedVendors

  // --- Assignments (vendor -> project) ---
  const insertedAssignments = await db
    .insert(vendor_project_assignments)
    .values([
      {
        workspace_id: workspaceId,
        vendor_id: apex.id,
        project_id: towerProj.id,
        onsite_start: daysFromNow(-100),
        onsite_end: daysFromNow(60),
        scope_of_work: 'Erect structural steel frame, floors 1-22.',
      },
      {
        workspace_id: workspaceId,
        vendor_id: summit.id,
        project_id: towerProj.id,
        onsite_start: daysFromNow(-30),
        onsite_end: daysFromNow(150),
        scope_of_work: 'Membrane roofing and parapet flashing.',
      },
      {
        workspace_id: workspaceId,
        vendor_id: clearview.id,
        project_id: towerProj.id,
        onsite_start: daysFromNow(10),
        onsite_end: daysFromNow(200),
        scope_of_work: 'Curtainwall and exterior glazing.',
      },
      {
        workspace_id: workspaceId,
        vendor_id: lonestar.id,
        project_id: retailProj.id,
        onsite_start: daysFromNow(-40),
        onsite_end: daysFromNow(90),
        scope_of_work: 'Tenant electrical rough-in and finish.',
      },
      {
        workspace_id: workspaceId,
        vendor_id: greenline.id,
        project_id: retailProj.id,
        onsite_start: daysFromNow(20),
        onsite_end: daysFromNow(100),
        scope_of_work: 'Site landscaping and irrigation.',
      },
    ])
    .returning()

  // --- Reason code catalog (seeded text PKs). Ensure the codes we reference exist. ---
  // These mirror the platform reason-code catalog; insert-if-missing so deficiencies
  // can reference them even on a fresh database.
  const reasonCatalog = [
    {
      id: 'AI_ONGOING_MISSING',
      title: 'Additional Insured (Ongoing) Missing',
      description: 'No CG 20 10 (or equivalent) ongoing-operations additional insured endorsement provided.',
      default_severity: 'high',
      remediation: 'Request CG 20 10 endorsement naming the holder and project.',
    },
    {
      id: 'GL_LIMIT_LOW',
      title: 'General Liability Limit Below Requirement',
      description: 'Each-occurrence or aggregate GL limit is below the template requirement.',
      default_severity: 'high',
      remediation: 'Obtain higher limits or an umbrella that satisfies the requirement.',
    },
    {
      id: 'WAIVER_SUBRO_MISSING',
      title: 'Waiver of Subrogation Missing',
      description: 'No waiver of subrogation in favor of the holder.',
      default_severity: 'medium',
      remediation: 'Request a blanket or scheduled waiver of subrogation endorsement.',
    },
    {
      id: 'COVERAGE_EXPIRED',
      title: 'Coverage Expired',
      description: 'A required coverage line has lapsed.',
      default_severity: 'high',
      remediation: 'Obtain a renewal certificate showing continuous coverage.',
    },
  ]
  // reason_codes table is referenced via FK by deficiencies; insert-if-missing.
  for (const rc of reasonCatalog) {
    await db.insert(reason_codes).values(rc).onConflictDoNothing({ target: reason_codes.id })
  }

  // --- Certificates with mixed compliance + nested coverage lines / endorsements ---
  // Cert 1: Apex Steel on Tower — COMPLIANT
  const [cert1] = await db
    .insert(certificates)
    .values({
      workspace_id: workspaceId,
      vendor_id: apex.id,
      project_id: towerProj.id,
      template_id: highRiskTpl.id,
      template_version: highRiskTpl.version,
      holder_text: towerProj.holder_entity_text,
      producer: 'Marsh & McLennan — Austin',
      insured_name: 'Apex Steel Erectors Inc.',
      description_of_operations:
        'Structural steel erection. Holder is additional insured per attached CG 20 10 / CG 20 37. Waiver of subrogation applies.',
      issue_date: daysFromNow(-90),
      status: 'active',
      compliance_status: 'compliant',
      source: 'manual',
      created_by: userId,
    })
    .returning()

  await db.insert(coverage_lines).values([
    {
      certificate_id: cert1.id,
      coverage_type: 'general_liability',
      carrier_name: 'Travelers Indemnity Co.',
      carrier_naic: '25658',
      policy_number: 'GL-APX-2025-001',
      effective_date: daysFromNow(-120),
      expiry_date: daysFromNow(245),
      each_occurrence: 2000000,
      aggregate_limit: 4000000,
      additional_insured_box: true,
      subrogation_waived_box: true,
      pnc_box: true,
    },
    {
      certificate_id: cert1.id,
      coverage_type: 'umbrella',
      carrier_name: 'Travelers Indemnity Co.',
      carrier_naic: '25658',
      policy_number: 'UMB-APX-2025-001',
      effective_date: daysFromNow(-120),
      expiry_date: daysFromNow(245),
      each_occurrence: 5000000,
      aggregate_limit: 5000000,
      additional_insured_box: true,
      subrogation_waived_box: true,
      pnc_box: true,
    },
    {
      certificate_id: cert1.id,
      coverage_type: 'workers_comp',
      carrier_name: 'The Hartford',
      carrier_naic: '19682',
      policy_number: 'WC-APX-2025-001',
      effective_date: daysFromNow(-120),
      expiry_date: daysFromNow(245),
      each_occurrence: 1000000,
      aggregate_limit: null,
      additional_insured_box: false,
      subrogation_waived_box: true,
      pnc_box: false,
    },
  ])

  await db.insert(endorsements).values([
    {
      certificate_id: cert1.id,
      form_number: 'CG 20 10',
      edition_date: '04 13',
      endorsement_type: 'additional_insured_ongoing',
      coverage_type: 'general_liability',
      scope: 'Additional insured — ongoing operations.',
      is_blanket: false,
      scheduled_holder_text: towerProj.holder_entity_text,
      provided: true,
    },
    {
      certificate_id: cert1.id,
      form_number: 'CG 20 37',
      edition_date: '04 13',
      endorsement_type: 'additional_insured_completed',
      coverage_type: 'general_liability',
      scope: 'Additional insured — completed operations.',
      is_blanket: false,
      scheduled_holder_text: towerProj.holder_entity_text,
      provided: true,
    },
    {
      certificate_id: cert1.id,
      form_number: 'CG 24 04',
      edition_date: '05 09',
      endorsement_type: 'waiver_of_subrogation',
      coverage_type: 'general_liability',
      scope: 'Blanket waiver of subrogation.',
      is_blanket: true,
      scheduled_holder_text: null,
      provided: true,
    },
  ])

  // Cert 2: Summit Roofing on Tower — DEFICIENT (blanket AI not accepted, GL low)
  const [cert2] = await db
    .insert(certificates)
    .values({
      workspace_id: workspaceId,
      vendor_id: summit.id,
      project_id: towerProj.id,
      template_id: highRiskTpl.id,
      template_version: highRiskTpl.version,
      holder_text: towerProj.holder_entity_text,
      producer: 'Hub International — Cedar Park',
      insured_name: 'Summit Roofing Systems Inc.',
      description_of_operations:
        'Membrane roofing. Blanket additional insured where required by written contract.',
      issue_date: daysFromNow(-25),
      status: 'active',
      compliance_status: 'deficient',
      source: 'manual',
      created_by: userId,
    })
    .returning()

  await db.insert(coverage_lines).values([
    {
      certificate_id: cert2.id,
      coverage_type: 'general_liability',
      carrier_name: 'Nautilus Insurance Co.',
      carrier_naic: '17370',
      policy_number: 'GL-SUM-2025-014',
      effective_date: daysFromNow(-30),
      expiry_date: daysFromNow(335),
      each_occurrence: 1000000,
      aggregate_limit: 2000000,
      additional_insured_box: true,
      subrogation_waived_box: false,
      pnc_box: false,
    },
    {
      certificate_id: cert2.id,
      coverage_type: 'workers_comp',
      carrier_name: 'Liberty Mutual',
      carrier_naic: '23043',
      policy_number: 'WC-SUM-2025-014',
      effective_date: daysFromNow(-30),
      expiry_date: daysFromNow(335),
      each_occurrence: 1000000,
      aggregate_limit: null,
      additional_insured_box: false,
      subrogation_waived_box: false,
      pnc_box: false,
    },
  ])

  await db.insert(endorsements).values([
    {
      certificate_id: cert2.id,
      form_number: 'CG 20 33',
      edition_date: '07 04',
      endorsement_type: 'additional_insured_ongoing',
      coverage_type: 'general_liability',
      scope: 'Blanket additional insured — ongoing operations (where required by contract).',
      is_blanket: true,
      scheduled_holder_text: null,
      provided: true,
    },
  ])

  // Cert 3: Lone Star Electrical on Retail — COMPLIANT
  const [cert3] = await db
    .insert(certificates)
    .values({
      workspace_id: workspaceId,
      vendor_id: lonestar.id,
      project_id: retailProj.id,
      template_id: standardTpl.id,
      template_version: standardTpl.version,
      holder_text: retailProj.holder_entity_text,
      producer: 'Lockton — Austin',
      insured_name: 'Lone Star Electrical LLC',
      description_of_operations:
        'Electrical contracting. Holder is additional insured on a primary and non-contributory basis. Waiver of subrogation applies.',
      issue_date: daysFromNow(-35),
      status: 'active',
      compliance_status: 'compliant',
      source: 'manual',
      created_by: userId,
    })
    .returning()

  await db.insert(coverage_lines).values([
    {
      certificate_id: cert3.id,
      coverage_type: 'general_liability',
      carrier_name: 'The Hartford',
      carrier_naic: '19682',
      policy_number: 'GL-LSE-2025-077',
      effective_date: daysFromNow(-45),
      expiry_date: daysFromNow(320),
      each_occurrence: 1000000,
      aggregate_limit: 2000000,
      additional_insured_box: true,
      subrogation_waived_box: true,
      pnc_box: true,
    },
    {
      certificate_id: cert3.id,
      coverage_type: 'auto_liability',
      carrier_name: 'The Hartford',
      carrier_naic: '19682',
      policy_number: 'AL-LSE-2025-077',
      effective_date: daysFromNow(-45),
      expiry_date: daysFromNow(320),
      each_occurrence: 1000000,
      aggregate_limit: null,
      additional_insured_box: true,
      subrogation_waived_box: true,
      pnc_box: false,
    },
    {
      certificate_id: cert3.id,
      coverage_type: 'workers_comp',
      carrier_name: 'Liberty Mutual',
      carrier_naic: '23043',
      policy_number: 'WC-LSE-2025-077',
      effective_date: daysFromNow(-45),
      expiry_date: daysFromNow(320),
      each_occurrence: 1000000,
      aggregate_limit: null,
      additional_insured_box: false,
      subrogation_waived_box: true,
      pnc_box: false,
    },
  ])

  await db.insert(endorsements).values([
    {
      certificate_id: cert3.id,
      form_number: 'CG 20 10',
      edition_date: '12 19',
      endorsement_type: 'additional_insured_ongoing',
      coverage_type: 'general_liability',
      scope: 'Additional insured — ongoing operations.',
      is_blanket: false,
      scheduled_holder_text: retailProj.holder_entity_text,
      provided: true,
    },
    {
      certificate_id: cert3.id,
      form_number: 'CG 20 01',
      edition_date: '04 13',
      endorsement_type: 'primary_noncontributory',
      coverage_type: 'general_liability',
      scope: 'Primary and non-contributory.',
      is_blanket: true,
      scheduled_holder_text: null,
      provided: true,
    },
  ])

  // Cert 4: Clearview Glazing on Tower — PENDING (expired GL, awaiting renewal)
  const [cert4] = await db
    .insert(certificates)
    .values({
      workspace_id: workspaceId,
      vendor_id: clearview.id,
      project_id: towerProj.id,
      template_id: highRiskTpl.id,
      template_version: highRiskTpl.version,
      holder_text: towerProj.holder_entity_text,
      producer: 'Gallagher — Austin',
      insured_name: 'Clearview Glazing Co.',
      description_of_operations: 'Curtainwall and glazing. Renewal certificate pending.',
      issue_date: daysFromNow(-200),
      status: 'expired',
      compliance_status: 'expired',
      source: 'manual',
      created_by: userId,
    })
    .returning()

  await db.insert(coverage_lines).values([
    {
      certificate_id: cert4.id,
      coverage_type: 'general_liability',
      carrier_name: 'Acme Surplus Lines',
      carrier_naic: '99001',
      policy_number: 'GL-CVG-2024-318',
      effective_date: daysFromNow(-365),
      expiry_date: daysFromNow(-5),
      each_occurrence: 1000000,
      aggregate_limit: 2000000,
      additional_insured_box: true,
      subrogation_waived_box: false,
      pnc_box: false,
    },
  ])

  // Cert 5: Greenline Landscaping on Retail — DEFICIENT (no AI endorsement at all)
  const [cert5] = await db
    .insert(certificates)
    .values({
      workspace_id: workspaceId,
      vendor_id: greenline.id,
      project_id: retailProj.id,
      template_id: standardTpl.id,
      template_version: standardTpl.version,
      holder_text: retailProj.holder_entity_text,
      producer: 'State Farm — Round Rock',
      insured_name: 'Greenline Landscaping LLC',
      description_of_operations: 'Landscaping and irrigation. No additional insured endorsement attached.',
      issue_date: daysFromNow(-15),
      status: 'active',
      compliance_status: 'deficient',
      source: 'manual',
      created_by: userId,
    })
    .returning()

  await db.insert(coverage_lines).values([
    {
      certificate_id: cert5.id,
      coverage_type: 'general_liability',
      carrier_name: 'Liberty Mutual',
      carrier_naic: '23043',
      policy_number: 'GL-GRN-2025-202',
      effective_date: daysFromNow(-20),
      expiry_date: daysFromNow(345),
      each_occurrence: 1000000,
      aggregate_limit: 2000000,
      additional_insured_box: false,
      subrogation_waived_box: false,
      pnc_box: false,
    },
    {
      certificate_id: cert5.id,
      coverage_type: 'workers_comp',
      carrier_name: 'Liberty Mutual',
      carrier_naic: '23043',
      policy_number: 'WC-GRN-2025-202',
      effective_date: daysFromNow(-20),
      expiry_date: daysFromNow(345),
      each_occurrence: 1000000,
      aggregate_limit: null,
      additional_insured_box: false,
      subrogation_waived_box: false,
      pnc_box: false,
    },
  ])

  // --- Gradings + deficiencies for the deficient/expired certs ---
  // Cert 1 grading (compliant, full pass).
  await db.insert(gradings).values({
    workspace_id: workspaceId,
    certificate_id: cert1.id,
    template_id: highRiskTpl.id,
    template_version: highRiskTpl.version,
    overall_status: 'compliant',
    score: 100,
    passed_count: 5,
    failed_count: 0,
    results: [
      { rule: 'general_liability:limit', passed: true, detail: '$2M/$4M meets $2M/$4M requirement.' },
      { rule: 'additional_insured_ongoing', passed: true, detail: 'CG 20 10 scheduled to holder.' },
      { rule: 'additional_insured_completed', passed: true, detail: 'CG 20 37 scheduled to holder.' },
      { rule: 'waiver_of_subrogation', passed: true, detail: 'CG 24 04 blanket waiver present.' },
      { rule: 'umbrella:limit', passed: true, detail: '$5M umbrella meets requirement.' },
    ],
    graded_by: userId,
  })

  // Cert 2 grading (deficient).
  const [grading2] = await db
    .insert(gradings)
    .values({
      workspace_id: workspaceId,
      certificate_id: cert2.id,
      template_id: highRiskTpl.id,
      template_version: highRiskTpl.version,
      overall_status: 'deficient',
      score: 50,
      passed_count: 2,
      failed_count: 2,
      results: [
        { rule: 'workers_comp', passed: true, detail: 'WC present.' },
        { rule: 'additional_insured_ongoing', passed: true, detail: 'Blanket AI present.' },
        {
          rule: 'general_liability:limit',
          passed: false,
          detail: '$1M/$2M below required $2M/$4M.',
        },
        {
          rule: 'additional_insured:blanket_accepted',
          passed: false,
          detail: 'Blanket AI not accepted on high-risk template; scheduled endorsement required.',
        },
      ],
      graded_by: userId,
    })
    .returning()

  await db.insert(deficiencies).values([
    {
      workspace_id: workspaceId,
      certificate_id: cert2.id,
      grading_id: grading2.id,
      reason_code: 'GL_LIMIT_LOW',
      severity: 'high',
      detail: 'GL each-occurrence $1M is below the $2M high-risk requirement.',
      status: 'open',
      assigned_to: null,
      due_date: daysFromNow(14),
    },
    {
      workspace_id: workspaceId,
      certificate_id: cert2.id,
      grading_id: grading2.id,
      reason_code: 'AI_ONGOING_MISSING',
      severity: 'high',
      detail: 'Blanket AI provided but scheduled CG 20 10 required on high-risk template.',
      status: 'open',
      assigned_to: null,
      due_date: daysFromNow(14),
    },
  ])

  // Cert 4 grading (expired).
  const [grading4] = await db
    .insert(gradings)
    .values({
      workspace_id: workspaceId,
      certificate_id: cert4.id,
      template_id: highRiskTpl.id,
      template_version: highRiskTpl.version,
      overall_status: 'expired',
      score: 0,
      passed_count: 0,
      failed_count: 1,
      results: [
        {
          rule: 'general_liability:active',
          passed: false,
          detail: 'GL policy expired; no continuous coverage.',
        },
      ],
      graded_by: userId,
    })
    .returning()

  await db.insert(deficiencies).values({
    workspace_id: workspaceId,
    certificate_id: cert4.id,
    grading_id: grading4.id,
    reason_code: 'COVERAGE_EXPIRED',
    severity: 'high',
    detail: 'General liability lapsed; renewal certificate required before re-mobilization.',
    status: 'open',
    assigned_to: null,
    due_date: daysFromNow(3),
  })

  // Cert 5 grading (deficient).
  const [grading5] = await db
    .insert(gradings)
    .values({
      workspace_id: workspaceId,
      certificate_id: cert5.id,
      template_id: standardTpl.id,
      template_version: standardTpl.version,
      overall_status: 'deficient',
      score: 60,
      passed_count: 2,
      failed_count: 2,
      results: [
        { rule: 'general_liability:limit', passed: true, detail: '$1M/$2M meets requirement.' },
        { rule: 'workers_comp', passed: true, detail: 'WC present.' },
        {
          rule: 'additional_insured_ongoing',
          passed: false,
          detail: 'No additional insured endorsement attached.',
        },
        {
          rule: 'waiver_of_subrogation',
          passed: false,
          detail: 'No waiver of subrogation in favor of holder.',
        },
      ],
      graded_by: userId,
    })
    .returning()

  await db.insert(deficiencies).values([
    {
      workspace_id: workspaceId,
      certificate_id: cert5.id,
      grading_id: grading5.id,
      reason_code: 'AI_ONGOING_MISSING',
      severity: 'high',
      detail: 'No CG 20 10 / blanket AI endorsement provided.',
      status: 'open',
      assigned_to: null,
      due_date: daysFromNow(10),
    },
    {
      workspace_id: workspaceId,
      certificate_id: cert5.id,
      grading_id: grading5.id,
      reason_code: 'WAIVER_SUBRO_MISSING',
      severity: 'medium',
      detail: 'No waiver of subrogation endorsement provided.',
      status: 'open',
      assigned_to: null,
      due_date: daysFromNow(10),
    },
  ])

  const counts = await workspaceCounts(workspaceId)
  return c.json(
    {
      seeded: true,
      workspace_id: workspaceId,
      counts: {
        ...counts,
        coverage_lines: 11,
        endorsements: 6,
        gradings: 4,
        deficiencies: 5,
        carriers: carrierRows.length,
      },
    },
    201,
  )
})

// ---------------------------------------------------------------------------
// GET /status — whether the workspace already has sample data
// ---------------------------------------------------------------------------

router.get('/status', authMiddleware, async (c) => {
  const userId = getUserId(c)

  const [membership] = await db
    .select()
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
    .orderBy(workspace_members.joined_at)
    .limit(1)

  if (!membership) {
    return c.json({
      seeded: false,
      counts: { vendors: 0, projects: 0, templates: 0, certificates: 0, assignments: 0 },
    })
  }

  const counts = await workspaceCounts(membership.workspace_id)
  const seeded = counts.vendors > 0 && counts.certificates > 0
  return c.json({ seeded, workspace_id: membership.workspace_id, counts })
})

export default router
