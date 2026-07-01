'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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

interface Template {
  id: string
  name: string
  version?: number
}

const STATUSES = ['active', 'completed', 'on_hold', 'archived']

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const emptyForm = {
  name: '',
  address: '',
  owner_developer: '',
  lender: '',
  prime_contract_ref: '',
  template_id: '',
  lender_mandated: false,
  holder_entity_text: '',
  start_date: '',
  end_date: '',
  status: 'active',
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [formError, setFormError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, t] = await Promise.all([
        api.getProjects() as Promise<Project[]>,
        api.getTemplates().catch(() => []) as Promise<Template[]>,
      ])
      setProjects(Array.isArray(p) ? p : [])
      setTemplates(Array.isArray(t) ? t : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const templateName = useCallback(
    (tid?: string | null) => {
      if (!tid) return null
      return templates.find((t) => t.id === tid)?.name ?? null
    },
    [templates],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (statusFilter && (p.status ?? '') !== statusFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q) ||
        (p.owner_developer ?? '').toLowerCase().includes(q) ||
        (p.lender ?? '').toLowerCase().includes(q)
      )
    })
  }, [projects, search, statusFilter])

  const stats = useMemo(() => {
    const total = projects.length
    const active = projects.filter((p) => (p.status ?? '') === 'active').length
    const lenderMandated = projects.filter((p) => p.lender_mandated).length
    return { total, active, lenderMandated }
  }, [projects])

  function openCreate() {
    setForm({ ...emptyForm })
    setFormError(null)
    setCreating(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const body: any = {
        name: form.name,
        address: form.address || null,
        owner_developer: form.owner_developer || null,
        lender: form.lender || null,
        prime_contract_ref: form.prime_contract_ref || null,
        template_id: form.template_id || null,
        lender_mandated: form.lender_mandated,
        holder_entity_text: form.holder_entity_text || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
      }
      const created = (await api.createProject(body)) as Project
      setProjects((prev) => [created, ...prev])
      setCreating(false)
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: Project) {
    if (!confirm(`Delete project "${p.name}"? This cannot be undone.`)) return
    setDeletingId(p.id)
    setError(null)
    try {
      await api.deleteProject(p.id)
      setProjects((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e: any) {
      setError(e?.message || 'Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading projects..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">
            Job sites with insurance requirements and assigned subcontractors.
          </p>
        </div>
        <Button onClick={openCreate}>+ New project</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}{' '}
          <button onClick={load} className="underline">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total projects" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="success" />
        <Stat label="Lender mandated" value={stats.lenderMandated} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, address, owner, lender..."
              className={`${inputCls} sm:max-w-xs`}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} sm:w-44`}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={projects.length === 0 ? 'No projects yet' : 'No matching projects'}
                description={
                  projects.length === 0
                    ? 'Create your first project to start tracking subcontractor compliance.'
                    : 'Try clearing your search or status filter.'
                }
                action={
                  projects.length === 0 ? <Button onClick={openCreate}>+ New project</Button> : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH>Owner / Lender</TH>
                  <TH>Template</TH>
                  <TH>Dates</TH>
                  <TH>Status</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/dashboard/projects/${p.id}`} className="font-medium text-slate-100 hover:text-amber-400">
                        {p.name}
                      </Link>
                      {p.address && <div className="text-xs text-slate-500">{p.address}</div>}
                      {p.lender_mandated && (
                        <Badge tone="warning" className="mt-1">
                          Lender mandated
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <div>{p.owner_developer || '—'}</div>
                      {p.lender && <div className="text-xs text-slate-500">{p.lender}</div>}
                    </TD>
                    <TD>
                      {templateName(p.template_id) || p.template_name ? (
                        <Badge tone="info">{templateName(p.template_id) || p.template_name}</Badge>
                      ) : (
                        <span className="text-slate-600">none</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">
                      {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                    </TD>
                    <TD>
                      <Badge tone={toneForStatus(p.status ?? undefined)}>{p.status || 'unknown'}</Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/projects/${p.id}`}>
                          <Button variant="ghost" className="px-2 py-1 text-xs">
                            Open
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          disabled={deletingId === p.id}
                          onClick={() => handleDelete(p)}
                        >
                          {deletingId === p.id ? '...' : 'Delete'}
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

      <Modal
        open={creating}
        onClose={() => !saving && setCreating(false)}
        title="New project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="project-create-form" disabled={saving}>
              {saving ? <Spinner /> : 'Create project'}
            </Button>
          </>
        }
      >
        <form id="project-create-form" onSubmit={submitCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <Input label="Project name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Owner / developer" value={form.owner_developer} onChange={(v) => setForm({ ...form, owner_developer: v })} />
            <Input label="Lender" value={form.lender} onChange={(v) => setForm({ ...form, lender: v })} />
          </div>
          <Input label="Prime contract ref" value={form.prime_contract_ref} onChange={(v) => setForm({ ...form, prime_contract_ref: v })} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Requirement template</span>
            <select
              value={form.template_id}
              onChange={(e) => setForm({ ...form, template_id: e.target.value })}
              className={inputCls}
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.version ? ` (v${t.version})` : ''}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <span className="mt-1 block text-xs text-slate-500">
                No templates yet —{' '}
                <Link href="/dashboard/templates" className="text-amber-400 hover:underline">
                  create one
                </Link>
                .
              </span>
            )}
          </label>
          <Input
            label="Holder entity text (Certificate Holder)"
            value={form.holder_entity_text}
            onChange={(v) => setForm({ ...form, holder_entity_text: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <Input label="End date" type="date" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
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
                checked={form.lender_mandated}
                onChange={(e) => setForm({ ...form, lender_mandated: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500/40"
              />
              Lender mandated
            </label>
          </div>
        </form>
      </Modal>
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
