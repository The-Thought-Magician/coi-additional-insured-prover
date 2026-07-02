'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'

interface Vendor { id: string; legal_name?: string; dba?: string | null }
interface Project { id: string; name?: string; holder_entity_text?: string | null; template_id?: string | null }
interface Template { id: string; name?: string; version?: number }
interface Carrier { id: string; name?: string; naic?: string | null; am_best_rating?: string | null }

const COVERAGE_TYPES = [
  'general_liability',
  'auto_liability',
  'umbrella',
  'workers_comp',
  'professional_liability',
  'pollution',
]
const ENDORSEMENT_TYPES = ['additional_insured', 'waiver_of_subrogation', 'primary_noncontributory', 'notice_of_cancellation']

interface CoverageLineDraft {
  coverage_type: string
  carrier_name: string
  carrier_naic: string
  policy_number: string
  effective_date: string
  expiry_date: string
  each_occurrence: string
  aggregate_limit: string
  additional_insured_box: boolean
  subrogation_waived_box: boolean
  pnc_box: boolean
}
interface EndorsementDraft {
  form_number: string
  edition_date: string
  endorsement_type: string
  coverage_type: string
  scope: string
  is_blanket: boolean
  scheduled_holder_text: string
  provided: boolean
}

function emptyLine(): CoverageLineDraft {
  return {
    coverage_type: 'general_liability',
    carrier_name: '',
    carrier_naic: '',
    policy_number: '',
    effective_date: '',
    expiry_date: '',
    each_occurrence: '',
    aggregate_limit: '',
    additional_insured_box: false,
    subrogation_waived_box: false,
    pnc_box: false,
  }
}
function emptyEndorsement(): EndorsementDraft {
  return {
    form_number: '',
    edition_date: '',
    endorsement_type: 'additional_insured',
    coverage_type: 'general_liability',
    scope: '',
    is_blanket: false,
    scheduled_holder_text: '',
    provided: true,
  }
}

const inputCls =
  'w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:border-cyan-500 focus:outline-none'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500'

export default function NewCertificatePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [carriers, setCarriers] = useState<Carrier[]>([])

  // header
  const [vendorId, setVendorId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [holderText, setHolderText] = useState('')
  const [producer, setProducer] = useState('')
  const [insuredName, setInsuredName] = useState('')
  const [description, setDescription] = useState('')
  const [issueDate, setIssueDate] = useState('')

  const [lines, setLines] = useState<CoverageLineDraft[]>([emptyLine()])
  const [endorsements, setEndorsements] = useState<EndorsementDraft[]>([])

  // ACORD raw paste parsing (deferred parse: create blank cert first, then parse, then re-fetch into UI)
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseNote, setParseNote] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [v, p, t, c] = await Promise.all([
          api.getVendors(),
          api.getProjects(),
          api.getTemplates(),
          api.getCarriers(),
        ])
        setVendors(Array.isArray(v) ? v : [])
        setProjects(Array.isArray(p) ? p : [])
        setTemplates(Array.isArray(t) ? t : [])
        setCarriers(Array.isArray(c) ? c : [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load reference data')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function onProjectChange(id: string) {
    setProjectId(id)
    const proj = projects.find((p) => p.id === id)
    if (proj) {
      if (proj.holder_entity_text && !holderText) setHolderText(proj.holder_entity_text)
      if (proj.template_id && !templateId) setTemplateId(proj.template_id)
    }
  }

  function updateLine(i: number, patch: Partial<CoverageLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function updateEndorsement(i: number, patch: Partial<EndorsementDraft>) {
    setEndorsements((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  }

  function buildCoverageLinesPayload() {
    return lines
      .filter((l) => l.coverage_type)
      .map((l) => ({
        coverage_type: l.coverage_type,
        carrier_name: l.carrier_name || null,
        carrier_naic: l.carrier_naic || null,
        policy_number: l.policy_number || null,
        effective_date: l.effective_date || null,
        expiry_date: l.expiry_date || null,
        each_occurrence: l.each_occurrence ? Number(l.each_occurrence) : null,
        aggregate_limit: l.aggregate_limit ? Number(l.aggregate_limit) : null,
        additional_insured_box: l.additional_insured_box,
        subrogation_waived_box: l.subrogation_waived_box,
        pnc_box: l.pnc_box,
      }))
  }
  function buildEndorsementsPayload() {
    return endorsements
      .filter((e) => e.endorsement_type)
      .map((e) => ({
        form_number: e.form_number || null,
        edition_date: e.edition_date || null,
        endorsement_type: e.endorsement_type,
        coverage_type: e.coverage_type || null,
        scope: e.scope || null,
        is_blanket: e.is_blanket,
        scheduled_holder_text: e.scheduled_holder_text || null,
        provided: e.provided,
      }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!vendorId) {
      setError('Select a vendor.')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        vendor_id: vendorId,
        project_id: projectId || null,
        template_id: templateId || null,
        holder_text: holderText || null,
        producer: producer || null,
        insured_name: insuredName || null,
        description_of_operations: description || null,
        issue_date: issueDate || null,
        source: 'manual',
        coverage_lines: buildCoverageLinesPayload(),
        endorsements: buildEndorsementsPayload(),
      }
      const created: any = await api.createCertificate(body)
      const id = created?.id || created?.certificate?.id
      if (!id) throw new Error('Certificate created but no id returned')
      // grade immediately so the detail view lands with results
      try {
        await api.regradeCertificate(id)
      } catch {
        /* grading is best-effort here */
      }
      router.push(`/dashboard/certificates/${id}`)
    } catch (err: any) {
      setError(err?.message || 'Failed to create certificate')
      setSubmitting(false)
    }
  }

  // Parse flow: create the cert first (with header + any current lines), parse raw into it, redirect to detail.
  async function handleParseAndCreate() {
    setError(null)
    setParseNote(null)
    if (!vendorId) {
      setError('Select a vendor before parsing.')
      return
    }
    if (!rawText.trim()) {
      setError('Paste raw ACORD text to parse.')
      return
    }
    setParsing(true)
    try {
      const created: any = await api.createCertificate({
        vendor_id: vendorId,
        project_id: projectId || null,
        template_id: templateId || null,
        holder_text: holderText || null,
        producer: producer || null,
        insured_name: insuredName || null,
        description_of_operations: description || null,
        issue_date: issueDate || null,
        source: 'acord_parse',
        coverage_lines: buildCoverageLinesPayload(),
        endorsements: buildEndorsementsPayload(),
      })
      const id = created?.id || created?.certificate?.id
      if (!id) throw new Error('Certificate created but no id returned')
      await api.parseCertificate(id, rawText)
      try {
        await api.regradeCertificate(id)
      } catch {
        /* best-effort */
      }
      router.push(`/dashboard/certificates/${id}`)
    } catch (err: any) {
      setError(err?.message || 'Failed to parse certificate')
      setParsing(false)
    }
  }

  if (loading) return <PageSpinner label="Loading intake form…" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/certificates" className="text-sm text-stone-400 hover:text-cyan-300">
            ← Certificates
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">New ACORD 25 Certificate</h1>
          <p className="mt-1 text-sm text-stone-400">Intake the header, coverage lines, and endorsements for grading.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Raw ACORD paste */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Quick intake from raw ACORD text</h2>
            <p className="text-xs text-stone-500">Paste the certificate text and let the parser extract coverage lines + endorsements.</p>
          </div>
          <Badge tone="amber">optional</Badge>
        </CardHeader>
        <CardBody className="space-y-3">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={5}
            placeholder="Paste ACORD 25 text or extracted PDF content here…"
            className={`${inputCls} font-mono`}
          />
          {parseNote && <p className="text-xs text-emerald-300">{parseNote}</p>}
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={handleParseAndCreate} disabled={parsing}>
              {parsing ? <Spinner label="Parsing…" /> : 'Parse & create'}
            </Button>
            <span className="text-xs text-stone-500">
              Creates the certificate with the header below, then parses the pasted text into it.
            </span>
          </div>
        </CardBody>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Certificate header</h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Vendor *</label>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls} required>
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.dba || v.legal_name || v.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Project</label>
              <select value={projectId} onChange={(e) => onProjectChange(e.target.value)} className={inputCls}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Requirement template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.id}
                    {t.version != null ? ` (v${t.version})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Issue date</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Insured name</label>
              <input value={insuredName} onChange={(e) => setInsuredName(e.target.value)} placeholder="Named insured" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Producer</label>
              <input value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="Agency / broker" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Certificate holder text</label>
              <input value={holderText} onChange={(e) => setHolderText(e.target.value)} placeholder="Holder entity as printed on the COI" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description of operations</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
            </div>
          </CardBody>
        </Card>

        {/* Coverage lines */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Coverage lines</h2>
            <Button type="button" variant="secondary" onClick={() => setLines((p) => [...p, emptyLine()])}>
              + Add line
            </Button>
          </CardHeader>
          <CardBody className="space-y-4">
            {lines.length === 0 && <p className="text-sm text-stone-500">No coverage lines. Add at least one line.</p>}
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-cyan-300">Line {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>Coverage type</label>
                    <select value={l.coverage_type} onChange={(e) => updateLine(i, { coverage_type: e.target.value })} className={inputCls}>
                      {COVERAGE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Carrier</label>
                    <input
                      list="carrier-options"
                      value={l.carrier_name}
                      onChange={(e) => {
                        const name = e.target.value
                        const match = carriers.find((c) => c.name === name)
                        updateLine(i, { carrier_name: name, carrier_naic: match?.naic || l.carrier_naic })
                      }}
                      placeholder="Carrier name"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>NAIC</label>
                    <input value={l.carrier_naic} onChange={(e) => updateLine(i, { carrier_naic: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Policy number</label>
                    <input value={l.policy_number} onChange={(e) => updateLine(i, { policy_number: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Effective</label>
                    <input type="date" value={l.effective_date} onChange={(e) => updateLine(i, { effective_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Expiry</label>
                    <input type="date" value={l.expiry_date} onChange={(e) => updateLine(i, { expiry_date: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Each occurrence ($)</label>
                    <input type="number" value={l.each_occurrence} onChange={(e) => updateLine(i, { each_occurrence: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Aggregate ($)</label>
                    <input type="number" value={l.aggregate_limit} onChange={(e) => updateLine(i, { aggregate_limit: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <input type="checkbox" checked={l.additional_insured_box} onChange={(e) => updateLine(i, { additional_insured_box: e.target.checked })} className="accent-cyan-500" />
                    Additional insured box
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <input type="checkbox" checked={l.subrogation_waived_box} onChange={(e) => updateLine(i, { subrogation_waived_box: e.target.checked })} className="accent-cyan-500" />
                    Subrogation waived
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <input type="checkbox" checked={l.pnc_box} onChange={(e) => updateLine(i, { pnc_box: e.target.checked })} className="accent-cyan-500" />
                    Primary &amp; non-contributory
                  </label>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <datalist id="carrier-options">
          {carriers.map((c) => (
            <option key={c.id} value={c.name || ''} />
          ))}
        </datalist>

        {/* Endorsements */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Endorsements</h2>
            <Button type="button" variant="secondary" onClick={() => setEndorsements((p) => [...p, emptyEndorsement()])}>
              + Add endorsement
            </Button>
          </CardHeader>
          <CardBody className="space-y-4">
            {endorsements.length === 0 && (
              <p className="text-sm text-stone-500">No endorsements added. Attach AI / waiver / P&amp;NC forms to support the boxes above.</p>
            )}
            {endorsements.map((en, i) => (
              <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-cyan-300">Endorsement {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => setEndorsements((p) => p.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>Type</label>
                    <select value={en.endorsement_type} onChange={(e) => updateEndorsement(i, { endorsement_type: e.target.value })} className={inputCls}>
                      {ENDORSEMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Coverage type</label>
                    <select value={en.coverage_type} onChange={(e) => updateEndorsement(i, { coverage_type: e.target.value })} className={inputCls}>
                      {COVERAGE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Form number</label>
                    <input value={en.form_number} onChange={(e) => updateEndorsement(i, { form_number: e.target.value })} placeholder="e.g. CG 20 10" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Edition date</label>
                    <input value={en.edition_date} onChange={(e) => updateEndorsement(i, { edition_date: e.target.value })} placeholder="e.g. 04/13" className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Scheduled holder text</label>
                    <input value={en.scheduled_holder_text} onChange={(e) => updateEndorsement(i, { scheduled_holder_text: e.target.value })} className={inputCls} />
                  </div>
                  <div className="md:col-span-3">
                    <label className={labelCls}>Scope / notes</label>
                    <input value={en.scope} onChange={(e) => updateEndorsement(i, { scope: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <input type="checkbox" checked={en.is_blanket} onChange={(e) => updateEndorsement(i, { is_blanket: e.target.checked })} className="accent-cyan-500" />
                    Blanket
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-300">
                    <input type="checkbox" checked={en.provided} onChange={(e) => updateEndorsement(i, { provided: e.target.checked })} className="accent-cyan-500" />
                    Provided / attached
                  </label>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/certificates">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner label="Creating…" /> : 'Create & grade'}
          </Button>
        </div>
      </form>
    </div>
  )
}
