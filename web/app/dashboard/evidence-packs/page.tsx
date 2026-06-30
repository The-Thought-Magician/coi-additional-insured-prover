'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface EvidencePack {
  id: string
  vendor_id?: string | null
  project_id?: string | null
  certificate_id?: string | null
  title?: string
  snapshot?: any
  generated_by?: string
  created_at?: string
}

interface Vendor {
  id: string
  legal_name?: string
  dba?: string
}
interface Project {
  id: string
  name?: string
}
interface Certificate {
  id: string
  insured_name?: string
  vendor_id?: string
  compliance_status?: string
  issue_date?: string
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EvidencePacksPage() {
  const [packs, setPacks] = useState<EvidencePack[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', project_id: '', certificate_id: '', title: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [viewing, setViewing] = useState<EvidencePack | null>(null)
  const [viewLoading, setViewLoading] = useState(false)

  const vendorName = (id?: string | null) => {
    const v = vendors.find((x) => x.id === id)
    return v ? v.dba || v.legal_name || id : id || null
  }
  const projectName = (id?: string | null) => projects.find((x) => x.id === id)?.name || id || null

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [p, v, pr, c] = await Promise.all([api.getEvidencePacks(), api.getVendors(), api.getProjects(), api.getCertificates()])
      setPacks(Array.isArray(p) ? p : [])
      setVendors(Array.isArray(v) ? v : [])
      setProjects(Array.isArray(pr) ? pr : [])
      setCertificates(Array.isArray(c) ? c : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load evidence packs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Certificates filtered by the chosen vendor in the create form.
  const formCerts = useMemo(() => {
    if (!form.vendor_id) return certificates
    return certificates.filter((c) => c.vendor_id === form.vendor_id)
  }, [certificates, form.vendor_id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return packs
    return packs.filter((p) =>
      [p.title, vendorName(p.vendor_id), projectName(p.project_id), p.certificate_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [packs, search, vendors, projects])

  const stats = useMemo(() => {
    const withVendor = packs.filter((p) => p.vendor_id).length
    const withProject = packs.filter((p) => p.project_id).length
    const withCert = packs.filter((p) => p.certificate_id).length
    return { total: packs.length, withVendor, withProject, withCert }
  }, [packs])

  async function submitPack(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!form.vendor_id && !form.project_id && !form.certificate_id) {
      setFormError('Select at least one of vendor, project, or certificate to scope the pack.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const created = await api.createEvidencePack({
        title: form.title.trim(),
        vendor_id: form.vendor_id || undefined,
        project_id: form.project_id || undefined,
        certificate_id: form.certificate_id || undefined,
      })
      setCreateOpen(false)
      setForm({ vendor_id: '', project_id: '', certificate_id: '', title: '' })
      if (created && created.id) {
        setPacks((prev) => [created, ...prev])
        openSnapshot(created.id)
      } else {
        await loadAll()
      }
    } catch (e: any) {
      setFormError(e?.message || 'Failed to generate evidence pack')
    } finally {
      setSubmitting(false)
    }
  }

  async function openSnapshot(id: string) {
    setViewLoading(true)
    setViewing({ id })
    try {
      const full = await api.getEvidencePack(id)
      setViewing(full)
    } catch (e: any) {
      setError(e?.message || 'Failed to load snapshot')
      setViewing(null)
    } finally {
      setViewLoading(false)
    }
  }

  if (loading) return <PageSpinner label="Loading evidence packs..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Evidence Packs</h1>
          <p className="text-sm text-slate-400">Immutable compliance snapshots for audits, lenders, and litigation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadAll}>Refresh</Button>
          <Button onClick={() => { setForm({ vendor_id: '', project_id: '', certificate_id: '', title: '' }); setFormError(null); setCreateOpen(true) }}>
            Generate pack
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total packs" value={stats.total} hint="Generated snapshots" />
        <Stat label="Vendor-scoped" value={stats.withVendor} hint="Per subcontractor" />
        <Stat label="Project-scoped" value={stats.withProject} hint="Per job site" />
        <Stat label="Certificate-scoped" value={stats.withCert} hint="Per COI" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Evidence packs <span className="text-slate-500">({filtered.length})</span>
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, vendor, project..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500/60 focus:outline-none sm:w-72"
            />
          </div>
        </CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              title="No evidence packs yet"
              description="Generate an immutable snapshot scoped to a vendor, project, or certificate to capture compliance state at a point in time."
              action={<Button onClick={() => setCreateOpen(true)}>Generate pack</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Scope</TH>
                  <TH>Vendor</TH>
                  <TH>Project</TH>
                  <TH>Generated</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-slate-200">{p.title || 'Untitled pack'}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {p.vendor_id && <Badge tone="info">Vendor</Badge>}
                        {p.project_id && <Badge tone="amber">Project</Badge>}
                        {p.certificate_id && <Badge tone="success">Certificate</Badge>}
                        {!p.vendor_id && !p.project_id && !p.certificate_id && <Badge tone="neutral">Workspace</Badge>}
                      </div>
                    </TD>
                    <TD>{vendorName(p.vendor_id) || '—'}</TD>
                    <TD>{projectName(p.project_id) || '—'}</TD>
                    <TD className="text-xs text-slate-400">{fmtDate(p.created_at)}</TD>
                    <TD className="text-right">
                      <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => openSnapshot(p.id)}>
                        View snapshot
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate evidence pack"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="pack-form" disabled={submitting}>
              {submitting ? 'Generating...' : 'Generate'}
            </Button>
          </>
        }
      >
        <form id="pack-form" onSubmit={submitPack} className="space-y-4">
          {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
              placeholder="Q2 Lender Compliance Snapshot"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Vendor</label>
            <select
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value, certificate_id: '' })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              <option value="">None</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.dba || v.legal_name || v.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Project</label>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Certificate</label>
            <select
              value={form.certificate_id}
              onChange={(e) => setForm({ ...form, certificate_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              <option value="">None</option>
              {formCerts.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.insured_name || c.id)}{c.compliance_status ? ` — ${c.compliance_status}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Pick at least one scope. Certificates filter to the selected vendor.</p>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title || 'Evidence snapshot'}
        className="max-w-3xl"
        footer={<Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewLoading ? (
          <div className="py-8 text-center"><Spinner label="Loading snapshot..." /></div>
        ) : viewing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Vendor</div>
                <div className="text-slate-200">{vendorName(viewing.vendor_id) || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Project</div>
                <div className="text-slate-200">{projectName(viewing.project_id) || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Certificate</div>
                <div className="font-mono text-xs text-slate-200">{viewing.certificate_id || '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Generated</div>
                <div className="text-slate-200">{fmtDate(viewing.created_at)}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Immutable snapshot</div>
                <Badge tone="success">Frozen at generation</Badge>
              </div>
              {viewing.snapshot ? (
                <SnapshotView snapshot={viewing.snapshot} />
              ) : (
                <p className="text-sm text-slate-500">No snapshot payload available.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function SnapshotView({ snapshot }: { snapshot: any }) {
  const [raw, setRaw] = useState(false)

  const sections: { key: string; value: any }[] = useMemo(() => {
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      return Object.entries(snapshot).map(([key, value]) => ({ key, value }))
    }
    return [{ key: 'snapshot', value: snapshot }]
  }, [snapshot])

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setRaw((r) => !r)} className="text-xs text-amber-400 hover:text-amber-300">
          {raw ? 'Structured view' : 'Raw JSON'}
        </button>
      </div>
      {raw ? (
        <pre className="max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      ) : (
        <div className="space-y-3">
          {sections.map(({ key, value }) => (
            <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {key.replace(/_/g, ' ')}
              </div>
              <div className="px-3 py-2">
                {renderValue(value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderValue(value: any) {
  if (value == null) return <span className="text-sm text-slate-500">—</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-slate-500">Empty</span>
    if (typeof value[0] === 'object' && value[0] !== null) {
      const cols = Array.from(new Set(value.flatMap((row: any) => Object.keys(row))))
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>{cols.map((c) => <th key={c} className="px-2 py-1 font-medium">{c.replace(/_/g, ' ')}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {value.map((row: any, i: number) => (
                <tr key={i}>{cols.map((c) => <td key={c} className="px-2 py-1 text-slate-300">{formatScalar(row[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    return <div className="flex flex-wrap gap-1">{value.map((v, i) => <Badge key={i} tone="neutral">{formatScalar(v)}</Badge>)}</div>
  }
  if (typeof value === 'object') {
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k.replace(/_/g, ' ')}</dt>
            <dd className="text-slate-300">{formatScalar(v)}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return <span className="text-sm text-slate-300">{formatScalar(value)}</span>
}

function formatScalar(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
