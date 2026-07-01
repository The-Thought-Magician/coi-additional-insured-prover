import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  certificates,
  coverage_lines,
  endorsements,
  gradings,
  deficiencies,
  requirement_templates,
  template_line_requirements,
  workspace_members,
  activity_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function userWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ workspace_id: workspace_members.workspace_id })
    .from(workspace_members)
    .where(eq(workspace_members.user_id, userId))
  return rows.map((r) => r.workspace_id)
}

async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspace_members.id })
    .from(workspace_members)
    .where(
      and(
        eq(workspace_members.user_id, userId),
        eq(workspace_members.workspace_id, workspaceId),
      ),
    )
  return !!row
}

async function logActivity(
  workspaceId: string,
  actorId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await db.insert(activity_log).values({
      workspace_id: workspaceId,
      actor_id: actorId,
      action,
      entity_type: 'certificate',
      entity_id: entityId,
      metadata,
    })
  } catch {
    /* best-effort */
  }
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? null : new Date(t)
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const coverageLineInput = z.object({
  coverage_type: z.string().min(1),
  carrier_name: z.string().nullable().optional(),
  carrier_naic: z.string().nullable().optional(),
  policy_number: z.string().nullable().optional(),
  effective_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  each_occurrence: z.number().int().nonnegative().nullable().optional(),
  aggregate_limit: z.number().int().nonnegative().nullable().optional(),
  additional_insured_box: z.boolean().optional(),
  subrogation_waived_box: z.boolean().optional(),
  pnc_box: z.boolean().optional(),
})

const endorsementInput = z.object({
  form_number: z.string().min(1),
  edition_date: z.string().nullable().optional(),
  endorsement_type: z.string().min(1),
  coverage_type: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  is_blanket: z.boolean().optional(),
  scheduled_holder_text: z.string().nullable().optional(),
  provided: z.boolean().optional(),
})

const certificateCreateSchema = z.object({
  workspace_id: z.string().min(1),
  vendor_id: z.string().min(1),
  project_id: z.string().nullable().optional(),
  template_id: z.string().nullable().optional(),
  holder_text: z.string().nullable().optional(),
  producer: z.string().nullable().optional(),
  insured_name: z.string().nullable().optional(),
  description_of_operations: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  coverage_lines: z.array(coverageLineInput).optional().default([]),
  endorsements: z.array(endorsementInput).optional().default([]),
})

const certificateUpdateSchema = z.object({
  vendor_id: z.string().optional(),
  project_id: z.string().nullable().optional(),
  template_id: z.string().nullable().optional(),
  holder_text: z.string().nullable().optional(),
  producer: z.string().nullable().optional(),
  insured_name: z.string().nullable().optional(),
  description_of_operations: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  status: z.string().optional(),
})

const parseSchema = z.object({ raw: z.union([z.string(), z.record(z.unknown())]) })

// ---------------------------------------------------------------------------
// ACORD 25 parser — turns a raw payload (JSON object or text) into structured
// coverage lines + endorsements. Deterministic, no external services.
// ---------------------------------------------------------------------------

type ParsedLine = z.infer<typeof coverageLineInput>
type ParsedEndorsement = z.infer<typeof endorsementInput>

const COVERAGE_KEYWORDS: Array<{ re: RegExp; type: string }> = [
  { re: /general\s+liab|commercial\s+general|\bcgl\b|\bgl\b/i, type: 'general_liability' },
  { re: /auto|automobile/i, type: 'auto_liability' },
  { re: /umbrella|excess/i, type: 'umbrella' },
  { re: /workers?\s*comp|\bwc\b|employers?\s+liab/i, type: 'workers_comp' },
  { re: /professional|errors?\s*(and|&)?\s*omissions|\be&o\b/i, type: 'professional_liability' },
  { re: /pollution|environmental/i, type: 'pollution' },
]

function classifyCoverage(label: string): string {
  for (const k of COVERAGE_KEYWORDS) if (k.re.test(label)) return k.type
  return label.trim().toLowerCase().replace(/\s+/g, '_') || 'other'
}

function parseAcordPayload(raw: string | Record<string, unknown>): {
  coverage_lines: ParsedLine[]
  endorsements: ParsedEndorsement[]
} {
  // Object form: accept a structured payload mirroring our intake shape.
  let obj: Record<string, unknown> | null = null
  if (typeof raw === 'object' && raw !== null) {
    obj = raw
  } else if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const j = JSON.parse(s)
        obj = Array.isArray(j) ? { coverages: j } : j
      } catch {
        obj = null
      }
    }
  }

  if (obj) {
    const rawLines =
      (obj.coverage_lines as unknown[]) ??
      (obj.coverages as unknown[]) ??
      (obj.lines as unknown[]) ??
      []
    const rawEnds =
      (obj.endorsements as unknown[]) ?? (obj.forms as unknown[]) ?? []

    const coverage_lines: ParsedLine[] = (Array.isArray(rawLines) ? rawLines : [])
      .map((l) => {
        const r = (l ?? {}) as Record<string, unknown>
        const label = String(r.coverage_type ?? r.type ?? r.coverage ?? r.label ?? 'other')
        return {
          coverage_type: classifyCoverage(label),
          carrier_name: r.carrier_name != null ? String(r.carrier_name) : (r.carrier != null ? String(r.carrier) : null),
          carrier_naic: r.carrier_naic != null ? String(r.carrier_naic) : (r.naic != null ? String(r.naic) : null),
          policy_number: r.policy_number != null ? String(r.policy_number) : (r.policy != null ? String(r.policy) : null),
          effective_date: r.effective_date != null ? String(r.effective_date) : (r.effective != null ? String(r.effective) : null),
          expiry_date: r.expiry_date != null ? String(r.expiry_date) : (r.expiry != null ? String(r.expiry) : (r.expiration != null ? String(r.expiration) : null)),
          each_occurrence: numOrNull(r.each_occurrence ?? r.each_occ ?? r.occurrence),
          aggregate_limit: numOrNull(r.aggregate_limit ?? r.aggregate ?? r.agg),
          additional_insured_box: boolOrFalse(r.additional_insured_box ?? r.additional_insured ?? r.ai),
          subrogation_waived_box: boolOrFalse(r.subrogation_waived_box ?? r.subrogation_waived ?? r.waiver),
          pnc_box: boolOrFalse(r.pnc_box ?? r.primary_noncontributory ?? r.pnc),
        }
      })

    const endorsements: ParsedEndorsement[] = (Array.isArray(rawEnds) ? rawEnds : [])
      .map((e) => {
        const r = (e ?? {}) as Record<string, unknown>
        return {
          form_number: String(r.form_number ?? r.form ?? 'UNKNOWN'),
          edition_date: r.edition_date != null ? String(r.edition_date) : null,
          endorsement_type: String(r.endorsement_type ?? r.type ?? 'additional_insured'),
          coverage_type: r.coverage_type != null ? classifyCoverage(String(r.coverage_type)) : null,
          scope: r.scope != null ? String(r.scope) : null,
          is_blanket: boolOrFalse(r.is_blanket ?? r.blanket),
          scheduled_holder_text: r.scheduled_holder_text != null ? String(r.scheduled_holder_text) : null,
          provided: r.provided != null ? boolOrFalse(r.provided) : true,
        }
      })

    return { coverage_lines, endorsements }
  }

  // Text form: scan lines for coverage labels, limits, dates, AI/waiver/PNC and
  // endorsement form numbers (CG 20 10, CG 20 37, etc.).
  const text = String(raw)
  const coverage_lines: ParsedLine[] = []
  const endorsements: ParsedEndorsement[] = []

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Endorsement form numbers.
    const formMatch = trimmed.match(/\bCG\s*\d{2}\s*\d{2}\b|\bCA\s*\d{2}\s*\d{2}\b/i)
    if (formMatch) {
      const form = formMatch[0].toUpperCase().replace(/\s+/g, ' ')
      endorsements.push({
        form_number: form,
        edition_date: (trimmed.match(/\b\d{2}\/\d{2}\b/) ?? [null])[0],
        endorsement_type: /complete|product/i.test(trimmed)
          ? 'additional_insured_completed'
          : /ongoing/i.test(trimmed)
            ? 'additional_insured_ongoing'
            : /waiver|subrog/i.test(trimmed)
              ? 'waiver_of_subrogation'
              : 'additional_insured',
        coverage_type: 'general_liability',
        scope: null,
        is_blanket: /blanket/i.test(trimmed),
        scheduled_holder_text: null,
        provided: true,
      })
      continue
    }

    const matchedCov = COVERAGE_KEYWORDS.find((k) => k.re.test(trimmed))
    if (matchedCov) {
      const amounts = [...trimmed.matchAll(/\$?\s*([\d,]{4,})/g)].map((m) =>
        parseInt(m[1].replace(/,/g, ''), 10),
      ).filter((n) => Number.isFinite(n))
      const dates = [...trimmed.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})/g)].map((m) => m[1])
      coverage_lines.push({
        coverage_type: matchedCov.type,
        carrier_name: null,
        carrier_naic: null,
        policy_number: (trimmed.match(/\b[A-Z]{2,}[-]?\d{4,}\b/) ?? [null])[0],
        effective_date: dates[0] ?? null,
        expiry_date: dates[1] ?? null,
        each_occurrence: amounts[0] ?? null,
        aggregate_limit: amounts[1] ?? null,
        additional_insured_box: /additional\s+insured|\bai\b/i.test(trimmed),
        subrogation_waived_box: /waiver|subrog/i.test(trimmed),
        pnc_box: /primary|non[- ]?contrib|pnc/i.test(trimmed),
      })
    }
  }

  return { coverage_lines, endorsements }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/[$,]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function boolOrFalse(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return /^(true|yes|y|1|x)$/i.test(v.trim())
  return v === 1
}

// ---------------------------------------------------------------------------
// Grading engine. Evaluates a certificate's coverage lines + endorsements
// against a requirement template (and its per-line minimums). Produces a
// grading result set and a list of deficiency reason codes.
// ---------------------------------------------------------------------------

interface GradeRuleResult {
  rule: string
  passed: boolean
  detail: string
}

interface GradeOutput {
  overall_status: 'compliant' | 'deficient' | 'pending'
  score: number
  passed: number
  failed: number
  results: GradeRuleResult[]
  deficiencies: Array<{ reason_code: string; severity: string; detail: string }>
}

function gradeCertificate(
  template: typeof requirement_templates.$inferSelect | undefined,
  lineReqs: Array<typeof template_line_requirements.$inferSelect>,
  lines: Array<typeof coverage_lines.$inferSelect>,
  ends: Array<typeof endorsements.$inferSelect>,
): GradeOutput {
  const results: GradeRuleResult[] = []
  const defs: Array<{ reason_code: string; severity: string; detail: string }> = []
  const now = Date.now()

  const byType = new Map<string, typeof coverage_lines.$inferSelect>()
  for (const l of lines) if (!byType.has(l.coverage_type)) byType.set(l.coverage_type, l)

  // Endorsement types are recognized in two formats that must both be
  // supported: the standard ACORD form-number codes used by the
  // endorsements API/UI (cg_20_10, cg_20_37, blanket_ai, cg_24_04, pnc,
  // other) and free-text descriptive labels used by seed/demo data and
  // freeform parsing (e.g. "additional_insured_ongoing"). Grading must
  // recognize either, or endorsements added through the real UI would
  // never satisfy AI/waiver requirements.
  const isAiType = (t: string) => /additional_insured/i.test(t) || t === 'cg_20_10' || t === 'cg_20_37' || t === 'blanket_ai'
  const isOngoingAiType = (t: string) => t === 'cg_20_10' || /ongoing|additional_insured$/i.test(t)
  const isCompletedAiType = (t: string) => t === 'cg_20_37' || /complete/i.test(t)
  const isBlanketAiType = (t: string) => t === 'blanket_ai'
  const isWaiverType = (t: string) => t === 'cg_24_04' || /waiver|subrog/i.test(t)
  const isPncType = (t: string) => t === 'pnc' || /primary|non[- ]?contrib/i.test(t)

  const aiEndorsements = ends.filter((e) => e.provided && isAiType(e.endorsement_type))
  const hasOngoingAi = aiEndorsements.some(
    (e) => e.is_blanket || isBlanketAiType(e.endorsement_type) || isOngoingAiType(e.endorsement_type),
  )
  const hasCompletedAi = aiEndorsements.some(
    (e) => e.is_blanket || isBlanketAiType(e.endorsement_type) || isCompletedAiType(e.endorsement_type),
  )
  const hasBlanketAi = aiEndorsements.some((e) => e.is_blanket || isBlanketAiType(e.endorsement_type))
  const hasEndorsementPnc = ends.some((e) => e.provided && isPncType(e.endorsement_type))

  function pass(rule: string, detail: string) {
    results.push({ rule, passed: true, detail })
  }
  function fail(rule: string, detail: string, reason_code: string, severity: string) {
    results.push({ rule, passed: false, detail })
    defs.push({ reason_code, severity, detail })
  }

  // 1. At minimum a GL line must exist.
  const gl = byType.get('general_liability')
  if (gl) pass('gl_present', 'General Liability coverage line present')
  else fail('gl_present', 'No General Liability coverage line found', 'NO_GL', 'critical')

  // 2. Required coverage lines from per-line minimums.
  for (const req of lineReqs) {
    if (!req.required) continue
    const line = byType.get(req.coverage_type)
    if (!line) {
      fail(
        `required_${req.coverage_type}`,
        `Required coverage "${req.coverage_type}" is missing`,
        'MISSING_COVERAGE',
        'high',
      )
      continue
    }
    pass(`required_${req.coverage_type}`, `Coverage "${req.coverage_type}" present`)

    if (req.min_each_occurrence != null) {
      if ((line.each_occurrence ?? 0) >= req.min_each_occurrence) {
        pass(
          `limit_occ_${req.coverage_type}`,
          `${req.coverage_type} each-occurrence meets minimum`,
        )
      } else {
        fail(
          `limit_occ_${req.coverage_type}`,
          `${req.coverage_type} each-occurrence ${line.each_occurrence ?? 0} below required ${req.min_each_occurrence}`,
          'LIMIT_TOO_LOW',
          'high',
        )
      }
    }
    if (req.min_aggregate != null) {
      if ((line.aggregate_limit ?? 0) >= req.min_aggregate) {
        pass(
          `limit_agg_${req.coverage_type}`,
          `${req.coverage_type} aggregate meets minimum`,
        )
      } else {
        fail(
          `limit_agg_${req.coverage_type}`,
          `${req.coverage_type} aggregate ${line.aggregate_limit ?? 0} below required ${req.min_aggregate}`,
          'LIMIT_TOO_LOW',
          'high',
        )
      }
    }
  }

  // 3. Expiration: any expired line is a deficiency.
  for (const l of lines) {
    if (l.expiry_date && new Date(l.expiry_date).getTime() < now) {
      fail(
        `not_expired_${l.coverage_type}`,
        `${l.coverage_type} policy expired on ${new Date(l.expiry_date).toISOString().slice(0, 10)}`,
        'POLICY_EXPIRED',
        'critical',
      )
    } else if (l.expiry_date) {
      pass(`not_expired_${l.coverage_type}`, `${l.coverage_type} policy in force`)
    }
  }

  if (!template) {
    // No template to grade against: limited rule set only.
    const failed = results.filter((r) => !r.passed).length
    const passed = results.filter((r) => r.passed).length
    const total = passed + failed
    return {
      overall_status: failed === 0 ? 'compliant' : 'deficient',
      score: total === 0 ? 0 : Math.round((passed / total) * 100),
      passed,
      failed,
      results,
      deficiencies: defs,
    }
  }

  // 4. Additional-insured ongoing-operations endorsement.
  if (template.require_ai_ongoing) {
    if (hasOngoingAi || (gl?.additional_insured_box && hasBlanketAi)) {
      pass('ai_ongoing', 'Additional-insured (ongoing operations) endorsement present')
    } else {
      fail(
        'ai_ongoing',
        'Missing additional-insured ongoing-operations endorsement (e.g. CG 20 10)',
        'NO_AI_ONGOING',
        'high',
      )
    }
  }

  // 5. Additional-insured completed-operations endorsement.
  if (template.require_ai_completed) {
    if (hasCompletedAi || hasBlanketAi) {
      pass('ai_completed', 'Additional-insured (completed operations) endorsement present')
    } else {
      fail(
        'ai_completed',
        'Missing additional-insured completed-operations endorsement (e.g. CG 20 37)',
        'NO_AI_COMPLETED',
        'high',
      )
    }
  }

  // 6. Blanket AI acceptance.
  if (!template.accept_blanket_ai && hasBlanketAi && !hasOngoingAi) {
    fail(
      'blanket_ai',
      'Blanket additional-insured not accepted; scheduled endorsement required',
      'BLANKET_AI_NOT_ACCEPTED',
      'medium',
    )
  }

  // 7. Primary & non-contributory.
  if (template.require_pnc) {
    if (gl?.pnc_box || hasEndorsementPnc) pass('pnc', 'Primary & non-contributory confirmed on GL')
    else
      fail(
        'pnc',
        'Primary & non-contributory not indicated on General Liability',
        'NO_PNC',
        'medium',
      )
  }

  // 8. Waiver of subrogation.
  if (template.require_waiver_subrogation) {
    const hasWaiver =
      lines.some((l) => l.subrogation_waived_box) ||
      ends.some((e) => e.provided && isWaiverType(e.endorsement_type))
    if (hasWaiver) pass('waiver', 'Waiver of subrogation present')
    else
      fail(
        'waiver',
        'Missing waiver of subrogation',
        'NO_WAIVER',
        'medium',
      )
  }

  const failed = results.filter((r) => !r.passed).length
  const passed = results.filter((r) => r.passed).length
  const total = passed + failed
  return {
    overall_status: failed === 0 ? 'compliant' : 'deficient',
    score: total === 0 ? 0 : Math.round((passed / total) * 100),
    passed,
    failed,
    results,
    deficiencies: defs,
  }
}

// ---------------------------------------------------------------------------
// GET / — list certificates (filter vendor/project/compliance_status)
// ---------------------------------------------------------------------------

router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const wsIds = await userWorkspaceIds(userId)
  if (wsIds.length === 0) return c.json([])

  const wsFilter = c.req.query('workspace_id')
  if (wsFilter && !wsIds.includes(wsFilter)) return c.json({ error: 'Forbidden' }, 403)
  const vendorId = c.req.query('vendor_id')
  const projectId = c.req.query('project_id')
  const compliance = c.req.query('compliance_status')

  const all = await db
    .select()
    .from(certificates)
    .orderBy(desc(certificates.created_at))

  const scoped = all.filter((cert) => {
    if (!wsIds.includes(cert.workspace_id)) return false
    if (wsFilter && cert.workspace_id !== wsFilter) return false
    if (vendorId && cert.vendor_id !== vendorId) return false
    if (projectId && cert.project_id !== projectId) return false
    if (compliance && cert.compliance_status !== compliance) return false
    return true
  })
  return c.json(scoped)
})

// ---------------------------------------------------------------------------
// GET /:id — full detail (cert + coverage_lines + endorsements + latest grading)
// ---------------------------------------------------------------------------

router.get('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, id))
  if (!certificate) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, certificate.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const lines = await db
    .select()
    .from(coverage_lines)
    .where(eq(coverage_lines.certificate_id, id))
    .orderBy(coverage_lines.coverage_type)
  const ends = await db
    .select()
    .from(endorsements)
    .where(eq(endorsements.certificate_id, id))
    .orderBy(endorsements.form_number)
  const [grading] = await db
    .select()
    .from(gradings)
    .where(eq(gradings.certificate_id, id))
    .orderBy(desc(gradings.created_at))
    .limit(1)

  return c.json({ certificate, coverage_lines: lines, endorsements: ends, grading: grading ?? null })
})

// ---------------------------------------------------------------------------
// POST / — intake/create certificate with nested coverage_lines + endorsements
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', certificateCreateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  if (!(await isMember(userId, body.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  // Resolve template version snapshot at intake time.
  let templateVersion: number | null = null
  if (body.template_id) {
    const [tpl] = await db
      .select()
      .from(requirement_templates)
      .where(eq(requirement_templates.id, body.template_id))
    if (tpl) {
      if (tpl.workspace_id !== body.workspace_id)
        return c.json({ error: 'Template not in workspace' }, 400)
      templateVersion = tpl.version
    }
  }

  const [cert] = await db
    .insert(certificates)
    .values({
      workspace_id: body.workspace_id,
      vendor_id: body.vendor_id,
      project_id: body.project_id ?? null,
      template_id: body.template_id ?? null,
      template_version: templateVersion,
      holder_text: body.holder_text ?? null,
      producer: body.producer ?? null,
      insured_name: body.insured_name ?? null,
      description_of_operations: body.description_of_operations ?? null,
      issue_date: toDate(body.issue_date),
      status: body.status ?? 'received',
      compliance_status: 'pending',
      source: body.source ?? 'manual',
      created_by: userId,
    })
    .returning()

  if (body.coverage_lines.length > 0) {
    await db.insert(coverage_lines).values(
      body.coverage_lines.map((l) => ({
        certificate_id: cert.id,
        coverage_type: l.coverage_type,
        carrier_name: l.carrier_name ?? null,
        carrier_naic: l.carrier_naic ?? null,
        policy_number: l.policy_number ?? null,
        effective_date: toDate(l.effective_date),
        expiry_date: toDate(l.expiry_date),
        each_occurrence: l.each_occurrence ?? null,
        aggregate_limit: l.aggregate_limit ?? null,
        additional_insured_box: l.additional_insured_box ?? false,
        subrogation_waived_box: l.subrogation_waived_box ?? false,
        pnc_box: l.pnc_box ?? false,
      })),
    )
  }

  if (body.endorsements.length > 0) {
    await db.insert(endorsements).values(
      body.endorsements.map((e) => ({
        certificate_id: cert.id,
        form_number: e.form_number,
        edition_date: e.edition_date ?? null,
        endorsement_type: e.endorsement_type,
        coverage_type: e.coverage_type ?? null,
        scope: e.scope ?? null,
        is_blanket: e.is_blanket ?? false,
        scheduled_holder_text: e.scheduled_holder_text ?? null,
        provided: e.provided ?? true,
      })),
    )
  }

  await logActivity(cert.workspace_id, userId, 'certificate.create', cert.id, {
    vendor_id: cert.vendor_id,
    lines: body.coverage_lines.length,
  })
  return c.json(cert, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update certificate header
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', certificateUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (body.vendor_id !== undefined) updates.vendor_id = body.vendor_id
  if (body.project_id !== undefined) updates.project_id = body.project_id
  if (body.template_id !== undefined) updates.template_id = body.template_id
  if (body.holder_text !== undefined) updates.holder_text = body.holder_text
  if (body.producer !== undefined) updates.producer = body.producer
  if (body.insured_name !== undefined) updates.insured_name = body.insured_name
  if (body.description_of_operations !== undefined)
    updates.description_of_operations = body.description_of_operations
  if (body.issue_date !== undefined) updates.issue_date = toDate(body.issue_date)
  if (body.status !== undefined) updates.status = body.status

  const [updated] = await db
    .update(certificates)
    .set(updates)
    .where(eq(certificates.id, id))
    .returning()

  await logActivity(updated.workspace_id, userId, 'certificate.update', updated.id)
  return c.json(updated)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete certificate (and children)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(certificates).where(eq(certificates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, existing.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  // Remove dependents first to satisfy FK constraints.
  await db.delete(deficiencies).where(eq(deficiencies.certificate_id, id))
  await db.delete(gradings).where(eq(gradings.certificate_id, id))
  await db.delete(endorsements).where(eq(endorsements.certificate_id, id))
  await db.delete(coverage_lines).where(eq(coverage_lines.certificate_id, id))
  await db.delete(certificates).where(eq(certificates.id, id))

  await logActivity(existing.workspace_id, userId, 'certificate.delete', id)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// POST /:id/parse — re-parse raw ACORD payload into coverage lines/endorsements
// ---------------------------------------------------------------------------

router.post('/:id/parse', authMiddleware, zValidator('json', parseSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, id))
  if (!cert) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, cert.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  const { raw } = c.req.valid('json')
  const parsed = parseAcordPayload(raw)

  // Replace existing parsed children with the freshly parsed set.
  await db.delete(coverage_lines).where(eq(coverage_lines.certificate_id, id))
  await db.delete(endorsements).where(eq(endorsements.certificate_id, id))

  let insertedLines: typeof coverage_lines.$inferSelect[] = []
  if (parsed.coverage_lines.length > 0) {
    insertedLines = await db
      .insert(coverage_lines)
      .values(
        parsed.coverage_lines.map((l) => ({
          certificate_id: id,
          coverage_type: l.coverage_type,
          carrier_name: l.carrier_name ?? null,
          carrier_naic: l.carrier_naic ?? null,
          policy_number: l.policy_number ?? null,
          effective_date: toDate(l.effective_date),
          expiry_date: toDate(l.expiry_date),
          each_occurrence: l.each_occurrence ?? null,
          aggregate_limit: l.aggregate_limit ?? null,
          additional_insured_box: l.additional_insured_box ?? false,
          subrogation_waived_box: l.subrogation_waived_box ?? false,
          pnc_box: l.pnc_box ?? false,
        })),
      )
      .returning()
  }

  let insertedEnds: typeof endorsements.$inferSelect[] = []
  if (parsed.endorsements.length > 0) {
    insertedEnds = await db
      .insert(endorsements)
      .values(
        parsed.endorsements.map((e) => ({
          certificate_id: id,
          form_number: e.form_number,
          edition_date: e.edition_date ?? null,
          endorsement_type: e.endorsement_type,
          coverage_type: e.coverage_type ?? null,
          scope: e.scope ?? null,
          is_blanket: e.is_blanket ?? false,
          scheduled_holder_text: e.scheduled_holder_text ?? null,
          provided: e.provided ?? true,
        })),
      )
      .returning()
  }

  await db
    .update(certificates)
    .set({ source: 'parsed', status: 'parsed', updated_at: new Date() })
    .where(eq(certificates.id, id))

  await logActivity(cert.workspace_id, userId, 'certificate.parse', id, {
    lines: insertedLines.length,
    endorsements: insertedEnds.length,
  })
  return c.json({ coverage_lines: insertedLines, endorsements: insertedEnds })
})

// ---------------------------------------------------------------------------
// POST /:id/regrade — run the grading engine, write grading + deficiencies
// ---------------------------------------------------------------------------

router.post('/:id/regrade', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [cert] = await db.select().from(certificates).where(eq(certificates.id, id))
  if (!cert) return c.json({ error: 'Not found' }, 404)
  if (!(await isMember(userId, cert.workspace_id)))
    return c.json({ error: 'Forbidden' }, 403)

  let template: typeof requirement_templates.$inferSelect | undefined
  let lineReqs: Array<typeof template_line_requirements.$inferSelect> = []
  if (cert.template_id) {
    ;[template] = await db
      .select()
      .from(requirement_templates)
      .where(eq(requirement_templates.id, cert.template_id))
    if (template) {
      lineReqs = await db
        .select()
        .from(template_line_requirements)
        .where(eq(template_line_requirements.template_id, template.id))
    }
  }

  const lines = await db
    .select()
    .from(coverage_lines)
    .where(eq(coverage_lines.certificate_id, id))
  const ends = await db
    .select()
    .from(endorsements)
    .where(eq(endorsements.certificate_id, id))

  const result = gradeCertificate(template, lineReqs, lines, ends)

  // Persist grading.
  const [grading] = await db
    .insert(gradings)
    .values({
      workspace_id: cert.workspace_id,
      certificate_id: id,
      template_id: cert.template_id ?? null,
      template_version: cert.template_version ?? template?.version ?? null,
      overall_status: result.overall_status,
      score: result.score,
      passed_count: result.passed,
      failed_count: result.failed,
      results: result.results,
      graded_by: userId,
    })
    .returning()

  // Re-open deficiency set: clear prior open auto-generated deficiencies for
  // this certificate, then insert the freshly computed ones.
  await db.delete(deficiencies).where(eq(deficiencies.certificate_id, id))
  let insertedDefs: typeof deficiencies.$inferSelect[] = []
  if (result.deficiencies.length > 0) {
    insertedDefs = await db
      .insert(deficiencies)
      .values(
        result.deficiencies.map((d) => ({
          workspace_id: cert.workspace_id,
          certificate_id: id,
          grading_id: grading.id,
          reason_code: d.reason_code,
          severity: d.severity,
          detail: d.detail,
          status: 'open',
        })),
      )
      .returning()
  }

  // Update certificate compliance status from the grading.
  await db
    .update(certificates)
    .set({ compliance_status: result.overall_status, status: 'graded', updated_at: new Date() })
    .where(eq(certificates.id, id))

  await logActivity(cert.workspace_id, userId, 'certificate.regrade', id, {
    status: result.overall_status,
    score: result.score,
    deficiencies: insertedDefs.length,
  })
  return c.json({ grading, deficiencies: insertedDefs })
})

export default router
