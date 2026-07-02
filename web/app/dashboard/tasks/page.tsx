'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Task {
  id: string
  workspace_id: string
  title: string
  description: string | null
  task_type: string | null
  status: string
  assigned_to: string | null
  due_date: string | null
  vendor_id: string | null
  project_id: string | null
  certificate_id: string | null
  deficiency_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Vendor {
  id: string
  legal_name: string
}
interface Project {
  id: string
  name: string
}

const TASK_TYPES = ['follow_up', 'request_coi', 'review', 'remediation', 'renewal', 'general']
const OPEN_STATUSES = ['open', 'in_progress']

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function isOverdue(t: Task): boolean {
  if (!t.due_date) return false
  if (!OPEN_STATUSES.includes(t.status)) return false
  const dt = new Date(t.due_date)
  if (isNaN(dt.getTime())) return false
  return dt.getTime() < Date.now() - 86400000 // before yesterday EOD
}

function dueTone(t: Task): 'danger' | 'warning' | 'neutral' {
  if (!t.due_date || !OPEN_STATUSES.includes(t.status)) return 'neutral'
  const days = Math.floor((new Date(t.due_date).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'danger'
  if (days <= 3) return 'warning'
  return 'neutral'
}

const emptyForm = {
  title: '',
  description: '',
  task_type: 'follow_up',
  due_date: '',
  vendor_id: '',
  project_id: '',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [scope, setScope] = useState<'mine' | 'overdue' | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [t, v, p] = await Promise.all([api.getTasks(), api.getVendors(), api.getProjects()])
      setTasks(Array.isArray(t) ? t : [])
      setVendors(Array.isArray(v) ? v : [])
      setProjects(Array.isArray(p) ? p : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    authClient
      .getSession()
      .then((s: any) => setUserId(s?.user?.id ?? s?.data?.user?.id ?? null))
      .catch(() => setUserId(null))
  }, [])

  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.legal_name
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name

  const stats = useMemo(() => {
    const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length
    const overdue = tasks.filter(isOverdue).length
    const mine = userId ? tasks.filter((t) => t.assigned_to === userId && OPEN_STATUSES.includes(t.status)).length : 0
    const done = tasks.filter((t) => t.status === 'completed' || t.status === 'done').length
    return { open, overdue, mine, done }
  }, [tasks, userId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks
      .filter((t) => {
        if (scope === 'mine') {
          if (!userId || t.assigned_to !== userId) return false
        }
        if (scope === 'overdue' && !isOverdue(t)) return false
        if (statusFilter === 'open' && !OPEN_STATUSES.includes(t.status)) return false
        if (statusFilter === 'completed' && !(t.status === 'completed' || t.status === 'done')) return false
        if (q) {
          const hay = `${t.title} ${t.description ?? ''} ${vendorName(t.vendor_id) ?? ''} ${projectName(t.project_id) ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        // overdue & nearest due first, then created desc
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
        if (ad !== bd) return ad - bd
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [tasks, scope, statusFilter, search, userId, vendors, projects])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(t: Task) {
    setEditing(t)
    setForm({
      title: t.title || '',
      description: t.description || '',
      task_type: t.task_type || 'follow_up',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
      vendor_id: t.vendor_id || '',
      project_id: t.project_id || '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.title.trim()) {
      setFormError('Title is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const body: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      task_type: form.task_type,
      due_date: form.due_date || null,
      vendor_id: form.vendor_id || null,
      project_id: form.project_id || null,
    }
    try {
      if (editing) {
        await api.updateTask(editing.id, body)
      } else {
        await api.createTask(body)
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(t: Task, status: string) {
    setBusyId(t.id)
    try {
      const updated = await api.updateTask(t.id, { status })
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...(updated || {}), status } : x)))
    } catch (e: any) {
      alert(e?.message || 'Failed to update task')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return
    setBusyId(t.id)
    try {
      await api.deleteTask(t.id)
      setTasks((prev) => prev.filter((x) => x.id !== t.id))
    } catch (e: any) {
      alert(e?.message || 'Failed to delete task')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Workbench</h1>
          <p className="mt-1 text-sm text-stone-400">
            Follow-ups, COI requests, and remediation work tied to vendors and projects.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Task</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Open" value={stats.open} />
        <Stat label="Assigned to Me" value={stats.mine} tone={stats.mine ? 'warning' : 'default'} />
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'danger' : 'default'} />
        <Stat label="Completed" value={stats.done} tone="success" />
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg border border-stone-700 bg-stone-950 p-1">
              {(['all', 'mine', 'overdue'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    scope === s ? 'bg-cyan-500 text-stone-950' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  {s === 'all' ? 'All Tasks' : s}
                </button>
              ))}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="open">Open &amp; in progress</option>
              <option value="completed">Completed</option>
              <option value="all">Any status</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="min-w-[180px] flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading tasks..." />
      ) : error ? (
        <EmptyState
          title="Could not load tasks"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Create follow-up and remediation tasks to track outstanding COI work across your vendors and projects."
          action={<Button onClick={openCreate}>+ New Task</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching tasks" description="Try a different scope, status, or search." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Task</TH>
              <TH>Type</TH>
              <TH>Linked</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((t) => {
              const done = t.status === 'completed' || t.status === 'done'
              return (
                <TR key={t.id}>
                  <TD>
                    <div className={`font-medium ${done ? 'text-stone-500 line-through' : 'text-stone-100'}`}>{t.title}</div>
                    {t.description && <div className="mt-0.5 line-clamp-1 text-xs text-stone-500">{t.description}</div>}
                  </TD>
                  <TD>
                    <span className="text-xs capitalize text-stone-400">{(t.task_type || 'general').replace(/_/g, ' ')}</span>
                  </TD>
                  <TD className="text-xs text-stone-400">
                    {vendorName(t.vendor_id) && <div>🏢 {vendorName(t.vendor_id)}</div>}
                    {projectName(t.project_id) && <div>📋 {projectName(t.project_id)}</div>}
                    {!t.vendor_id && !t.project_id && <span className="text-stone-600">—</span>}
                  </TD>
                  <TD>
                    {t.due_date ? (
                      <Badge tone={dueTone(t)}>
                        {isOverdue(t) ? 'Overdue ' : ''}
                        {fmtDate(t.due_date)}
                      </Badge>
                    ) : (
                      <span className="text-stone-600">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={toneForStatus(done ? 'resolved' : t.status)}>{(t.status || 'open').replace(/_/g, ' ')}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {!done ? (
                        <>
                          {t.status === 'open' && (
                            <Button variant="ghost" onClick={() => setStatus(t, 'in_progress')} disabled={busyId === t.id}>
                              Start
                            </Button>
                          )}
                          <Button variant="secondary" onClick={() => setStatus(t, 'completed')} disabled={busyId === t.id}>
                            {busyId === t.id ? <Spinner /> : 'Complete'}
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" onClick={() => setStatus(t, 'open')} disabled={busyId === t.id}>
                          Reopen
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => openEdit(t)} disabled={busyId === t.id}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => remove(t)}
                        disabled={busyId === t.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Task' : 'New Task'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save Changes' : 'Create Task'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Request updated AI endorsement from ACME Electric"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Type</label>
              <select
                value={form.task_type}
                onChange={(e) => setForm({ ...form, task_type: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                {TASK_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {tt.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.legal_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
