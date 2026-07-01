'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
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

interface Project {
  id: string
  name: string
  address?: string | null
  owner_developer?: string | null
  lender?: string | null
  prime_contract_ref?: string | null
  template_id?: string | null
  template_name?: string | null
  lender_mandated?: boolean | null
  holder_entity_text?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  created_at?: string
}

interface Rollup {
  total_vendors?: number
  compliant?: number
  deficient?: number
  expiring?: number
}

interface Assignment {
  id: string
  vendor_id: string
  vendor_name?: string
  vendor_legal_name?: string
  project_id?: string
  onsite_start?: string | null
  onsite_end?: string | null
  scope_of_work?: string | null
  compliance_status?: string | null
  status?: string | null
  risk_tier?: string | null
}

interface Vendor {
  id: string
  legal_name: string
  status?: string | null
  risk_tier?: string | null
}

const STATUSES = ['active', 'completed', 'on_hold', 'archived']

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [project, setProject] = useState<Project | null>(null)
  const [rollup, setRollup] = useState<Rollup | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Project>>({})

  const [assignOpen, setAssignOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignForm, setAssignForm] = useState({ vendor_id: '', onsite_start: '', onsite_end: '', scope_of_work: '' })

  const [unassigningId, setUnassigningId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, r, av, vs] = await Promise.all([
        api.getProject(id) as Promise<Project>,
        api.getProjectRollup(id).catch(() => null) as Promise<Rollup | null>,
        api.getProjectVendors(id).catch(() => []) as Promise<Assignment[]>,
        api.getVendors().catch(() => []) as Promise<Vendor[]>,
      ])
      setProject(p)
      setRollup(r)
      setAssignments(Array.isArray(av) ? av : [])
      setVendors(Array.isArray(vs) ? vs : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const assignedVendorIds = useMemo(() => new Set(assignments.map((a) => a.vendor_id)), [assignments])
  const availableVendors = useMemo(
    () => vendors.filter((v) => !assignedVendorIds.has(v.id)),
    [vendors, assignedVendorIds],
  )

  function openEdit() {
    if (!project) return
    setEditForm({
      name: project.name,
      address: project.address ?? '',
      owner_developer: project.owner_developer ?? '',
      lender: project.lender ?? '',
      prime_contract_ref: project.prime_contract_ref ?? '',
      holder_entity_text: project.holder_entity_text ?? '',
      start_date: project.start_date ?? '',
      end_date: project.end_date ?? '',
      status: project.status ?? 'active',
      lender_mandated: !!project.lender_mandated,
    })
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSavingEdit(true)
    setError(null)
    try {
      const updated = (await api.updateProject(id, editForm)) as Project
      setProject(updated)
      setEditing(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save project')
    } finally {
      setSavingEdit(false)
    }
  }

  function openAssign() {
    setAssignForm({ vendor_id: '', onsite_start: '', onsite_end: '', scope_of_work: '' })
    setAssignError(null)
    setAssignOpen(true)
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    if (!assignForm.vendor_id) {
      setAssignError('Select a vendor')
      return
    }
    setAssigning(true)
    setAssignError(null)
    try {
      await api.assignVendor(id, {
        vendor_id: assignForm.vendor_id,
        onsite_start: assignForm.onsite_start || null,
        onsite_end: assignForm.onsite_end || null,
        scope_of_work: assignForm.scope_of_work || null,
      })
      setAssignOpen(false)
      await load()
    } catch (e: any) {
      setAssignError(e?.message || 'Failed to assign vendor')
    } finally {
      setAssigning(false)
    }
  }

  async function handleUnassign(a: Assignment) {
    const name = a.vendor_legal_name || a.vendor_name || 'this vendor'
    if (!confirm(`Unassign ${name} from this project?`)) return
    setUnassigningId(a.id)
    setError(null)
    try {
      await api.unassignVendor(a.id)
      setAssignments((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e: any) {
      setError(e?.message || 'Failed to unassign vendor')
    } finally {
      setUnassigningId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading project..." />

  if (error && !project) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState
          title="Could not load project"
          description={error}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={load}>
                Retry
              </Button>
              <Link href="/dashboard/projects">
                <Button variant="ghost">Back to projects</Button>
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!project) return null

  const total = rollup?.total_vendors ?? assignments.length
  const compliant = rollup?.compliant ?? 0
  const deficient = rollup?.deficient ?? 0
  const expiring = rollup?.expiring ?? 0
  const compliancePct = total > 0 ? Math.round((compliant / total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 text-sm text-slate-500">
            <Link href="/dashboard/projects" className="hover:text-amber-400">
              Projects
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-400">{project.name}</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-white">
            {project.name}
            {project.status && <Badge tone={toneForStatus(project.status)}>{project.status}</Badge>}
            {project.lender_mandated && <Badge tone="warning">Lender mandated</Badge>}
          </h1>
          {project.address && <p className="mt-1 text-sm text-slate-400">{project.address}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openEdit}>
            Edit project
          </Button>
          <Button onClick={openAssign}>+ Assign vendor</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Compliance rollup */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Vendors on site" value={total} />
        <Stat label="Compliant" value={compliant} tone="success" />
        <Stat label="Deficient" value={deficient} tone={deficient > 0 ? 'danger' : 'default'} />
        <Stat label="Expiring" value={expiring} tone={expiring > 0 ? 'warning' : 'default'} />
      </div>

      <Card>
        <CardBody>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-300">Project compliance</span>
            <span className="font-semibold text-white">{compliancePct}%</span>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            {total > 0 && (
              <>
                <div className="bg-emerald-500" style={{ width: `${(compliant / total) * 100}%` }} title={`${compliant} compliant`} />
                <div className="bg-red-500" style={{ width: `${(deficient / total) * 100}%` }} title={`${deficient} deficient`} />
                <div className="bg-amber-500" style={{ width: `${(expiring / total) * 100}%` }} title={`${expiring} expiring`} />
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Compliant ({compliant})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Deficient ({deficient})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Expiring ({expiring})
            </span>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <h3 className="font-semibold text-white">Project details</h3>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Field label="Owner / developer" value={project.owner_developer} />
            <Field label="Lender" value={project.lender} />
            <Field label="Prime contract ref" value={project.prime_contract_ref} />
            <Field
              label="Requirement template"
              value={
                project.template_id ? (
                  <Link href={`/dashboard/templates/${project.template_id}`} className="text-amber-400 hover:underline">
                    {project.template_name || 'View template'}
                  </Link>
                ) : (
                  <span className="text-slate-600">none</span>
                )
              }
            />
            <Field label="Certificate holder text" value={project.holder_entity_text} />
            <Field label="Start" value={fmtDate(project.start_date)} />
            <Field label="End" value={fmtDate(project.end_date)} />
            <div className="border-t border-slate-800 pt-3 text-xs text-slate-500">
              Created {fmtDate(project.created_at)}
            </div>
          </CardBody>
        </Card>

        {/* Vendor map */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Vendor map</h3>
              <Badge tone="neutral">{assignments.length}</Badge>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {assignments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No vendors assigned"
                  description="Assign subcontractors to track their certificate compliance on this project."
                  action={<Button onClick={openAssign}>+ Assign vendor</Button>}
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Vendor</TH>
                    <TH>Scope</TH>
                    <TH>Onsite window</TH>
                    <TH>Compliance</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {assignments.map((a) => {
                    const vname = a.vendor_legal_name || a.vendor_name || a.vendor_id.slice(0, 8)
                    const comp = a.compliance_status || a.status
                    return (
                      <TR key={a.id}>
                        <TD className="font-medium text-slate-200">
                          <Link href={`/dashboard/vendors/${a.vendor_id}`} className="hover:text-amber-400">
                            {vname}
                          </Link>
                          {a.risk_tier && (
                            <Badge
                              tone={a.risk_tier === 'high' || a.risk_tier === 'critical' ? 'danger' : 'info'}
                              className="ml-2"
                            >
                              {a.risk_tier}
                            </Badge>
                          )}
                        </TD>
                        <TD>{a.scope_of_work || '—'}</TD>
                        <TD className="whitespace-nowrap text-xs">
                          {fmtDate(a.onsite_start)} → {fmtDate(a.onsite_end)}
                        </TD>
                        <TD>
                          {comp ? <Badge tone={toneForStatus(comp)}>{comp}</Badge> : <span className="text-slate-600">—</span>}
                        </TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-1">
                            <Link href={`/dashboard/vendors/${a.vendor_id}`}>
                              <Button variant="ghost" className="px-2 py-1 text-xs">
                                View
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                              disabled={unassigningId === a.id}
                              onClick={() => handleUnassign(a)}
                            >
                              {unassigningId === a.id ? '...' : 'Unassign'}
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        open={editing}
        onClose={() => !savingEdit && setEditing(false)}
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button type="submit" form="project-edit-form" disabled={savingEdit}>
              {savingEdit ? <Spinner /> : 'Save changes'}
            </Button>
          </>
        }
      >
        <form id="project-edit-form" onSubmit={saveEdit} className="space-y-4">
          <Input label="Project name" value={editForm.name ?? ''} onChange={(v) => setEditForm({ ...editForm, name: v })} required />
          <Input label="Address" value={editForm.address ?? ''} onChange={(v) => setEditForm({ ...editForm, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Owner / developer" value={editForm.owner_developer ?? ''} onChange={(v) => setEditForm({ ...editForm, owner_developer: v })} />
            <Input label="Lender" value={editForm.lender ?? ''} onChange={(v) => setEditForm({ ...editForm, lender: v })} />
          </div>
          <Input label="Prime contract ref" value={editForm.prime_contract_ref ?? ''} onChange={(v) => setEditForm({ ...editForm, prime_contract_ref: v })} />
          <Input label="Certificate holder text" value={editForm.holder_entity_text ?? ''} onChange={(v) => setEditForm({ ...editForm, holder_entity_text: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start date" type="date" value={(editForm.start_date as string) ?? ''} onChange={(v) => setEditForm({ ...editForm, start_date: v })} />
            <Input label="End date" type="date" value={(editForm.end_date as string) ?? ''} onChange={(v) => setEditForm({ ...editForm, end_date: v })} />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Status</span>
              <select
                value={editForm.status ?? 'active'}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className={inputCls}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={!!editForm.lender_mandated}
                onChange={(e) => setEditForm({ ...editForm, lender_mandated: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500/40"
              />
              Lender mandated
            </label>
          </div>
        </form>
      </Modal>

      {/* Assign vendor modal */}
      <Modal
        open={assignOpen}
        onClose={() => !assigning && setAssignOpen(false)}
        title="Assign vendor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button type="submit" form="assign-form" disabled={assigning || availableVendors.length === 0}>
              {assigning ? <Spinner /> : 'Assign'}
            </Button>
          </>
        }
      >
        <form id="assign-form" onSubmit={submitAssign} className="space-y-4">
          {assignError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {assignError}
            </div>
          )}
          {availableVendors.length === 0 ? (
            <EmptyState
              title="No vendors available"
              description={
                vendors.length === 0
                  ? 'Create a vendor first before assigning to a project.'
                  : 'All vendors are already assigned to this project.'
              }
              action={
                vendors.length === 0 ? (
                  <Link href="/dashboard/vendors">
                    <Button variant="secondary">Go to vendors</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">Vendor</span>
                <select
                  value={assignForm.vendor_id}
                  onChange={(e) => setAssignForm({ ...assignForm, vendor_id: e.target.value })}
                  className={inputCls}
                  required
                >
                  <option value="">Select a vendor...</option>
                  {availableVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.legal_name}
                      {v.risk_tier ? ` (${v.risk_tier})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Onsite start" type="date" value={assignForm.onsite_start} onChange={(v) => setAssignForm({ ...assignForm, onsite_start: v })} />
                <Input label="Onsite end" type="date" value={assignForm.onsite_end} onChange={(v) => setAssignForm({ ...assignForm, onsite_end: v })} />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">Scope of work</span>
                <textarea
                  rows={3}
                  value={assignForm.scope_of_work}
                  onChange={(e) => setAssignForm({ ...assignForm, scope_of_work: e.target.value })}
                  className={inputCls}
                />
              </label>
            </>
          )}
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
