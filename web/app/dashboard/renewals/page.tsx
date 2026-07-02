'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface RadarLine {
  id?: string
  certificate_id?: string
  vendor_id?: string
  vendor_name?: string
  coverage_type?: string
  carrier_name?: string
  policy_number?: string
  expiry_date?: string
  each_occurrence?: number | string
}

interface Radar {
  expired: RadarLine[]
  in30: RadarLine[]
  in60: RadarLine[]
  in90: RadarLine[]
}

interface Reminder {
  id: string
  vendor_id?: string
  certificate_id?: string | null
  coverage_type?: string
  expiry_date?: string
  status?: string
  requested_at?: string | null
  created_at?: string
}

const EMPTY_RADAR: Radar = { expired: [], in30: [], in60: [], in90: [] }

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysUntil(s?: string): number | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return Math.round((d.getTime() - Date.now()) / 86400000)
}

const BUCKETS: { key: keyof Radar; label: string; tone: 'danger' | 'warning' | 'amber' | 'info'; hint: string }[] = [
  { key: 'expired', label: 'Expired', tone: 'danger', hint: 'Coverage already lapsed' },
  { key: 'in30', label: 'Due in 0–30 days', tone: 'danger', hint: 'Urgent renewal window' },
  { key: 'in60', label: 'Due in 31–60 days', tone: 'warning', hint: 'Plan outreach now' },
  { key: 'in90', label: 'Due in 61–90 days', tone: 'amber', hint: 'On the horizon' },
]

export default function RenewalsPage() {
  const [radar, setRadar] = useState<Radar>(EMPTY_RADAR)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeBucket, setActiveBucket] = useState<keyof Radar>('in30')
  const [search, setSearch] = useState('')
  const [reminderFilter, setReminderFilter] = useState<'all' | 'pending' | 'requested'>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ vendor_id: '', certificate_id: '', expiry_date: '', coverage_type: 'General Liability' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [r, rem] = await Promise.all([api.getRenewalRadar(), api.getReminders()])
      setRadar({ ...EMPTY_RADAR, ...(r || {}) })
      setReminders(Array.isArray(rem) ? rem : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load renewals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(
    () => ({
      expired: radar.expired?.length ?? 0,
      in30: radar.in30?.length ?? 0,
      in60: radar.in60?.length ?? 0,
      in90: radar.in90?.length ?? 0,
    }),
    [radar],
  )
  const total = counts.expired + counts.in30 + counts.in60 + counts.in90
  const maxCount = Math.max(1, counts.expired, counts.in30, counts.in60, counts.in90)

  const bucketRows = useMemo(() => {
    const rows = radar[activeBucket] ?? []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.vendor_name, row.coverage_type, row.carrier_name, row.policy_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [radar, activeBucket, search])

  const filteredReminders = useMemo(() => {
    if (reminderFilter === 'all') return reminders
    if (reminderFilter === 'requested') return reminders.filter((r) => (r.status ?? '').toLowerCase() === 'requested' || r.requested_at)
    return reminders.filter((r) => (r.status ?? 'pending').toLowerCase() === 'pending' && !r.requested_at)
  }, [reminders, reminderFilter])

  function prefillFromLine(line: RadarLine) {
    setForm({
      vendor_id: line.vendor_id || '',
      certificate_id: line.certificate_id || '',
      expiry_date: line.expiry_date ? line.expiry_date.slice(0, 10) : '',
      coverage_type: line.coverage_type || 'General Liability',
    })
    setFormError(null)
    setCreateOpen(true)
  }

  async function submitReminder(e: React.FormEvent) {
    e.preventDefault()
    if (!form.vendor_id.trim()) {
      setFormError('Vendor ID is required.')
      return
    }
    if (!form.expiry_date) {
      setFormError('Expiry date is required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await api.createReminder({
        vendor_id: form.vendor_id.trim(),
        certificate_id: form.certificate_id.trim() || undefined,
        expiry_date: form.expiry_date,
        coverage_type: form.coverage_type,
      })
      setCreateOpen(false)
      setForm({ vendor_id: '', certificate_id: '', expiry_date: '', coverage_type: 'General Liability' })
      await load()
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create reminder')
    } finally {
      setSubmitting(false)
    }
  }

  async function onRequestRenewal(id: string) {
    setRequestingId(id)
    try {
      const updated = await api.requestRenewal(id)
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...(updated || {}), status: 'requested', requested_at: updated?.requested_at || new Date().toISOString() } : r)))
    } catch (e: any) {
      setError(e?.message || 'Failed to request renewal')
    } finally {
      setRequestingId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading renewal radar..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Renewals</h1>
          <p className="text-sm text-stone-400">Expiry radar and outreach for lapsing coverage.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}>Refresh</Button>
          <Button onClick={() => { setForm({ vendor_id: '', certificate_id: '', expiry_date: '', coverage_type: 'General Liability' }); setFormError(null); setCreateOpen(true) }}>
            New reminder
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {BUCKETS.map((b) => {
          const c = counts[b.key]
          const active = activeBucket === b.key
          return (
            <button key={b.key} type="button" onClick={() => setActiveBucket(b.key)} className="text-left">
              <Stat
                label={b.label}
                value={c}
                hint={b.hint}
                tone={b.tone === 'amber' ? 'warning' : (b.tone as any)}
                className={`transition-colors ${active ? 'ring-2 ring-cyan-500/60' : 'hover:border-stone-700'}`}
              />
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200">Radar distribution</h2>
            <span className="text-xs text-stone-500">{total} expiring coverage lines</span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {BUCKETS.map((b) => {
              const c = counts[b.key]
              const pct = Math.round((c / maxCount) * 100)
              const barColor =
                b.tone === 'danger' ? 'bg-red-500' : b.tone === 'warning' ? 'bg-cyan-500' : b.tone === 'amber' ? 'bg-cyan-400' : 'bg-sky-500'
              return (
                <div key={b.key} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 text-xs text-stone-400">{b.label}</div>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-stone-800">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.max(c > 0 ? 6 : 0, pct)}%` }} />
                  </div>
                  <div className="w-10 shrink-0 text-right text-sm font-semibold text-white">{c}</div>
                </div>
              )
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-stone-200">
              {BUCKETS.find((b) => b.key === activeBucket)?.label} <span className="text-stone-500">({bucketRows.length})</span>
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, carrier, policy..."
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500/60 focus:outline-none sm:w-72"
            />
          </div>
        </CardHeader>
        <CardBody>
          {bucketRows.length === 0 ? (
            <EmptyState title="No coverage lines in this bucket" description="Nothing matches the current bucket or search." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Vendor</TH>
                  <TH>Coverage</TH>
                  <TH>Carrier</TH>
                  <TH>Policy #</TH>
                  <TH>Expiry</TH>
                  <TH>Days</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {bucketRows.map((row, i) => {
                  const d = daysUntil(row.expiry_date)
                  return (
                    <TR key={row.id || row.certificate_id || i}>
                      <TD className="font-medium text-stone-200">{row.vendor_name || row.vendor_id || '—'}</TD>
                      <TD>{row.coverage_type || '—'}</TD>
                      <TD>{row.carrier_name || '—'}</TD>
                      <TD className="font-mono text-xs">{row.policy_number || '—'}</TD>
                      <TD>{fmtDate(row.expiry_date)}</TD>
                      <TD>
                        {d === null ? '—' : d < 0 ? <Badge tone="danger">{Math.abs(d)}d ago</Badge> : <Badge tone={d <= 30 ? 'danger' : d <= 60 ? 'warning' : 'amber'}>{d}d</Badge>}
                      </TD>
                      <TD className="text-right">
                        <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => prefillFromLine(row)}>
                          Add reminder
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-stone-200">
              Renewal reminders <span className="text-stone-500">({filteredReminders.length})</span>
            </h2>
            <div className="flex gap-1 rounded-lg border border-stone-700 bg-stone-950 p-1 text-xs">
              {(['all', 'pending', 'requested'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReminderFilter(f)}
                  className={`rounded px-3 py-1 capitalize transition-colors ${reminderFilter === f ? 'bg-cyan-500 text-stone-950' : 'text-stone-400 hover:text-white'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {filteredReminders.length === 0 ? (
            <EmptyState
              title="No reminders"
              description="Create a renewal reminder from the radar above or with the New reminder button."
              action={<Button onClick={() => setCreateOpen(true)}>New reminder</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Vendor</TH>
                  <TH>Coverage</TH>
                  <TH>Expiry</TH>
                  <TH>Status</TH>
                  <TH>Requested</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {filteredReminders.map((r) => {
                  const requested = !!r.requested_at || (r.status ?? '').toLowerCase() === 'requested'
                  return (
                    <TR key={r.id}>
                      <TD className="font-medium text-stone-200">{r.vendor_id || '—'}</TD>
                      <TD>{r.coverage_type || '—'}</TD>
                      <TD>{fmtDate(r.expiry_date)}</TD>
                      <TD>
                        <Badge tone={toneForStatus(r.status || (requested ? 'requested' : 'pending'))}>{r.status || (requested ? 'requested' : 'pending')}</Badge>
                      </TD>
                      <TD>{fmtDate(r.requested_at)}</TD>
                      <TD className="text-right">
                        <Button
                          variant={requested ? 'ghost' : 'primary'}
                          disabled={requested || requestingId === r.id}
                          className="px-3 py-1 text-xs"
                          onClick={() => onRequestRenewal(r.id)}
                        >
                          {requested ? 'Requested' : requestingId === r.id ? 'Requesting...' : 'Request renewal'}
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New renewal reminder"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="reminder-form" disabled={submitting}>
              {submitting ? 'Saving...' : 'Create reminder'}
            </Button>
          </>
        }
      >
        <form id="reminder-form" onSubmit={submitReminder} className="space-y-4">
          {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Vendor ID *</label>
            <input
              value={form.vendor_id}
              onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
              placeholder="vendor uuid"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Certificate ID</label>
            <input
              value={form.certificate_id}
              onChange={(e) => setForm({ ...form, certificate_id: e.target.value })}
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
              placeholder="optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Coverage type</label>
              <select
                value={form.coverage_type}
                onChange={(e) => setForm({ ...form, coverage_type: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
              >
                {['General Liability', 'Auto Liability', 'Umbrella', 'Workers Comp', 'Professional Liability', 'Pollution'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Expiry date *</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
