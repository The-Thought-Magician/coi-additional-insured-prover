'use client'
import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, toneForStatus, type BadgeTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ReasonCode {
  id: string
  title: string
  description?: string
  default_severity?: string
  remediation?: string
}

interface Deficiency {
  id: string
  certificate_id?: string
  grading_id?: string
  reason_code?: string
  severity?: string
  detail?: string
  status?: string
  assigned_to?: string | null
  due_date?: string | null
  resolved_at?: string | null
  created_at?: string
}

const STATUSES = ['', 'open', 'in_progress', 'resolved', 'waived']
const SEVERITIES = ['', 'critical', 'high', 'medium', 'low']

function severityTone(sev?: string): BadgeTone {
  const s = (sev ?? '').toLowerCase()
  if (s === 'critical' || s === 'high') return 'danger'
  if (s === 'medium') return 'warning'
  if (s === 'low') return 'info'
  return 'neutral'
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function isOverdue(d: Deficiency) {
  if (!d.due_date) return false
  if (d.status === 'resolved' || d.status === 'waived') return false
  const due = new Date(d.due_date)
  return !isNaN(due.getTime()) && due.getTime() < Date.now()
}

export default function DeficienciesPage() {
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([])
  const [reasonCodes, setReasonCodes] = useState<Record<string, ReasonCode>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('open')
  const [severityFilter, setSeverityFilter] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<Deficiency | null>(null)
  const [assignTo, setAssignTo] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignStatus, setAssignStatus] = useState('open')
  const [assignBusy, setAssignBusy] = useState(false)

  // Waive modal
  const [waiveTarget, setWaiveTarget] = useState<Deficiency | null>(null)
  const [waiveJustification, setWaiveJustification] = useState('')
  const [waiveExpires, setWaiveExpires] = useState('')
  const [waiveBusy, setWaiveBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [defs, codes] = await Promise.all([api.getDeficiencies(), api.getReasonCodes()])
      setDeficiencies(Array.isArray(defs) ? defs : [])
      const map: Record<string, ReasonCode> = {}
      if (Array.isArray(codes)) for (const c of codes) map[c.id] = c
      setReasonCodes(map)
    } catch (e: any) {
      setError(e?.message || 'Failed to load deficiencies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const reasonOptions = useMemo(() => Object.values(reasonCodes).sort((a, b) => a.title.localeCompare(b.title)), [
    reasonCodes,
  ])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deficiencies.filter((d) => {
      if (statusFilter && (d.status || '') !== statusFilter) return false
      if (severityFilter && (d.severity || '').toLowerCase() !== severityFilter) return false
      if (reasonFilter && (d.reason_code || '') !== reasonFilter) return false
      if (q) {
        const rc = d.reason_code ? reasonCodes[d.reason_code] : undefined
        const hay = `${d.detail ?? ''} ${d.reason_code ?? ''} ${rc?.title ?? ''} ${d.assigned_to ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [deficiencies, statusFilter, severityFilter, reasonFilter, search, reasonCodes])

  const stats = useMemo(() => {
    const open = deficiencies.filter((d) => d.status === 'open' || d.status === 'in_progress').length
    const critical = deficiencies.filter(
      (d) => ['critical', 'high'].includes((d.severity || '').toLowerCase()) && d.status !== 'resolved' && d.status !== 'waived'
    ).length
    const overdue = deficiencies.filter((d) => isOverdue(d)).length
    const resolved = deficiencies.filter((d) => d.status === 'resolved').length
    return { open, critical, overdue, resolved }
  }, [deficiencies])

  function applyDef(updated: Deficiency) {
    setDeficiencies((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
  }

  async function quickResolve(d: Deficiency) {
    setBusyId(d.id)
    setActionError(null)
    try {
      const res: Deficiency = await api.resolveDeficiency(d.id)
      applyDef(res && res.id ? res : { ...d, status: 'resolved', resolved_at: new Date().toISOString() })
    } catch (e: any) {
      setActionError(e?.message || 'Failed to resolve')
    } finally {
      setBusyId(null)
    }
  }

  async function quickStatus(d: Deficiency, status: string) {
    setBusyId(d.id)
    setActionError(null)
    try {
      const res: Deficiency = await api.updateDeficiency(d.id, { status })
      applyDef(res && res.id ? res : { ...d, status })
    } catch (e: any) {
      setActionError(e?.message || 'Failed to update status')
    } finally {
      setBusyId(null)
    }
  }

  function openAssign(d: Deficiency) {
    setAssignTarget(d)
    setAssignTo(d.assigned_to ?? '')
    setAssignDue(d.due_date ? d.due_date.slice(0, 10) : '')
    setAssignStatus(d.status || 'open')
    setActionError(null)
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignTarget) return
    setAssignBusy(true)
    setActionError(null)
    try {
      const res: Deficiency = await api.updateDeficiency(assignTarget.id, {
        assigned_to: assignTo.trim() || null,
        due_date: assignDue || null,
        status: assignStatus,
      })
      applyDef(
        res && res.id
          ? res
          : { ...assignTarget, assigned_to: assignTo.trim() || null, due_date: assignDue || null, status: assignStatus }
      )
      setAssignTarget(null)
    } catch (err: any) {
      setActionError(err?.message || 'Failed to assign')
    } finally {
      setAssignBusy(false)
    }
  }

  function openWaive(d: Deficiency) {
    setWaiveTarget(d)
    setWaiveJustification('')
    setWaiveExpires('')
    setActionError(null)
  }

  async function submitWaive(e: React.FormEvent) {
    e.preventDefault()
    if (!waiveTarget) return
    if (!waiveJustification.trim()) {
      setActionError('A justification is required to waive a deficiency.')
      return
    }
    setWaiveBusy(true)
    setActionError(null)
    try {
      await api.createWaiver({
        deficiency_id: waiveTarget.id,
        justification: waiveJustification.trim(),
        expires_at: waiveExpires || null,
      })
      // Creating a waiver sets the deficiency status to waived server-side.
      applyDef({ ...waiveTarget, status: 'waived' })
      setWaiveTarget(null)
    } catch (err: any) {
      setActionError(err?.message || 'Failed to waive deficiency')
    } finally {
      setWaiveBusy(false)
    }
  }

  function reasonTitle(d: Deficiency) {
    const rc = d.reason_code ? reasonCodes[d.reason_code] : undefined
    return rc?.title || d.reason_code || 'Deficiency'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white">Deficiency Workbench</h1>
        <p className="text-sm text-stone-400">
          Triage open compliance deficiencies: assign owners, set due dates, resolve once cured, or waive with
          justification.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open / In Progress" value={stats.open} tone="warning" />
        <Stat label="Critical & High" value={stats.critical} tone="danger" />
        <Stat label="Overdue" value={stats.overdue} tone="danger" />
        <Stat label="Resolved" value={stats.resolved} tone="success" />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search detail, reason, assignee..."
            className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none lg:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? `Status: ${s.replace('_', ' ')}` : 'All statuses'}
              </option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
          >
            {SEVERITIES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? `Severity: ${s}` : 'All severities'}
              </option>
            ))}
          </select>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All reason codes</option>
            {reasonOptions.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.title}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('')
              setStatusFilter('')
              setSeverityFilter('')
              setReasonFilter('')
            }}
          >
            Clear
          </Button>
          <span className="text-xs text-stone-500 lg:ml-auto">
            {filtered.length} of {deficiencies.length}
          </span>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading deficiencies..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="✅"
          title={deficiencies.length === 0 ? 'No deficiencies' : 'No deficiencies match your filters'}
          description={
            deficiencies.length === 0
              ? 'Deficiencies appear here after certificates are graded against requirement templates. Run a regrade on a certificate to surface gaps.'
              : 'Adjust the filters above to widen the view.'
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Reason</TH>
              <TH>Severity</TH>
              <TH>Detail</TH>
              <TH>Assignee</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((d) => {
              const overdue = isOverdue(d)
              const terminal = d.status === 'resolved' || d.status === 'waived'
              return (
                <TR key={d.id}>
                  <TD>
                    <div className="font-medium text-stone-200">{reasonTitle(d)}</div>
                    {d.reason_code && <div className="text-xs text-stone-500">{d.reason_code}</div>}
                  </TD>
                  <TD>
                    <Badge tone={severityTone(d.severity)}>{d.severity || 'n/a'}</Badge>
                  </TD>
                  <TD>
                    <div className="max-w-xs truncate text-stone-400" title={d.detail ?? ''}>
                      {d.detail || '—'}
                    </div>
                  </TD>
                  <TD>{d.assigned_to || <span className="text-stone-600">unassigned</span>}</TD>
                  <TD>
                    <span className={overdue ? 'font-medium text-red-400' : 'text-stone-400'}>
                      {fmtDate(d.due_date)}
                      {overdue && ' (overdue)'}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={toneForStatus(d.status)}>{(d.status || 'open').replace('_', ' ')}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {busyId === d.id ? (
                        <Spinner />
                      ) : (
                        <>
                          <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => openAssign(d)}>
                            Assign
                          </Button>
                          {!terminal && d.status !== 'in_progress' && (
                            <Button
                              variant="ghost"
                              className="px-2.5 py-1 text-xs"
                              onClick={() => quickStatus(d, 'in_progress')}
                            >
                              Start
                            </Button>
                          )}
                          {!terminal && (
                            <Button
                              className="px-2.5 py-1 text-xs"
                              onClick={() => quickResolve(d)}
                            >
                              Resolve
                            </Button>
                          )}
                          {!terminal && (
                            <Button
                              variant="ghost"
                              className="px-2.5 py-1 text-xs text-cyan-400 hover:text-cyan-300"
                              onClick={() => openWaive(d)}
                            >
                              Waive
                            </Button>
                          )}
                          {d.status === 'resolved' && (
                            <Button
                              variant="ghost"
                              className="px-2.5 py-1 text-xs"
                              onClick={() => quickStatus(d, 'open')}
                            >
                              Reopen
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      {/* Assign modal */}
      <Modal
        open={!!assignTarget}
        onClose={() => !assignBusy && setAssignTarget(null)}
        title="Assign Deficiency"
        footer={
          <>
            <Button variant="ghost" onClick={() => !assignBusy && setAssignTarget(null)} disabled={assignBusy}>
              Cancel
            </Button>
            <Button onClick={submitAssign} disabled={assignBusy}>
              {assignBusy ? <Spinner label="Saving..." /> : 'Save'}
            </Button>
          </>
        }
      >
        {assignTarget && (
          <form onSubmit={submitAssign} className="space-y-4">
            <div className="rounded-lg border border-stone-800 bg-stone-950/50 px-3 py-2">
              <div className="text-sm font-medium text-stone-200">{reasonTitle(assignTarget)}</div>
              {assignTarget.detail && <div className="mt-0.5 text-xs text-stone-500">{assignTarget.detail}</div>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Assign To (user id / email)
              </label>
              <input
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                placeholder="e.g. risk@example.com"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Due Date
                </label>
                <input
                  type="date"
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Status
                </label>
                <select
                  value={assignStatus}
                  onChange={(e) => setAssignStatus(e.target.value)}
                  className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
                >
                  {STATUSES.filter(Boolean).map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Waive modal */}
      <Modal
        open={!!waiveTarget}
        onClose={() => !waiveBusy && setWaiveTarget(null)}
        title="Waive Deficiency"
        footer={
          <>
            <Button variant="ghost" onClick={() => !waiveBusy && setWaiveTarget(null)} disabled={waiveBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitWaive} disabled={waiveBusy}>
              {waiveBusy ? <Spinner label="Waiving..." /> : 'Create Waiver'}
            </Button>
          </>
        }
      >
        {waiveTarget && (
          <form onSubmit={submitWaive} className="space-y-4">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200">
              A waiver records an accepted exception and sets this deficiency to <strong>waived</strong>. Document the
              business justification for the audit trail.
            </div>
            <div className="rounded-lg border border-stone-800 bg-stone-950/50 px-3 py-2">
              <div className="text-sm font-medium text-stone-200">{reasonTitle(waiveTarget)}</div>
              {waiveTarget.detail && <div className="mt-0.5 text-xs text-stone-500">{waiveTarget.detail}</div>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Justification
              </label>
              <textarea
                value={waiveJustification}
                onChange={(e) => setWaiveJustification(e.target.value)}
                rows={3}
                placeholder="Why is this deficiency acceptable?"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Expires (optional)
              </label>
              <input
                type="date"
                value={waiveExpires}
                onChange={(e) => setWaiveExpires(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
