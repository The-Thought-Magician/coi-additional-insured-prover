'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ReasonBucket {
  reason_code: string
  count: number
  title?: string | null
}

interface Overview {
  kpis?: Record<string, any>
  deficiency_by_reason?: ReasonBucket[]
  expiring_count?: number
  uninsured_vendors?: number
  [k: string]: any
}

interface ProjectRollup {
  id?: string
  project_id?: string
  name?: string
  project_name?: string
  total_vendors?: number
  compliant?: number
  deficient?: number
  expiring?: number
  [k: string]: any
}

interface ReasonRow {
  reason_code: string
  count: number
  title?: string | null
}

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function pct(part: number, whole: number): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

function prettyKey(k: string): string {
  return k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const REASON_PALETTE = ['#f59e0b', '#fbbf24', '#f97316', '#ef4444', '#fb923c', '#eab308', '#d97706', '#dc2626']

export default function ReportsPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [byProject, setByProject] = useState<ProjectRollup[]>([])
  const [byReason, setByReason] = useState<ReasonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [ov, proj, reason] = await Promise.all([
        api.getReportsOverview(),
        api.getReportsByProject(),
        api.getReportsByReason(),
      ])
      setOverview(ov && typeof ov === 'object' ? ov : {})
      setByProject(Array.isArray(proj) ? proj : [])
      setByReason(Array.isArray(reason) ? reason : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Derive KPI figures from overview + rollups, tolerant of shape.
  const kpis = useMemo(() => {
    const k = overview?.kpis ?? {}
    // workspace totals from per-project rollups as fallback
    const totalVendors = byProject.reduce((s, p) => s + num(p.total_vendors), 0)
    const compliant = byProject.reduce((s, p) => s + num(p.compliant), 0)
    const deficient = byProject.reduce((s, p) => s + num(p.deficient), 0)
    const expiring = byProject.reduce((s, p) => s + num(p.expiring), 0)

    const compliantVendors = num(k.compliant_vendors ?? k.compliant ?? compliant)
    const totalV = num(k.total_vendors ?? k.vendors ?? totalVendors) || totalVendors
    const openDef =
      num(k.open_deficiencies ?? k.deficiencies) ||
      byReason.reduce((s, r) => s + num(r.count), 0)
    const expiringCount = num(overview?.expiring_count ?? k.expiring ?? expiring)
    const uninsuredRaw = overview?.uninsured_vendor_count ?? overview?.uninsured_vendors
    const uninsured = num(
      Array.isArray(uninsuredRaw) ? uninsuredRaw.length : uninsuredRaw ?? k.uninsured_vendors ?? k.working_uninsured,
    )

    return {
      compliancePct: pct(compliantVendors, totalV),
      compliantVendors,
      totalVendors: totalV,
      deficient: deficient || Math.max(0, totalV - compliantVendors),
      openDeficiencies: openDef,
      expiringCount,
      uninsured,
    }
  }, [overview, byProject, byReason])

  // Extra raw KPI entries the backend may include that we haven't surfaced.
  const extraKpis = useMemo(() => {
    const k = overview?.kpis ?? {}
    const known = new Set([
      'compliant_vendors', 'compliant', 'total_vendors', 'vendors',
      'open_deficiencies', 'deficiencies', 'expiring', 'uninsured_vendors', 'working_uninsured',
    ])
    return Object.entries(k).filter(([key, v]) => !known.has(key) && (typeof v === 'number' || typeof v === 'string'))
  }, [overview])

  const reasonRows = useMemo(() => {
    // Prefer dedicated by-reason endpoint; fall back to overview.deficiency_by_reason.
    const src = byReason.length ? byReason : (overview?.deficiency_by_reason ?? [])
    return src
      .map((r) => ({ reason_code: r.reason_code, count: num(r.count), title: (r as any).title }))
      .filter((r) => r.reason_code)
      .sort((a, b) => b.count - a.count)
  }, [byReason, overview])

  const reasonMax = useMemo(() => Math.max(1, ...reasonRows.map((r) => r.count)), [reasonRows])
  const reasonTotal = useMemo(() => reasonRows.reduce((s, r) => s + r.count, 0), [reasonRows])

  const projectRows = useMemo(() => {
    return byProject
      .map((p) => ({
        id: p.id || p.project_id || '',
        name: p.name || p.project_name || 'Untitled project',
        total: num(p.total_vendors),
        compliant: num(p.compliant),
        deficient: num(p.deficient),
        expiring: num(p.expiring),
      }))
      .sort((a, b) => pct(a.compliant, a.total) - pct(b.compliant, b.total))
  }, [byProject])

  function exportCsv() {
    const lines: string[] = []
    lines.push('Project,Total Vendors,Compliant,Deficient,Expiring,Compliance %')
    for (const p of projectRows) {
      lines.push(`"${p.name.replace(/"/g, '""')}",${p.total},${p.compliant},${p.deficient},${p.expiring},${pct(p.compliant, p.total)}`)
    }
    lines.push('')
    lines.push('Reason Code,Title,Open Deficiencies')
    for (const r of reasonRows) {
      lines.push(`"${r.reason_code}","${(r.title || '').replace(/"/g, '""')}",${r.count}`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <PageSpinner label="Building compliance reports..." />

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Compliance Reports</h1>
        <EmptyState
          title="Could not load reports"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      </div>
    )
  }

  const nothing = kpis.totalVendors === 0 && reasonRows.length === 0 && projectRows.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Reports</h1>
          <p className="mt-1 text-sm text-stone-400">
            Portfolio-wide insurance compliance: vendor compliance rate, per-project rollups, and deficiency drivers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={nothing}>Export CSV</Button>
          <Button variant="secondary" onClick={load}>Refresh</Button>
        </div>
      </div>

      {nothing ? (
        <EmptyState
          title="No data to report yet"
          description="Once you add vendors, projects, and certificates, this page will summarize compliance health across your portfolio."
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Vendor Compliance"
              value={`${kpis.compliancePct}%`}
              tone={kpis.compliancePct >= 80 ? 'success' : kpis.compliancePct >= 50 ? 'warning' : 'danger'}
              hint={`${kpis.compliantVendors} of ${kpis.totalVendors} vendors`}
            />
            <Stat
              label="Open Deficiencies"
              value={kpis.openDeficiencies}
              tone={kpis.openDeficiencies ? 'danger' : 'success'}
              hint="Across all certificates"
            />
            <Stat
              label="Expiring Soon"
              value={kpis.expiringCount}
              tone={kpis.expiringCount ? 'warning' : 'default'}
              hint="Coverage lines this month"
            />
            <Stat
              label="Working Uninsured"
              value={kpis.uninsured}
              tone={kpis.uninsured ? 'danger' : 'success'}
              hint="Vendors on-site without coverage"
            />
          </div>

          {/* Compliance gauge */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-white">Portfolio Compliance</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-stone-400">Compliant vs total vendors</span>
                <span className="font-semibold text-stone-200">{kpis.compliancePct}%</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-stone-800" role="img" aria-label={`${kpis.compliancePct}% compliant`}>
                <div className="bg-emerald-500" style={{ width: `${pct(kpis.compliantVendors, kpis.totalVendors)}%` }} title={`Compliant: ${kpis.compliantVendors}`} />
                <div className="bg-red-500" style={{ width: `${pct(kpis.deficient, kpis.totalVendors)}%` }} title={`Deficient: ${kpis.deficient}`} />
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-stone-400">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Compliant ({kpis.compliantVendors})</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Deficient ({kpis.deficient})</span>
              </div>
            </CardBody>
          </Card>

          {extraKpis.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-white">Additional Metrics</h2>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {extraKpis.map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-stone-800 bg-stone-950 px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-stone-500">{prettyKey(k)}</div>
                      <div className="mt-1 text-xl font-semibold text-stone-100">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Deficiency by reason — horizontal bar chart (SVG-free, divs) */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Open Deficiencies by Reason</h2>
              <span className="text-xs text-stone-500">{reasonTotal} total</span>
            </CardHeader>
            <CardBody>
              {reasonRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone-500">No open deficiencies. Your portfolio is clean.</p>
              ) : (
                <div className="space-y-3">
                  {reasonRows.map((r, i) => {
                    const color = REASON_PALETTE[i % REASON_PALETTE.length]
                    return (
                      <div key={r.reason_code}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-stone-300">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                            <span className="font-mono text-xs text-stone-400">{r.reason_code}</span>
                            {r.title && <span className="text-stone-500">— {r.title}</span>}
                          </span>
                          <span className="font-semibold text-stone-200">{r.count}</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(4, (r.count / reasonMax) * 100)}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Per-project rollup */}
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-white">Per-Project Compliance Rollup</h2>
            </CardHeader>
            <CardBody className="p-0">
              {projectRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-stone-500">No projects to roll up yet.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Project</TH>
                      <TH className="text-right">Vendors</TH>
                      <TH className="text-right">Compliant</TH>
                      <TH className="text-right">Deficient</TH>
                      <TH className="text-right">Expiring</TH>
                      <TH>Compliance</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {projectRows.map((p) => {
                      const cp = pct(p.compliant, p.total)
                      return (
                        <TR key={p.id || p.name}>
                          <TD className="font-medium text-stone-100">{p.name}</TD>
                          <TD className="text-right text-stone-300">{p.total}</TD>
                          <TD className="text-right text-emerald-400">{p.compliant}</TD>
                          <TD className="text-right text-red-400">{p.deficient || '—'}</TD>
                          <TD className="text-right text-cyan-400">{p.expiring || '—'}</TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-800">
                                <div
                                  className={cp >= 80 ? 'h-full bg-emerald-500' : cp >= 50 ? 'h-full bg-cyan-500' : 'h-full bg-red-500'}
                                  style={{ width: `${cp}%` }}
                                />
                              </div>
                              <Badge tone={cp >= 80 ? 'success' : cp >= 50 ? 'warning' : 'danger'}>{cp}%</Badge>
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
        </>
      )}
    </div>
  )
}
