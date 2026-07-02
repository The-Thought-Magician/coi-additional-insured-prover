'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'

interface Notification {
  id: string
  workspace_id?: string
  user_id?: string
  type: string | null
  title: string | null
  body: string | null
  link: string | null
  read: boolean | null
  created_at?: string
}

type Filter = 'all' | 'unread' | 'read'

function typeTone(type?: string | null): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const t = (type ?? '').toLowerCase()
  if (t.includes('expire') || t.includes('expired') || t.includes('deficien') || t.includes('uninsured') || t.includes('lapse')) return 'danger'
  if (t.includes('renew') || t.includes('expiring') || t.includes('due') || t.includes('reminder') || t.includes('warning')) return 'warning'
  if (t.includes('resolved') || t.includes('compliant') || t.includes('approved') || t.includes('cleared')) return 'success'
  return 'info'
}

function relativeTime(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function typeLabel(type?: string | null): string {
  if (!type) return 'Notice'
  return type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getNotifications()
      setNotifications(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const total = notifications.length
    const unread = notifications.filter((n) => !n.read).length
    const critical = notifications.filter((n) => !n.read && typeTone(n.type) === 'danger').length
    return { total, unread, read: total - unread, critical }
  }, [notifications])

  const typeOptions = useMemo(() => {
    const set = new Set(notifications.map((n) => n.type || '').filter(Boolean))
    return Array.from(set).sort()
  }, [notifications])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notifications
      .filter((n) => {
        if (filter === 'unread' && n.read) return false
        if (filter === 'read' && !n.read) return false
        if (typeFilter !== 'all' && (n.type || '') !== typeFilter) return false
        if (q) {
          const hay = `${n.title ?? ''} ${n.body ?? ''} ${n.type ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return tb - ta
      })
  }, [notifications, filter, typeFilter, search])

  async function markRead(n: Notification) {
    if (n.read) return
    setMarkingId(n.id)
    // optimistic
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    try {
      await api.markNotificationRead(n.id)
    } catch (e: any) {
      // revert on failure
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)))
      alert(e?.message || 'Failed to mark notification read')
    } finally {
      setMarkingId(null)
    }
  }

  async function markAll() {
    if (stats.unread === 0) return
    setMarkingAll(true)
    const snapshot = notifications
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })))
    try {
      await api.markAllNotificationsRead()
    } catch (e: any) {
      setNotifications(snapshot)
      alert(e?.message || 'Failed to mark all read')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-stone-400">
            Compliance alerts, renewal reminders, and deficiency notices for your workspace.
          </p>
        </div>
        <Button variant="secondary" onClick={markAll} disabled={markingAll || stats.unread === 0}>
          {markingAll ? <Spinner /> : `Mark all read${stats.unread ? ` (${stats.unread})` : ''}`}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="Unread" value={stats.unread} tone={stats.unread ? 'warning' : 'default'} />
        <Stat label="Critical Unread" value={stats.critical} tone={stats.critical ? 'danger' : 'default'} />
        <Stat label="Read" value={stats.read} tone="success" />
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-stone-700">
              {(['all', 'unread', 'read'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    filter === f ? 'bg-cyan-500 text-stone-950' : 'bg-stone-950 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All types</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="min-w-[200px] flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading notifications..." />
      ) : error ? (
        <EmptyState
          title="Could not load notifications"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="All caught up"
          description="You have no notifications. Compliance alerts and renewal reminders will appear here as they are generated."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching notifications" description="Try clearing your filters or search." />
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className={n.read ? 'opacity-70' : 'border-l-2 border-l-cyan-500'}
            >
              <CardBody className="flex items-start gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${n.read ? 'bg-stone-700' : 'bg-cyan-400'}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-100">{n.title || typeLabel(n.type)}</span>
                    <Badge tone={typeTone(n.type)}>{typeLabel(n.type)}</Badge>
                    {!n.read && <Badge tone="amber">New</Badge>}
                  </div>
                  {n.body && <p className="mt-1 text-sm text-stone-400">{n.body}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                    <span>{relativeTime(n.created_at)}</span>
                    {n.link && (
                      <a href={n.link} className="text-cyan-400 hover:text-cyan-300">
                        View details →
                      </a>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <Button
                    variant="ghost"
                    onClick={() => markRead(n)}
                    disabled={markingId === n.id}
                    className="flex-shrink-0"
                  >
                    {markingId === n.id ? <Spinner /> : 'Mark read'}
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
