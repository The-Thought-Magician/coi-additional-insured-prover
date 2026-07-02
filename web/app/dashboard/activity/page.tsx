'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ActivityLog {
  id: string
  workspace_id?: string
  actor_id: string | null
  action: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, any> | null
  created_at?: string
}

function actionTone(action?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const a = (action ?? '').toLowerCase()
  if (a.includes('create') || a.includes('add') || a.includes('assign') || a.includes('resolve')) return 'success'
  if (a.includes('delete') || a.includes('remove') || a.includes('revoke') || a.includes('unassign')) return 'danger'
  if (a.includes('update') || a.includes('edit') || a.includes('waive') || a.includes('regrade')) return 'warning'
  return 'info'
}

function entityTone(entity?: string | null): 'amber' | 'info' | 'neutral' {
  if (!entity) return 'neutral'
  return 'info'
}

function humanize(s?: string | null): string {
  if (!s) return '—'
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function dayKey(iso?: string): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function shortId(id?: string | null): string {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Server-side filters supported by GET /activity (entity_type, actor, date).
  const [entityType, setEntityType] = useState('')
  const [actor, setActor] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  // Client-side filters
  const [actionFilter, setActionFilter] = useState('all')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (entityType) params.entity_type = entityType
      if (actor.trim()) params.actor = actor.trim()
      if (dateFrom) params.date = dateFrom
      const data = await api.getActivity(Object.keys(params).length ? params : undefined)
      setLogs(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entityOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.entity_type || '').filter(Boolean))
    return Array.from(set).sort()
  }, [logs])

  const actionOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action || '').filter(Boolean))
    return Array.from(set).sort()
  }, [logs])

  const actorOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.actor_id || '').filter(Boolean))
    return Array.from(set).sort()
  }, [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs
      .filter((l) => {
        if (actionFilter !== 'all' && (l.action || '') !== actionFilter) return false
        if (q) {
          const hay = `${l.action ?? ''} ${l.entity_type ?? ''} ${l.entity_id ?? ''} ${l.actor_id ?? ''} ${JSON.stringify(l.metadata ?? {})}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return tb - ta
      })
  }, [logs, actionFilter, search])

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    for (const l of filtered) {
      const k = dayKey(l.created_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(l)
    }
    return Array.from(map.entries())
  }, [filtered])

  const stats = useMemo(() => {
    const total = logs.length
    const actors = new Set(logs.map((l) => l.actor_id).filter(Boolean)).size
    const entities = new Set(logs.map((l) => l.entity_type).filter(Boolean)).size
    const today = logs.filter((l) => dayKey(l.created_at) === 'Today').length
    return { total, actors, entities, today }
  }, [logs])

  function resetFilters() {
    setEntityType('')
    setActor('')
    setDateFrom('')
    setActionFilter('all')
    setSearch('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Activity Log</h1>
          <p className="mt-1 text-sm text-stone-400">
            Immutable audit trail of every action taken across vendors, projects, certificates, and compliance records.
          </p>
        </div>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Events" value={stats.total} />
        <Stat label="Today" value={stats.today} tone={stats.today ? 'warning' : 'default'} />
        <Stat label="Actors" value={stats.actors} />
        <Stat label="Entity Types" value={stats.entities} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Entity type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">All entities</option>
                {entityOptions.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Actor</label>
              <input
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                list="activity-actors"
                placeholder="Actor / user id"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
              />
              <datalist id="activity-actors">
                {actorOptions.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={load} className="flex-1">Apply</Button>
              <Button variant="secondary" onClick={() => { resetFilters(); setTimeout(load, 0) }}>Clear</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-stone-800 pt-3">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this page (action, id, metadata)..."
              className="min-w-[200px] flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading activity log..." />
      ) : error ? (
        <EmptyState
          title="Could not load activity log"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions taken in your workspace will be recorded here, creating an audit trail for compliance and disputes."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching events"
          description="Try widening your filters or clearing the search."
          action={<Button variant="secondary" onClick={() => { setActionFilter('all'); setSearch('') }}>Clear page filters</Button>}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">{day}</h2>
                <span className="text-xs text-stone-600">{items.length} event{items.length === 1 ? '' : 's'}</span>
                <div className="h-px flex-1 bg-stone-800" />
              </div>
              <Table>
                <THead>
                  <TR>
                    <TH>Time</TH>
                    <TH>Action</TH>
                    <TH>Entity</TH>
                    <TH>Reference</TH>
                    <TH>Actor</TH>
                    <TH>Details</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap text-stone-400">{fmtTime(l.created_at)}</TD>
                      <TD>
                        <Badge tone={actionTone(l.action)}>{humanize(l.action)}</Badge>
                      </TD>
                      <TD>
                        {l.entity_type ? (
                          <Badge tone={entityTone(l.entity_type)}>{humanize(l.entity_type)}</Badge>
                        ) : (
                          <span className="text-stone-600">—</span>
                        )}
                      </TD>
                      <TD className="font-mono text-xs text-stone-400">{shortId(l.entity_id)}</TD>
                      <TD className="font-mono text-xs text-stone-400">{shortId(l.actor_id)}</TD>
                      <TD className="max-w-xs">
                        {l.metadata && Object.keys(l.metadata).length > 0 ? (
                          <code className="block truncate text-xs text-stone-500" title={JSON.stringify(l.metadata)}>
                            {Object.entries(l.metadata)
                              .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                              .join(', ')}
                          </code>
                        ) : (
                          <span className="text-stone-600">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
