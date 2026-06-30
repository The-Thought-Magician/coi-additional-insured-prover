'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Waiver {
  id: string
  workspace_id: string
  deficiency_id: string | null
  justification: string | null
  waived_by: string | null
  expires_at: string | null
  created_at: string
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function expiryState(expires?: string | null): 'none' | 'active' | 'expiring' | 'expired' {
  if (!expires) return 'none'
  const dt = new Date(expires)
  if (isNaN(dt.getTime())) return 'none'
  const days = Math.floor((dt.getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring'
  return 'active'
}

export default function WaiversPage() {
  const [waivers, setWaivers] = useState<Waiver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getWaivers()
      setWaivers(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load waivers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    let active = 0
    let expiring = 0
    let expired = 0
    let perpetual = 0
    for (const w of waivers) {
      const st = expiryState(w.expires_at)
      if (st === 'active') active++
      else if (st === 'expiring') expiring++
      else if (st === 'expired') expired++
      else perpetual++
    }
    return { total: waivers.length, active, expiring, expired, perpetual }
  }, [waivers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return waivers
      .filter((w) => {
        if (q) {
          const hay = `${w.justification ?? ''} ${w.waived_by ?? ''} ${w.deficiency_id ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (filter !== 'all') {
          const st = expiryState(w.expires_at)
          if (filter === 'active' && !(st === 'active' || st === 'none')) return false
          if (filter === 'expiring' && st !== 'expiring') return false
          if (filter === 'expired' && st !== 'expired') return false
        }
        return true
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [waivers, search, filter])

  async function revoke(w: Waiver) {
    if (!confirm('Revoke this waiver? The linked deficiency will be reopened.')) return
    setRevokingId(w.id)
    try {
      await api.deleteWaiver(w.id)
      setWaivers((prev) => prev.filter((x) => x.id !== w.id))
    } catch (e: any) {
      alert(e?.message || 'Failed to revoke waiver')
    } finally {
      setRevokingId(null)
    }
  }

  function expiryBadge(w: Waiver) {
    const st = expiryState(w.expires_at)
    if (st === 'none') return <Badge tone="info">No expiry</Badge>
    if (st === 'expired') return <Badge tone="danger">Expired {fmtDate(w.expires_at)}</Badge>
    if (st === 'expiring') return <Badge tone="warning">Expires {fmtDate(w.expires_at)}</Badge>
    return <Badge tone="success">Until {fmtDate(w.expires_at)}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Waivers &amp; Exceptions</h1>
          <p className="mt-1 text-sm text-slate-400">
            Documented exceptions that suppress an open deficiency. Revoking a waiver reopens the underlying deficiency.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Waivers" value={stats.total} />
        <Stat label="Active" value={stats.active + stats.perpetual} tone="success" hint={`${stats.perpetual} with no expiry`} />
        <Stat label="Expiring ≤30d" value={stats.expiring} tone={stats.expiring ? 'warning' : 'default'} />
        <Stat label="Expired" value={stats.expired} tone={stats.expired ? 'danger' : 'default'} hint="Still suppressing" />
      </div>

      {stats.expired > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardBody>
            <div className="flex items-center gap-3 text-sm text-red-300">
              <span className="text-lg">⚠</span>
              <span>
                {stats.expired} waiver{stats.expired === 1 ? '' : 's'} {stats.expired === 1 ? 'has' : 'have'} passed{' '}
                {stats.expired === 1 ? 'its' : 'their'} expiry date but {stats.expired === 1 ? 'is' : 'are'} still
                suppressing a deficiency. Review and revoke to re-flag the compliance gap.
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search justification, waived by..."
              className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-950 p-1">
              {(['all', 'active', 'expiring', 'expired'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    filter === f ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading waivers..." />
      ) : error ? (
        <EmptyState
          title="Could not load waivers"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : waivers.length === 0 ? (
        <EmptyState
          title="No waivers issued"
          description="Waivers are created from the Deficiencies workbench when you accept a documented exception. They appear here for tracking and revocation."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching waivers" description="Try clearing your search or filters." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Deficiency</TH>
              <TH>Justification</TH>
              <TH>Waived By</TH>
              <TH>Issued</TH>
              <TH>Expiry</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((w) => (
              <TR key={w.id}>
                <TD className="font-mono text-xs text-slate-400">
                  {w.deficiency_id ? w.deficiency_id.slice(0, 8) : '—'}
                </TD>
                <TD className="max-w-md text-slate-200">
                  <span className="line-clamp-2" title={w.justification ?? ''}>
                    {w.justification || <span className="text-slate-600">No justification recorded</span>}
                  </span>
                </TD>
                <TD className="font-mono text-xs text-slate-400">
                  {w.waived_by ? w.waived_by.slice(0, 8) : '—'}
                </TD>
                <TD className="text-slate-400">{fmtDate(w.created_at)}</TD>
                <TD>{expiryBadge(w)}</TD>
                <TD className="text-right">
                  <Button
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    onClick={() => revoke(w)}
                    disabled={revokingId === w.id}
                  >
                    {revokingId === w.id ? <Spinner /> : 'Revoke'}
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
