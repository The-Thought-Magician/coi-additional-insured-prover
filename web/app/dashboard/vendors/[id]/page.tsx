'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Vendor {
  id: string
  legal_name: string
  dba?: string | null
  trade?: string | null
  ein?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  address?: string | null
  status?: string | null
  risk_tier?: string | null
  tags?: string[] | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

interface Scorecard {
  compliant?: number
  deficient?: number
  expired?: number
  open_deficiencies?: number
  certificates?: number
}

interface Assignment {
  id: string
  project_id: string
  project_name?: string
  vendor_id?: string
  vendor_name?: string
  onsite_start?: string | null
  onsite_end?: string | null
  scope_of_work?: string | null
}

interface Certificate {
  id: string
  vendor_id?: string
  project_id?: string
  project_name?: string
  holder_text?: string | null
  insured_name?: string | null
  producer?: string | null
  issue_date?: string | null
  status?: string | null
  compliance_status?: string | null
}

const RISK_TIERS = ['low', 'medium', 'high']
const STATUSES = ['active', 'inactive', 'archived']

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Vendor>>({})
  const [tagsText, setTagsText] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [v, sc, asg, certs] = await Promise.all([
        api.getVendor(id) as Promise<Vendor>,
        api.getVendorScorecard(id).catch(() => null) as Promise<Scorecard | null>,
        api.getVendorAssignments(id).catch(() => []) as Promise<Assignment[]>,
        api.getCertificates({ vendor_id: id }).catch(() => []) as Promise<Certificate[]>,
      ])
      setVendor(v)
      setScorecard(sc)
      setAssignments(Array.isArray(asg) ? asg : [])
      setCertificates(Array.isArray(certs) ? certs : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load vendor')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  function openEdit() {
    if (!vendor) return
    setForm({
      legal_name: vendor.legal_name,
      dba: vendor.dba ?? '',
      trade: vendor.trade ?? '',
      ein: vendor.ein ?? '',
      contact_name: vendor.contact_name ?? '',
      contact_email: vendor.contact_email ?? '',
      contact_phone: vendor.contact_phone ?? '',
      address: vendor.address ?? '',
      status: vendor.status ?? 'active',
      risk_tier: vendor.risk_tier ?? 'standard',
      notes: vendor.notes ?? '',
    })
    setTagsText((vendor.tags ?? []).join(', '))
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const updated = (await api.updateVendor(id, { ...form, tags })) as Vendor
      setVendor(updated)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save vendor')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSpinner label="Loading vendor..." />

  if (error && !vendor) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState
          title="Could not load vendor"
          description={error}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={load}>
                Retry
              </Button>
              <Link href="/dashboard/vendors">
                <Button variant="ghost">Back to vendors</Button>
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!vendor) return null

  const certCount = scorecard?.certificates ?? certificates.length
  const compliant = scorecard?.compliant ?? 0
  const deficient = scorecard?.deficient ?? 0
  const expired = scorecard?.expired ?? 0
  const openDef = scorecard?.open_deficiencies ?? 0
  const compliancePct = certCount > 0 ? Math.round((compliant / certCount) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard/vendors" className="hover:text-amber-400">
              Vendors
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-400">{vendor.legal_name}</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-white">
            {vendor.legal_name}
            {vendor.status && <Badge tone={toneForStatus(vendor.status)}>{vendor.status}</Badge>}
            {vendor.risk_tier && (
              <Badge tone={vendor.risk_tier === 'high' || vendor.risk_tier === 'critical' ? 'danger' : 'info'}>
                {vendor.risk_tier} risk
              </Badge>
            )}
          </h1>
          {(vendor.dba || vendor.trade) && (
            <p className="mt-1 text-sm text-slate-400">
              {vendor.dba ? `DBA ${vendor.dba}` : ''}
              {vendor.dba && vendor.trade ? ' · ' : ''}
              {vendor.trade || ''}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openEdit}>
            Edit vendor
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Scorecard */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Compliance scorecard</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Certificates" value={certCount} />
          <Stat label="Compliant" value={compliant} tone="success" />
          <Stat label="Deficient" value={deficient} tone={deficient > 0 ? 'danger' : 'default'} />
          <Stat label="Expired" value={expired} tone={expired > 0 ? 'warning' : 'default'} />
          <Stat
            label="Open deficiencies"
            value={openDef}
            tone={openDef > 0 ? 'danger' : 'success'}
          />
        </div>

        {/* Compliance bar */}
        <Card className="mt-4">
          <CardBody>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-300">Certificate compliance</span>
              <span className="font-semibold text-white">{compliancePct}%</span>
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
              {certCount > 0 ? (
                <>
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${(compliant / certCount) * 100}%` }}
                    title={`${compliant} compliant`}
                  />
                  <div
                    className="bg-red-500"
                    style={{ width: `${(deficient / certCount) * 100}%` }}
                    title={`${deficient} deficient`}
                  />
                  <div
                    className="bg-amber-500"
                    style={{ width: `${(expired / certCount) * 100}%` }}
                    title={`${expired} expired`}
                  />
                </>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Compliant ({compliant})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Deficient ({deficient})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Expired ({expired})
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vendor profile */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h3 className="font-semibold text-white">Profile</h3>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Field label="EIN" value={vendor.ein} />
            <Field label="Contact" value={vendor.contact_name} />
            <Field
              label="Email"
              value={
                vendor.contact_email ? (
                  <a href={`mailto:${vendor.contact_email}`} className="text-amber-400 hover:underline">
                    {vendor.contact_email}
                  </a>
                ) : null
              }
            />
            <Field label="Phone" value={vendor.contact_phone} />
            <Field label="Address" value={vendor.address} />
            {vendor.tags && vendor.tags.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Tags</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {vendor.tags.map((t) => (
                    <Badge key={t} tone="neutral">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {vendor.notes && (
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Notes</div>
                <p className="mt-1 whitespace-pre-wrap text-slate-300">{vendor.notes}</p>
              </div>
            )}
            <div className="border-t border-slate-800 pt-3 text-xs text-slate-500">
              Created {fmtDate(vendor.created_at)} · Updated {fmtDate(vendor.updated_at)}
            </div>
          </CardBody>
        </Card>

        {/* Assignments + Certificates */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Project assignments</h3>
                <Badge tone="neutral">{assignments.length}</Badge>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {assignments.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No project assignments"
                    description="This vendor is not assigned to any projects yet."
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Project</TH>
                      <TH>Scope</TH>
                      <TH>Onsite</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {assignments.map((a) => (
                      <TR key={a.id}>
                        <TD className="font-medium text-slate-200">
                          {a.project_id ? (
                            <Link href={`/dashboard/projects/${a.project_id}`} className="hover:text-amber-400">
                              {a.project_name || a.project_id}
                            </Link>
                          ) : (
                            a.project_name || '—'
                          )}
                        </TD>
                        <TD>{a.scope_of_work || '—'}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {fmtDate(a.onsite_start)} → {fmtDate(a.onsite_end)}
                        </TD>
                        <TD className="text-right">
                          {a.project_id && (
                            <Link href={`/dashboard/projects/${a.project_id}`}>
                              <Button variant="ghost" className="px-2 py-1 text-xs">
                                View →
                              </Button>
                            </Link>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Certificates</h3>
                <Badge tone="neutral">{certificates.length}</Badge>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {certificates.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No certificates"
                    description="No certificates of insurance have been recorded for this vendor."
                    action={
                      <Link href="/dashboard/certificates/new">
                        <Button>Intake certificate</Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Insured / Holder</TH>
                      <TH>Project</TH>
                      <TH>Issued</TH>
                      <TH>Compliance</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {certificates.map((c) => (
                      <TR key={c.id}>
                        <TD className="font-medium text-slate-200">
                          {c.insured_name || c.holder_text || c.producer || c.id.slice(0, 8)}
                        </TD>
                        <TD>
                          {c.project_id ? (
                            <Link href={`/dashboard/projects/${c.project_id}`} className="hover:text-amber-400">
                              {c.project_name || c.project_id.slice(0, 8)}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TD>
                        <TD className="whitespace-nowrap text-xs">{fmtDate(c.issue_date)}</TD>
                        <TD>
                          <Badge tone={toneForStatus(c.compliance_status || c.status || undefined)}>
                            {c.compliance_status || c.status || 'unknown'}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <Link href={`/dashboard/certificates/${c.id}`}>
                            <Button variant="ghost" className="px-2 py-1 text-xs">
                              Open →
                            </Button>
                          </Link>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        open={editing}
        onClose={() => !saving && setEditing(false)}
        title="Edit vendor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="vendor-edit-form" disabled={saving}>
              {saving ? <Spinner /> : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="vendor-edit-form" onSubmit={saveEdit} className="space-y-4">
          <Input label="Legal name" value={form.legal_name ?? ''} onChange={(v) => setForm({ ...form, legal_name: v })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="DBA" value={form.dba ?? ''} onChange={(v) => setForm({ ...form, dba: v })} />
            <Input label="Trade" value={form.trade ?? ''} onChange={(v) => setForm({ ...form, trade: v })} />
          </div>
          <Input label="EIN" value={form.ein ?? ''} onChange={(v) => setForm({ ...form, ein: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              value={form.status ?? 'active'}
              onChange={(v) => setForm({ ...form, status: v })}
              options={STATUSES}
            />
            <Select
              label="Risk tier"
              value={form.risk_tier ?? 'standard'}
              onChange={(v) => setForm({ ...form, risk_tier: v })}
              options={RISK_TIERS}
            />
          </div>
          <Input label="Contact name" value={form.contact_name ?? ''} onChange={(v) => setForm({ ...form, contact_name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.contact_email ?? ''} onChange={(v) => setForm({ ...form, contact_email: v })} />
            <Input label="Phone" value={form.contact_phone ?? ''} onChange={(v) => setForm({ ...form, contact_phone: v })} />
          </div>
          <Input label="Address" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
          <Input label="Tags (comma separated)" value={tagsText} onChange={setTagsText} />
          <Textarea label="Notes" value={form.notes ?? ''} onChange={(v) => setForm({ ...form, notes: v })} />
        </form>
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-300">{value || '—'}</div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/40'

function Input({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  )
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
