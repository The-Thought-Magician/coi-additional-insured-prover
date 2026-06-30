'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge, toneForStatus, type BadgeTone } from '@/components/ui/Badge'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'

interface Certificate {
  id: string
  vendor_id?: string | null
  project_id?: string | null
  template_id?: string | null
  template_version?: number | null
  insured_name?: string | null
  producer?: string | null
  holder_text?: string | null
  description_of_operations?: string | null
  issue_date?: string | null
  status?: string | null
  compliance_status?: string | null
  source?: string | null
}
interface CoverageLine {
  id: string
  certificate_id: string
  coverage_type?: string | null
  carrier_name?: string | null
  carrier_naic?: string | null
  policy_number?: string | null
  effective_date?: string | null
  expiry_date?: string | null
  each_occurrence?: number | null
  aggregate_limit?: number | null
  additional_insured_box?: boolean | null
  subrogation_waived_box?: boolean | null
  pnc_box?: boolean | null
}
interface Endorsement {
  id: string
  certificate_id: string
  form_number?: string | null
  edition_date?: string | null
  endorsement_type?: string | null
  coverage_type?: string | null
  scope?: string | null
  is_blanket?: boolean | null
  scheduled_holder_text?: string | null
  provided?: boolean | null
}
interface Grading {
  id: string
  overall_status?: string | null
  score?: number | null
  passed_count?: number | null
  failed_count?: number | null
  results?: any
  created_at?: string | null
}
interface Attachment {
  id: string
  filename?: string | null
  file_type?: string | null
  url?: string | null
  created_at?: string | null
}

const COVERAGE_TYPES = ['general_liability', 'auto_liability', 'umbrella', 'workers_comp', 'professional_liability', 'pollution']
const ENDORSEMENT_TYPES = ['additional_insured', 'waiver_of_subrogation', 'primary_noncontributory', 'notice_of_cancellation']

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none'
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
}
function fmtMoney(n?: number | null) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString()}`
}
function YesNo({ v }: { v?: boolean | null }) {
  return v ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>
}

export default function CertificateDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id || '')

  const [cert, setCert] = useState<Certificate | null>(null)
  const [lines, setLines] = useState<CoverageLine[]>([])
  const [endorsements, setEndorsements] = useState<Endorsement[]>([])
  const [gradings, setGradings] = useState<Grading[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regrading, setRegrading] = useState(false)

  // header edit
  const [editing, setEditing] = useState(false)
  const [savingHeader, setSavingHeader] = useState(false)
  const [hdr, setHdr] = useState<Partial<Certificate>>({})

  // line modal
  const [lineModal, setLineModal] = useState<{ mode: 'create' | 'edit'; data: Partial<CoverageLine> } | null>(null)
  // endorsement modal
  const [endModal, setEndModal] = useState<{ mode: 'create' | 'edit'; data: Partial<Endorsement> } | null>(null)
  // attachment modal
  const [attModal, setAttModal] = useState(false)
  const [attDraft, setAttDraft] = useState({ filename: '', file_type: 'application/pdf', url: '' })
  const [busy, setBusy] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const bundle: any = await api.getCertificate(id)
      const c: Certificate = bundle?.certificate || bundle
      setCert(c)
      setHdr({
        insured_name: c?.insured_name || '',
        producer: c?.producer || '',
        holder_text: c?.holder_text || '',
        description_of_operations: c?.description_of_operations || '',
        issue_date: c?.issue_date ? String(c.issue_date).slice(0, 10) : '',
        status: c?.status || '',
      })
      const [cl, en, gr, at] = await Promise.all([
        api.getCoverageLines(id),
        api.getEndorsements(id),
        api.getGradings(id),
        api.getAttachments(id),
      ])
      setLines(Array.isArray(cl) ? cl : [])
      setEndorsements(Array.isArray(en) ? en : [])
      setGradings(Array.isArray(gr) ? gr : [])
      setAttachments(Array.isArray(at) ? at : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load certificate')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleRegrade() {
    setRegrading(true)
    setError(null)
    try {
      await api.regradeCertificate(id)
      // refresh gradings + cert (compliance_status may have changed)
      const [gr, bundle] = await Promise.all([api.getGradings(id), api.getCertificate(id)])
      setGradings(Array.isArray(gr) ? gr : [])
      const c: Certificate = (bundle as any)?.certificate || bundle
      if (c) setCert(c)
    } catch (e: any) {
      setError(e?.message || 'Regrade failed')
    } finally {
      setRegrading(false)
    }
  }

  async function saveHeader() {
    setSavingHeader(true)
    setError(null)
    try {
      const updated: any = await api.updateCertificate(id, {
        insured_name: hdr.insured_name || null,
        producer: hdr.producer || null,
        holder_text: hdr.holder_text || null,
        description_of_operations: hdr.description_of_operations || null,
        issue_date: hdr.issue_date || null,
        status: hdr.status || null,
      })
      setCert((prev) => ({ ...(prev as Certificate), ...(updated?.certificate || updated) }))
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save header')
    } finally {
      setSavingHeader(false)
    }
  }

  // ---- coverage line CRUD ----
  async function saveLine() {
    if (!lineModal) return
    setBusy(true)
    setError(null)
    const d = lineModal.data
    const payload = {
      certificate_id: id,
      coverage_type: d.coverage_type || 'general_liability',
      carrier_name: d.carrier_name || null,
      carrier_naic: d.carrier_naic || null,
      policy_number: d.policy_number || null,
      effective_date: d.effective_date || null,
      expiry_date: d.expiry_date || null,
      each_occurrence: d.each_occurrence != null && d.each_occurrence !== ('' as any) ? Number(d.each_occurrence) : null,
      aggregate_limit: d.aggregate_limit != null && d.aggregate_limit !== ('' as any) ? Number(d.aggregate_limit) : null,
      additional_insured_box: !!d.additional_insured_box,
      subrogation_waived_box: !!d.subrogation_waived_box,
      pnc_box: !!d.pnc_box,
    }
    try {
      if (lineModal.mode === 'create') {
        const created: any = await api.createCoverageLine(payload)
        setLines((prev) => [...prev, created])
      } else if (d.id) {
        const updated: any = await api.updateCoverageLine(d.id, payload)
        setLines((prev) => prev.map((l) => (l.id === d.id ? { ...l, ...updated } : l)))
      }
      setLineModal(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to save coverage line')
    } finally {
      setBusy(false)
    }
  }
  async function deleteLine(lineId: string) {
    setBusy(true)
    try {
      await api.deleteCoverageLine(lineId)
      setLines((prev) => prev.filter((l) => l.id !== lineId))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete line')
    } finally {
      setBusy(false)
    }
  }

  // ---- endorsement CRUD ----
  async function saveEndorsement() {
    if (!endModal) return
    setBusy(true)
    setError(null)
    const d = endModal.data
    const payload = {
      certificate_id: id,
      endorsement_type: d.endorsement_type || 'additional_insured',
      coverage_type: d.coverage_type || null,
      form_number: d.form_number || null,
      edition_date: d.edition_date || null,
      scope: d.scope || null,
      is_blanket: !!d.is_blanket,
      scheduled_holder_text: d.scheduled_holder_text || null,
      provided: d.provided == null ? true : !!d.provided,
    }
    try {
      if (endModal.mode === 'create') {
        const created: any = await api.createEndorsement(payload)
        setEndorsements((prev) => [...prev, created])
      } else if (d.id) {
        const updated: any = await api.updateEndorsement(d.id, payload)
        setEndorsements((prev) => prev.map((e) => (e.id === d.id ? { ...e, ...updated } : e)))
      }
      setEndModal(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to save endorsement')
    } finally {
      setBusy(false)
    }
  }
  async function deleteEndorsement(eid: string) {
    setBusy(true)
    try {
      await api.deleteEndorsement(eid)
      setEndorsements((prev) => prev.filter((e) => e.id !== eid))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete endorsement')
    } finally {
      setBusy(false)
    }
  }

  // ---- attachments ----
  async function saveAttachment() {
    setBusy(true)
    setError(null)
    try {
      const created: any = await api.createAttachment({
        certificate_id: id,
        filename: attDraft.filename || 'attachment',
        file_type: attDraft.file_type || null,
        url: attDraft.url || null,
      })
      setAttachments((prev) => [...prev, created])
      setAttModal(false)
      setAttDraft({ filename: '', file_type: 'application/pdf', url: '' })
    } catch (e: any) {
      setError(e?.message || 'Failed to add attachment')
    } finally {
      setBusy(false)
    }
  }
  async function deleteAttachment(aid: string) {
    setBusy(true)
    try {
      await api.deleteAttachment(aid)
      setAttachments((prev) => prev.filter((a) => a.id !== aid))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete attachment')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading certificate…" />

  if (!cert) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/certificates" className="text-sm text-slate-400 hover:text-amber-300">
          ← Certificates
        </Link>
        <EmptyState title="Certificate not found" description={error || 'This certificate may have been deleted.'} icon="⚠️" />
      </div>
    )
  }

  const latest = gradings[0]
  const reasonCodes: any[] = Array.isArray(latest?.results)
    ? latest!.results
    : Array.isArray(latest?.results?.results)
      ? latest!.results.results
      : Array.isArray(latest?.results?.reason_codes)
        ? latest!.results.reason_codes
        : []

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/certificates" className="text-sm text-slate-400 hover:text-amber-300">
            ← Certificates
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">{cert.insured_name || 'Certificate'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {cert.compliance_status ? (
              <Badge tone={toneForStatus(cert.compliance_status)}>{cert.compliance_status}</Badge>
            ) : (
              <Badge tone="warning">ungraded</Badge>
            )}
            {cert.status && <Badge tone={toneForStatus(cert.status)}>{cert.status}</Badge>}
            {cert.source && <span className="text-xs text-slate-500">source: {cert.source}</span>}
            {cert.template_version != null && <span className="text-xs text-slate-500">template v{cert.template_version}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {cert.vendor_id && (
            <Link href={`/dashboard/vendors/${cert.vendor_id}`}>
              <Button variant="ghost">Vendor</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close editor' : 'Edit header'}
          </Button>
          <Button onClick={handleRegrade} disabled={regrading}>
            {regrading ? <Spinner label="Grading…" /> : 'Regrade'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Grading summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Overall grade"
          value={latest?.overall_status || cert.compliance_status || '—'}
          tone={latest?.overall_status === 'compliant' || cert.compliance_status === 'compliant' ? 'success' : latest?.overall_status ? 'danger' : 'warning'}
        />
        <Stat label="Score" value={latest?.score != null ? `${Math.round(Number(latest.score) * (Number(latest.score) <= 1 ? 100 : 1))}%` : '—'} />
        <Stat label="Checks passed" value={latest?.passed_count ?? '—'} tone="success" />
        <Stat label="Checks failed" value={latest?.failed_count ?? '—'} tone="danger" />
      </div>

      {/* Header edit form */}
      {editing && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Edit header</h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Insured name</label>
              <input value={hdr.insured_name || ''} onChange={(e) => setHdr({ ...hdr, insured_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Producer</label>
              <input value={hdr.producer || ''} onChange={(e) => setHdr({ ...hdr, producer: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Issue date</label>
              <input type="date" value={(hdr.issue_date as string) || ''} onChange={(e) => setHdr({ ...hdr, issue_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <input value={hdr.status || ''} onChange={(e) => setHdr({ ...hdr, status: e.target.value })} placeholder="active / pending / archived" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Certificate holder text</label>
              <input value={hdr.holder_text || ''} onChange={(e) => setHdr({ ...hdr, holder_text: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description of operations</label>
              <textarea value={hdr.description_of_operations || ''} onChange={(e) => setHdr({ ...hdr, description_of_operations: e.target.value })} rows={2} className={inputCls} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={savingHeader}>
                Cancel
              </Button>
              <Button onClick={saveHeader} disabled={savingHeader}>
                {savingHeader ? 'Saving…' : 'Save header'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Header summary (read) */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm md:grid-cols-3">
          <div>
            <div className={labelCls}>Producer</div>
            <div className="text-slate-200">{cert.producer || '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Holder</div>
            <div className="text-slate-200">{cert.holder_text || '—'}</div>
          </div>
          <div>
            <div className={labelCls}>Issued</div>
            <div className="text-slate-200">{fmtDate(cert.issue_date)}</div>
          </div>
          <div className="md:col-span-3">
            <div className={labelCls}>Description of operations</div>
            <div className="text-slate-300">{cert.description_of_operations || '—'}</div>
          </div>
        </CardBody>
      </Card>

      {/* Coverage lines */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Coverage lines</h2>
          <Button variant="secondary" onClick={() => setLineModal({ mode: 'create', data: { coverage_type: 'general_liability' } })}>
            + Add line
          </Button>
        </CardHeader>
        <CardBody>
          {lines.length === 0 ? (
            <EmptyState title="No coverage lines" description="Add coverage lines to grade additional-insured compliance." icon="🛡️" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Coverage</TH>
                  <TH>Carrier</TH>
                  <TH>Policy #</TH>
                  <TH>Effective</TH>
                  <TH>Expiry</TH>
                  <TH>Each occ.</TH>
                  <TH>Aggregate</TH>
                  <TH>AI</TH>
                  <TH>WoS</TH>
                  <TH>P&amp;NC</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium text-slate-200">{(l.coverage_type || '').replace(/_/g, ' ') || '—'}</TD>
                    <TD>
                      {l.carrier_name || '—'}
                      {l.carrier_naic && <div className="text-xs text-slate-500">NAIC {l.carrier_naic}</div>}
                    </TD>
                    <TD>{l.policy_number || '—'}</TD>
                    <TD>{fmtDate(l.effective_date)}</TD>
                    <TD>{fmtDate(l.expiry_date)}</TD>
                    <TD>{fmtMoney(l.each_occurrence)}</TD>
                    <TD>{fmtMoney(l.aggregate_limit)}</TD>
                    <TD><YesNo v={l.additional_insured_box} /></TD>
                    <TD><YesNo v={l.subrogation_waived_box} /></TD>
                    <TD><YesNo v={l.pnc_box} /></TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setLineModal({ mode: 'edit', data: { ...l } })}>
                          Edit
                        </Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs text-red-400 hover:text-red-300" onClick={() => deleteLine(l.id)}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Endorsement ledger */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Endorsement ledger</h2>
          <Button variant="secondary" onClick={() => setEndModal({ mode: 'create', data: { endorsement_type: 'additional_insured', provided: true } })}>
            + Add endorsement
          </Button>
        </CardHeader>
        <CardBody>
          {endorsements.length === 0 ? (
            <EmptyState title="No endorsements logged" description="Record AI / waiver / P&NC forms that back the coverage boxes." icon="📎" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Coverage</TH>
                  <TH>Form #</TH>
                  <TH>Edition</TH>
                  <TH>Blanket</TH>
                  <TH>Holder text</TH>
                  <TH>Provided</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {endorsements.map((en) => (
                  <TR key={en.id}>
                    <TD className="font-medium text-slate-200">{(en.endorsement_type || '').replace(/_/g, ' ') || '—'}</TD>
                    <TD>{(en.coverage_type || '').replace(/_/g, ' ') || '—'}</TD>
                    <TD>{en.form_number || '—'}</TD>
                    <TD>{en.edition_date || '—'}</TD>
                    <TD>{en.is_blanket ? <Badge tone="info">blanket</Badge> : <Badge tone="neutral">scheduled</Badge>}</TD>
                    <TD className="max-w-[200px] truncate">{en.scheduled_holder_text || '—'}</TD>
                    <TD><YesNo v={en.provided} /></TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEndModal({ mode: 'edit', data: { ...en } })}>
                          Edit
                        </Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs text-red-400 hover:text-red-300" onClick={() => deleteEndorsement(en.id)}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Grading & reason codes */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Grading & reason codes</h2>
          <Button onClick={handleRegrade} disabled={regrading} variant="secondary">
            {regrading ? <Spinner label="Grading…" /> : 'Run grading engine'}
          </Button>
        </CardHeader>
        <CardBody className="space-y-5">
          {gradings.length === 0 ? (
            <EmptyState title="Not graded yet" description="Run the grading engine to evaluate this certificate against its requirement template." icon="⚖️" />
          ) : (
            <>
              {/* score bar */}
              {latest?.score != null && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                    <span>Compliance score</span>
                    <span>{Math.round(Number(latest.score) * (Number(latest.score) <= 1 ? 100 : 1))}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400"
                      style={{ width: `${Math.min(100, Math.round(Number(latest.score) * (Number(latest.score) <= 1 ? 100 : 1)))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* reason codes */}
              {reasonCodes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300">Findings</h3>
                  <div className="space-y-2">
                    {reasonCodes.map((r: any, i: number) => {
                      const passed = r.passed === true || r.status === 'passed' || r.ok === true
                      const sev = (r.severity || (passed ? 'passed' : 'failed')) as string
                      const tone: BadgeTone = passed ? 'success' : sev === 'warning' ? 'warning' : 'danger'
                      return (
                        <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge tone={tone}>{passed ? 'PASS' : sev}</Badge>
                              <span className="text-sm font-medium text-slate-200">
                                {r.reason_code || r.code || r.title || r.coverage_type || 'check'}
                              </span>
                            </div>
                            {(r.detail || r.message || r.description) && (
                              <p className="mt-1 text-sm text-slate-400">{r.detail || r.message || r.description}</p>
                            )}
                            {r.remediation && <p className="mt-1 text-xs text-amber-300">Fix: {r.remediation}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* grading history */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-300">Grading history</h3>
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Status</TH>
                      <TH>Score</TH>
                      <TH>Passed</TH>
                      <TH>Failed</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {gradings.map((g) => (
                      <TR key={g.id}>
                        <TD>{fmtDate(g.created_at)}</TD>
                        <TD>{g.overall_status ? <Badge tone={toneForStatus(g.overall_status)}>{g.overall_status}</Badge> : '—'}</TD>
                        <TD>{g.score != null ? `${Math.round(Number(g.score) * (Number(g.score) <= 1 ? 100 : 1))}%` : '—'}</TD>
                        <TD className="text-emerald-400">{g.passed_count ?? '—'}</TD>
                        <TD className="text-red-400">{g.failed_count ?? '—'}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Attachments */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Attachments</h2>
          <Button variant="secondary" onClick={() => setAttModal(true)}>
            + Add attachment
          </Button>
        </CardHeader>
        <CardBody>
          {attachments.length === 0 ? (
            <EmptyState title="No attachments" description="Register the source PDF or supporting documents for this certificate." icon="🗂️" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Filename</TH>
                  <TH>Type</TH>
                  <TH>Added</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {attachments.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium text-slate-200">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-amber-300 hover:text-amber-200">
                          {a.filename || 'file'}
                        </a>
                      ) : (
                        a.filename || 'file'
                      )}
                    </TD>
                    <TD>{a.file_type || '—'}</TD>
                    <TD>{fmtDate(a.created_at)}</TD>
                    <TD className="text-right">
                      <Button variant="ghost" className="px-2 py-1 text-xs text-red-400 hover:text-red-300" onClick={() => deleteAttachment(a.id)}>
                        Delete
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Coverage line modal */}
      <Modal
        open={!!lineModal}
        onClose={() => !busy && setLineModal(null)}
        title={lineModal?.mode === 'edit' ? 'Edit coverage line' : 'Add coverage line'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLineModal(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveLine} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        {lineModal && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Coverage type</label>
              <select value={lineModal.data.coverage_type || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, coverage_type: e.target.value } })} className={inputCls}>
                {COVERAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Carrier</label>
              <input value={lineModal.data.carrier_name || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, carrier_name: e.target.value } })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>NAIC</label>
              <input value={lineModal.data.carrier_naic || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, carrier_naic: e.target.value } })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Policy number</label>
              <input value={lineModal.data.policy_number || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, policy_number: e.target.value } })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Each occurrence ($)</label>
              <input type="number" value={(lineModal.data.each_occurrence as any) ?? ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, each_occurrence: e.target.value as any } })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Effective</label>
              <input type="date" value={(lineModal.data.effective_date as string)?.slice(0, 10) || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, effective_date: e.target.value } })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Expiry</label>
              <input type="date" value={(lineModal.data.expiry_date as string)?.slice(0, 10) || ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, expiry_date: e.target.value } })} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Aggregate ($)</label>
              <input type="number" value={(lineModal.data.aggregate_limit as any) ?? ''} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, aggregate_limit: e.target.value as any } })} className={inputCls} />
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!lineModal.data.additional_insured_box} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, additional_insured_box: e.target.checked } })} className="accent-amber-500" />
                Additional insured
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!lineModal.data.subrogation_waived_box} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, subrogation_waived_box: e.target.checked } })} className="accent-amber-500" />
                Subrogation waived
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!lineModal.data.pnc_box} onChange={(e) => setLineModal({ ...lineModal, data: { ...lineModal.data, pnc_box: e.target.checked } })} className="accent-amber-500" />
                Primary &amp; non-contributory
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* Endorsement modal */}
      <Modal
        open={!!endModal}
        onClose={() => !busy && setEndModal(null)}
        title={endModal?.mode === 'edit' ? 'Edit endorsement' : 'Add endorsement'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEndModal(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveEndorsement} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        {endModal && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Type</label>
              <select value={endModal.data.endorsement_type || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, endorsement_type: e.target.value } })} className={inputCls}>
                {ENDORSEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Coverage type</label>
              <select value={endModal.data.coverage_type || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, coverage_type: e.target.value } })} className={inputCls}>
                <option value="">(any)</option>
                {COVERAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Form number</label>
              <input value={endModal.data.form_number || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, form_number: e.target.value } })} placeholder="e.g. CG 20 10" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Edition date</label>
              <input value={endModal.data.edition_date || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, edition_date: e.target.value } })} placeholder="e.g. 04/13" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Scheduled holder text</label>
              <input value={endModal.data.scheduled_holder_text || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, scheduled_holder_text: e.target.value } })} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Scope / notes</label>
              <input value={endModal.data.scope || ''} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, scope: e.target.value } })} className={inputCls} />
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={!!endModal.data.is_blanket} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, is_blanket: e.target.checked } })} className="accent-amber-500" />
                Blanket
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={endModal.data.provided == null ? true : !!endModal.data.provided} onChange={(e) => setEndModal({ ...endModal, data: { ...endModal.data, provided: e.target.checked } })} className="accent-amber-500" />
                Provided / attached
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* Attachment modal */}
      <Modal
        open={attModal}
        onClose={() => !busy && setAttModal(false)}
        title="Add attachment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAttModal(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveAttachment} disabled={busy || !attDraft.filename}>
              {busy ? 'Saving…' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Filename</label>
            <input value={attDraft.filename} onChange={(e) => setAttDraft({ ...attDraft, filename: e.target.value })} placeholder="coi-2026.pdf" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>File type</label>
            <input value={attDraft.file_type} onChange={(e) => setAttDraft({ ...attDraft, file_type: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>URL</label>
            <input value={attDraft.url} onChange={(e) => setAttDraft({ ...attDraft, url: e.target.value })} placeholder="https://…" className={inputCls} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
