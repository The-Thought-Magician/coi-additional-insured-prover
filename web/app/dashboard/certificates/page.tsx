'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'

interface Certificate {
  id: string
  vendor_id?: string | null
  project_id?: string | null
  insured_name?: string | null
  producer?: string | null
  holder_text?: string | null
  issue_date?: string | null
  status?: string | null
  compliance_status?: string | null
  source?: string | null
  created_at?: string | null
}
interface Vendor { id: string; legal_name?: string; dba?: string | null }
interface Project { id: string; name?: string }

const COMPLIANCE_FILTERS = [
  { value: '', label: 'All compliance' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'deficient', label: 'Deficient' },
  { value: 'expired', label: 'Expired' },
  { value: 'pending', label: 'Pending' },
]

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
}

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [complianceFilter, setComplianceFilter] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (vendorFilter) params.vendor_id = vendorFilter
      if (projectFilter) params.project_id = projectFilter
      if (complianceFilter) params.compliance_status = complianceFilter
      const [c, v, p] = await Promise.all([
        api.getCertificates(params),
        api.getVendors(),
        api.getProjects(),
      ])
      setCerts(Array.isArray(c) ? c : [])
      setVendors(Array.isArray(v) ? v : [])
      setProjects(Array.isArray(p) ? p : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load certificates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorFilter, projectFilter, complianceFilter])

  const vendorName = (id?: string | null) => {
    const v = vendors.find((x) => x.id === id)
    return v ? v.dba || v.legal_name || 'Unnamed vendor' : '—'
  }
  const projectName = (id?: string | null) => projects.find((x) => x.id === id)?.name || '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return certs
    return certs.filter((c) => {
      const hay = [
        c.insured_name,
        c.producer,
        c.holder_text,
        vendorName(c.vendor_id),
        projectName(c.project_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certs, search, vendors, projects])

  const counts = useMemo(() => {
    const acc = { total: certs.length, compliant: 0, deficient: 0, expired: 0, pending: 0 }
    for (const c of certs) {
      const s = (c.compliance_status || '').toLowerCase()
      if (s === 'compliant') acc.compliant++
      else if (s === 'deficient') acc.deficient++
      else if (s === 'expired') acc.expired++
      else acc.pending++
    }
    return acc
  }, [certs])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((c) => c.id)),
    )
  }

  async function doDelete(id: string) {
    setBusy(true)
    setError(null)
    try {
      await api.deleteCertificate(id)
      setCerts((prev) => prev.filter((c) => c.id !== id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDeleteTarget(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to delete certificate')
    } finally {
      setBusy(false)
    }
  }

  async function doBulkDelete() {
    setBusy(true)
    setError(null)
    try {
      const ids = Array.from(selected)
      await Promise.all(ids.map((id) => api.deleteCertificate(id)))
      setCerts((prev) => prev.filter((c) => !selected.has(c.id)))
      setSelected(new Set())
      setBulkConfirm(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to delete selected certificates')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Certificates of Insurance</h1>
          <p className="mt-1 text-sm text-slate-400">
            ACORD 25 certificates with additional-insured grading and compliance status.
          </p>
        </div>
        <Link href="/dashboard/certificates/new">
          <Button>+ New Certificate</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Total" value={counts.total} />
        <Stat label="Compliant" value={counts.compliant} tone="success" />
        <Stat label="Deficient" value={counts.deficient} tone="danger" />
        <Stat label="Expired" value={counts.expired} tone="danger" />
        <Stat label="Pending" value={counts.pending} tone="warning" />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Search</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Insured, producer, holder, vendor…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</label>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.dba || v.legal_name || v.id}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Project</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Compliance</label>
            <select
              value={complianceFilter}
              onChange={(e) => setComplianceFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              {COMPLIANCE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          {(search || vendorFilter || projectFilter || complianceFilter) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('')
                setVendorFilter('')
                setProjectFilter('')
                setComplianceFilter('')
              }}
            >
              Clear
            </Button>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="text-sm text-amber-200">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button variant="danger" onClick={() => setBulkConfirm(true)}>
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading certificates…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={certs.length === 0 ? 'No certificates yet' : 'No matching certificates'}
          description={
            certs.length === 0
              ? 'Intake your first ACORD 25 certificate to start grading additional-insured compliance.'
              : 'Try adjusting your filters or search query.'
          }
          icon="📄"
          action={
            certs.length === 0 ? (
              <Link href="/dashboard/certificates/new">
                <Button>+ New Certificate</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="accent-amber-500"
                  aria-label="Select all"
                />
              </TH>
              <TH>Insured</TH>
              <TH>Vendor</TH>
              <TH>Project</TH>
              <TH>Producer</TH>
              <TH>Issued</TH>
              <TH>Status</TH>
              <TH>Compliance</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <TR key={c.id}>
                <TD>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-amber-500"
                    aria-label={`Select ${c.insured_name || c.id}`}
                  />
                </TD>
                <TD>
                  <Link href={`/dashboard/certificates/${c.id}`} className="font-medium text-amber-300 hover:text-amber-200">
                    {c.insured_name || 'Untitled certificate'}
                  </Link>
                  {c.source && <div className="text-xs text-slate-500">{c.source}</div>}
                </TD>
                <TD>{vendorName(c.vendor_id)}</TD>
                <TD>{projectName(c.project_id)}</TD>
                <TD>{c.producer || '—'}</TD>
                <TD>{fmtDate(c.issue_date)}</TD>
                <TD>
                  {c.status ? <Badge tone={toneForStatus(c.status)}>{c.status}</Badge> : <span className="text-slate-600">—</span>}
                </TD>
                <TD>
                  {c.compliance_status ? (
                    <Badge tone={toneForStatus(c.compliance_status)}>{c.compliance_status}</Badge>
                  ) : (
                    <Badge tone="warning">pending</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/certificates/${c.id}`}>
                      <Button variant="secondary" className="px-3 py-1 text-xs">
                        View
                      </Button>
                    </Link>
                    <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setDeleteTarget(c)}>
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => !busy && setDeleteTarget(null)}
        title="Delete certificate"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => deleteTarget && doDelete(deleteTarget.id)} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Delete certificate for <span className="font-semibold text-white">{deleteTarget?.insured_name || 'this vendor'}</span>?
          This removes its coverage lines, endorsements, and gradings. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={bulkConfirm}
        onClose={() => !busy && setBulkConfirm(false)}
        title="Delete selected certificates"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkConfirm(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doBulkDelete} disabled={busy}>
              {busy ? 'Deleting…' : `Delete ${selected.size}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Permanently delete {selected.size} certificate{selected.size === 1 ? '' : 's'} and all their child records? This
          cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
