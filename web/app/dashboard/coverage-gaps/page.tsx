'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface CoverageGap {
  id: string
  assignment_id?: string
  vendor_id?: string
  project_id?: string
  coverage_type?: string
  gap_start?: string
  gap_end?: string
  gap_days?: number
  worked_uninsured?: boolean
  created_at?: string
}

interface Vendor {
  id: string
  legal_name?: string
  dba?: string
}

interface Project {
  id: string
  name?: string
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CoverageGapsPage() {
  const [gaps, setGaps] = useState<CoverageGap[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)

  const [vendorFilter, setVendorFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [coverageFilter, setCoverageFilter] = useState('')
  const [uninsuredOnly, setUninsuredOnly] = useState(false)
  const [search, setSearch] = useState('')

  const vendorName = (id?: string) => {
    const v = vendors.find((x) => x.id === id)
    return v ? v.dba || v.legal_name || id : id || '—'
  }
  const projectName = (id?: string) => projects.find((x) => x.id === id)?.name || id || '—'

  async function loadGaps(params?: Record<string, any>) {
    const q: Record<string, any> = {}
    if (params?.vendor_id) q.vendor_id = params.vendor_id
    if (params?.project_id) q.project_id = params.project_id
    if (params?.worked_uninsured) q.worked_uninsured = true
    const g = await api.getCoverageGaps(Object.keys(q).length ? q : undefined)
    setGaps(Array.isArray(g) ? g : [])
  }

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [g, v, p] = await Promise.all([api.getCoverageGaps(), api.getVendors(), api.getProjects()])
      setGaps(Array.isArray(g) ? g : [])
      setVendors(Array.isArray(v) ? v : [])
      setProjects(Array.isArray(p) ? p : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load coverage gaps')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Server-side refetch when vendor/project/uninsured filters change.
  useEffect(() => {
    if (loading) return
    loadGaps({
      vendor_id: vendorFilter || undefined,
      project_id: projectFilter || undefined,
      worked_uninsured: uninsuredOnly || undefined,
    }).catch((e: any) => setError(e?.message || 'Failed to filter gaps'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorFilter, projectFilter, uninsuredOnly])

  async function onRecompute() {
    setRecomputing(true)
    setRecomputeMsg(null)
    setError(null)
    try {
      const result = await api.recomputeCoverageGaps(
        vendorFilter || projectFilter ? {} : undefined,
      )
      const count = Array.isArray(result) ? result.length : 0
      setRecomputeMsg(`Recomputed — ${count} gap${count === 1 ? '' : 's'} found.`)
      await loadGaps({
        vendor_id: vendorFilter || undefined,
        project_id: projectFilter || undefined,
        worked_uninsured: uninsuredOnly || undefined,
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to recompute gaps')
    } finally {
      setRecomputing(false)
    }
  }

  const coverageTypes = useMemo(() => {
    const set = new Set<string>()
    gaps.forEach((g) => g.coverage_type && set.add(g.coverage_type))
    return Array.from(set).sort()
  }, [gaps])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return gaps.filter((g) => {
      if (coverageFilter && g.coverage_type !== coverageFilter) return false
      if (uninsuredOnly && !g.worked_uninsured) return false
      if (q) {
        const hay = [vendorName(g.vendor_id), projectName(g.project_id), g.coverage_type].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [gaps, coverageFilter, uninsuredOnly, search, vendors, projects])

  const stats = useMemo(() => {
    const totalDays = filtered.reduce((s, g) => s + (g.gap_days || 0), 0)
    const uninsured = filtered.filter((g) => g.worked_uninsured)
    const longest = filtered.reduce((m, g) => Math.max(m, g.gap_days || 0), 0)
    return { count: filtered.length, totalDays, uninsuredCount: uninsured.length, longest }
  }, [filtered])

  // Timeline range across visible gaps for the SVG explorer.
  const timeline = useMemo(() => {
    const dated = filtered.filter((g) => g.gap_start && g.gap_end)
    if (dated.length === 0) return null
    let min = Infinity
    let max = -Infinity
    dated.forEach((g) => {
      const s = new Date(g.gap_start!).getTime()
      const e = new Date(g.gap_end!).getTime()
      if (!isNaN(s)) min = Math.min(min, s)
      if (!isNaN(e)) max = Math.max(max, e)
    })
    if (!isFinite(min) || !isFinite(max) || max <= min) return null
    const span = max - min
    const rows = dated
      .slice()
      .sort((a, b) => new Date(a.gap_start!).getTime() - new Date(b.gap_start!).getTime())
      .map((g) => {
        const s = new Date(g.gap_start!).getTime()
        const e = new Date(g.gap_end!).getTime()
        return {
          gap: g,
          left: ((s - min) / span) * 100,
          width: Math.max(1.2, ((e - s) / span) * 100),
        }
      })
    return { min, max, rows }
  }, [filtered])

  function clearFilters() {
    setVendorFilter('')
    setProjectFilter('')
    setCoverageFilter('')
    setUninsuredOnly(false)
    setSearch('')
  }

  if (loading) return <PageSpinner label="Loading coverage gaps..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Coverage Gaps</h1>
          <p className="text-sm text-stone-400">Coverage-lapse timeline explorer and worked-uninsured exposure.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadAll}>Refresh</Button>
          <Button onClick={onRecompute} disabled={recomputing}>
            {recomputing ? 'Recomputing...' : 'Recompute gaps'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {recomputeMsg && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{recomputeMsg}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Gaps shown" value={stats.count} hint="After filters" />
        <Stat label="Worked uninsured" value={stats.uninsuredCount} tone={stats.uninsuredCount > 0 ? 'danger' : 'success'} hint="Onsite without coverage" />
        <Stat label="Total gap days" value={stats.totalDays} tone={stats.totalDays > 0 ? 'warning' : 'default'} hint="Cumulative lapse" />
        <Stat label="Longest gap" value={`${stats.longest}d`} tone={stats.longest > 30 ? 'danger' : 'default'} hint="Single lapse window" />
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.dba || v.legal_name || v.id}</option>
              ))}
            </select>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
            <select
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500/60 focus:outline-none"
            >
              <option value="">All coverage types</option>
              {coverageTypes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500/60 focus:outline-none"
            />
            <label className="flex items-center gap-2 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-300">
              <input type="checkbox" checked={uninsuredOnly} onChange={(e) => setUninsuredOnly(e.target.checked)} className="accent-cyan-500" />
              Worked uninsured only
            </label>
          </div>
          {(vendorFilter || projectFilter || coverageFilter || uninsuredOnly || search) && (
            <div className="mt-3">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={clearFilters}>Clear filters</Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">Lapse timeline</h2>
        </CardHeader>
        <CardBody>
          {!timeline ? (
            <p className="text-sm text-stone-500">No dated gaps to plot. Recompute gaps or adjust filters.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-stone-500">
                <span>{fmtDate(new Date(timeline.min).toISOString())}</span>
                <span>{fmtDate(new Date(timeline.max).toISOString())}</span>
              </div>
              <div className="space-y-1.5">
                {timeline.rows.map(({ gap, left, width }) => (
                  <div key={gap.id} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-xs text-stone-400" title={vendorName(gap.vendor_id)}>
                      {vendorName(gap.vendor_id)}
                    </div>
                    <div className="relative h-5 flex-1 rounded bg-stone-800">
                      <div
                        className={`absolute top-0 h-full rounded ${gap.worked_uninsured ? 'bg-red-500' : 'bg-cyan-500'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${gap.coverage_type || ''} • ${gap.gap_days || 0}d • ${fmtDate(gap.gap_start)} → ${fmtDate(gap.gap_end)}`}
                      />
                    </div>
                    <div className="w-12 shrink-0 text-right text-xs font-semibold text-stone-300">{gap.gap_days ?? 0}d</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 pt-2 text-xs text-stone-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Worked uninsured</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500" /> Coverage lapse</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-stone-200">
            Gap detail <span className="text-stone-500">({filtered.length})</span>
          </h2>
        </CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              title="No coverage gaps"
              description="No lapses match the current filters. Run Recompute to derive gaps from assignments and coverage lines."
              action={<Button onClick={onRecompute} disabled={recomputing}>{recomputing ? 'Recomputing...' : 'Recompute gaps'}</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Vendor</TH>
                  <TH>Project</TH>
                  <TH>Coverage</TH>
                  <TH>Gap start</TH>
                  <TH>Gap end</TH>
                  <TH>Days</TH>
                  <TH>Exposure</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((g) => (
                  <TR key={g.id} className={g.worked_uninsured ? 'bg-red-500/5' : ''}>
                    <TD className="font-medium text-stone-200">{vendorName(g.vendor_id)}</TD>
                    <TD>{projectName(g.project_id)}</TD>
                    <TD>{g.coverage_type || '—'}</TD>
                    <TD>{fmtDate(g.gap_start)}</TD>
                    <TD>{fmtDate(g.gap_end)}</TD>
                    <TD>
                      <Badge tone={(g.gap_days || 0) > 30 ? 'danger' : (g.gap_days || 0) > 0 ? 'warning' : 'neutral'}>{g.gap_days ?? 0}d</Badge>
                    </TD>
                    <TD>
                      {g.worked_uninsured ? <Badge tone="danger">Worked uninsured</Badge> : <Badge tone="neutral">Lapse only</Badge>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
