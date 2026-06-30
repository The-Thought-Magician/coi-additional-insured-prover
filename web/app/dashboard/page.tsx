'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Stat } from '@/components/ui/Stat'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Overview {
  kpis?: {
    total_vendors?: number
    compliant_vendors?: number
    deficient_vendors?: number
    compliant_pct?: number
    open_deficiencies?: number
    total_certificates?: number
    [k: string]: number | undefined
  }
  deficiency_by_reason?: { reason_code: string; count: number }[]
  expiring_count?: number
  uninsured_vendors?: { vendor_id: string; legal_name?: string; project_name?: string; coverage_type?: string; gap_days?: number }[]
}
interface Radar {
  expired?: any[]
  in30?: any[]
  in60?: any[]
  in90?: any[]
}
interface Workspace { id: string; name?: string }
interface SeedStatus { seeded?: boolean; counts?: Record<string, number> }

function num(v: number | undefined): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [radar, setRadar] = useState<Radar | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [seed, setSeed] = useState<SeedStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    Promise.all([
      api.getReportsOverview().catch(() => null),
      api.getCurrentWorkspace().catch(() => null),
      api.getRenewalRadar().catch(() => null),
      api.getSeedStatus().catch(() => null),
    ])
      .then(([ov, ws, rd, sd]) => {
        setOverview(ov as Overview)
        setWorkspace(ws as Workspace)
        setRadar(rd as Radar)
        setSeed(sd as SeedStatus)
        if (!ov && !ws && !rd) setError('Could not load dashboard data. Check your connection and try again.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const runSeed = async () => {
    setSeeding(true)
    try {
      await api.seedSample()
      load()
    } catch (e) {
      setError((e as Error).message || 'Seeding failed')
    } finally {
      setSeeding(false)
    }
  }

  if (loading) return <PageSpinner label="Loading dashboard…" />

  const kpis = overview?.kpis ?? {}
  const totalVendors = num(kpis.total_vendors)
  const compliant = num(kpis.compliant_vendors)
  const deficient = num(kpis.deficient_vendors)
  const compliantPct = kpis.compliant_pct != null
    ? Math.round(num(kpis.compliant_pct))
    : totalVendors > 0 ? Math.round((compliant / totalVendors) * 100) : 0
  const openDef = num(kpis.open_deficiencies)
  const totalCerts = num(kpis.total_certificates)
  const expiring = num(overview?.expiring_count)

  const expired = radar?.expired ?? []
  const in30 = radar?.in30 ?? []
  const in60 = radar?.in60 ?? []
  const in90 = radar?.in90 ?? []
  const radarBuckets = [
    { label: 'Expired', value: expired.length, tone: 'bg-red-500' },
    { label: '0–30 days', value: in30.length, tone: 'bg-amber-500' },
    { label: '31–60 days', value: in60.length, tone: 'bg-yellow-500' },
    { label: '61–90 days', value: in90.length, tone: 'bg-sky-500' },
  ]
  const radarMax = Math.max(1, ...radarBuckets.map((b) => b.value))

  const uninsured = overview?.uninsured_vendors ?? []
  const byReason = (overview?.deficiency_by_reason ?? []).slice().sort((a, b) => b.count - a.count)
  const reasonMax = Math.max(1, ...byReason.map((r) => r.count))

  const isEmpty = totalVendors === 0 && totalCerts === 0 && !seed?.seeded

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            {workspace?.name ? `Workspace: ${workspace.name}` : 'Your COI compliance portfolio at a glance'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/certificates/new"><Button variant="secondary">Intake Certificate</Button></Link>
          <Link href="/dashboard/reports"><Button>View Reports</Button></Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {isEmpty ? (
        <EmptyState
          title="No portfolio data yet"
          description="Seed a realistic GC subcontractor portfolio (projects, vendors, templates, and certificates with mixed compliance) to explore the platform, or start by adding your own vendors."
          icon={<span>📋</span>}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={runSeed} disabled={seeding}>{seeding ? 'Seeding…' : 'Seed sample portfolio'}</Button>
              <Link href="/dashboard/vendors"><Button variant="secondary">Add a vendor</Button></Link>
            </div>
          }
        />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Compliant Vendors" value={`${compliantPct}%`} hint={`${compliant} of ${totalVendors}`} tone={compliantPct >= 80 ? 'success' : compliantPct >= 50 ? 'warning' : 'danger'} />
            <Stat label="Total Vendors" value={totalVendors} hint={`${deficient} deficient`} />
            <Stat label="Certificates" value={totalCerts} />
            <Stat label="Open Deficiencies" value={openDef} tone={openDef > 0 ? 'danger' : 'success'} hint={openDef > 0 ? 'needs remediation' : 'all clear'} />
            <Stat label="Expiring This Month" value={expiring} tone={expiring > 0 ? 'warning' : 'default'} />
          </div>

          {/* Working-uninsured callout */}
          {uninsured.length > 0 && (
            <Card className="border-red-500/40 bg-red-500/5">
              <CardHeader className="flex items-center justify-between border-red-500/20">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚨</span>
                  <h2 className="text-base font-semibold text-red-200">Vendors Working Uninsured</h2>
                </div>
                <Badge tone="danger">{uninsured.length} active</Badge>
              </CardHeader>
              <CardBody>
                <p className="mb-4 text-sm text-slate-400">
                  These vendors are or were on site during a coverage lapse. This is your highest-priority exposure.
                </p>
                <ul className="divide-y divide-red-500/10">
                  {uninsured.slice(0, 8).map((u, i) => (
                    <li key={`${u.vendor_id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div>
                        <Link href={`/dashboard/vendors/${u.vendor_id}`} className="font-medium text-white hover:text-amber-300">
                          {u.legal_name || u.vendor_id}
                        </Link>
                        <span className="ml-2 text-sm text-slate-500">
                          {u.coverage_type ? u.coverage_type.toUpperCase() : 'coverage'}{u.project_name ? ` · ${u.project_name}` : ''}
                        </span>
                      </div>
                      {u.gap_days != null && <Badge tone="danger">{u.gap_days} uninsured days</Badge>}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Link href="/dashboard/coverage-gaps"><Button variant="danger">Review coverage gaps</Button></Link>
                </div>
              </CardBody>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Expiry radar */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Expiry / Renewal Radar</h2>
                <Link href="/dashboard/renewals" className="text-sm text-amber-400 hover:text-amber-300">Open radar →</Link>
              </CardHeader>
              <CardBody>
                {radarBuckets.every((b) => b.value === 0) ? (
                  <p className="py-6 text-center text-sm text-slate-500">No upcoming or lapsed expirations. You are current.</p>
                ) : (
                  <div className="space-y-4">
                    {radarBuckets.map((b) => (
                      <div key={b.label}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-slate-300">{b.label}</span>
                          <span className="font-semibold text-white">{b.value}</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div className={`h-full rounded-full ${b.tone}`} style={{ width: `${(b.value / radarMax) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Deficiencies by reason */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Open Deficiencies by Reason</h2>
                <Link href="/dashboard/deficiencies" className="text-sm text-amber-400 hover:text-amber-300">Workbench →</Link>
              </CardHeader>
              <CardBody>
                {byReason.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No open deficiencies. Every certificate is passing.</p>
                ) : (
                  <ul className="space-y-3">
                    {byReason.slice(0, 8).map((r) => (
                      <li key={r.reason_code}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <code className="font-mono text-xs text-amber-300">{r.reason_code}</code>
                          <span className="font-semibold text-white">{r.count}</span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-amber-500" style={{ width: `${(r.count / reasonMax) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Compliance breakdown bar */}
          {totalVendors > 0 && (
            <Card>
              <CardHeader><h2 className="text-base font-semibold text-white">Vendor Compliance Mix</h2></CardHeader>
              <CardBody>
                <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-emerald-500" style={{ width: `${(compliant / totalVendors) * 100}%` }} title={`Compliant: ${compliant}`} />
                  <div className="h-full bg-red-500" style={{ width: `${(deficient / totalVendors) * 100}%` }} title={`Deficient: ${deficient}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Compliant {compliant}</span>
                  <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Deficient {deficient}</span>
                  {totalVendors - compliant - deficient > 0 && (
                    <span className="flex items-center gap-2 text-slate-300"><span className="h-2.5 w-2.5 rounded-full bg-slate-600" />Other {totalVendors - compliant - deficient}</span>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
