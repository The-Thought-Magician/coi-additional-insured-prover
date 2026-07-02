'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Badge, toneForStatus, type BadgeTone } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface ReasonCode {
  id: string
  title: string
  description: string
  default_severity: string
  remediation: string
  created_at?: string
}

function severityTone(sev?: string): BadgeTone {
  const s = (sev ?? '').toLowerCase()
  if (s === 'critical' || s === 'high') return 'danger'
  if (s === 'medium' || s === 'moderate') return 'warning'
  if (s === 'low' || s === 'info') return 'info'
  return toneForStatus(sev)
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, moderate: 2, low: 3, info: 4 }

export default function ReasonCodesPage() {
  const [codes, setCodes] = useState<ReasonCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('all')

  useEffect(() => {
    let active = true
    api.getReasonCodes()
      .then((res: ReasonCode[]) => { if (active) setCodes(Array.isArray(res) ? res : []) })
      .catch((e: Error) => { if (active) setError(e.message || 'Failed to load reason codes') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const severities = useMemo(() => {
    const set = new Set<string>()
    codes.forEach((c) => c.default_severity && set.add(c.default_severity))
    return Array.from(set).sort((a, b) => (SEVERITY_ORDER[a.toLowerCase()] ?? 9) - (SEVERITY_ORDER[b.toLowerCase()] ?? 9))
  }, [codes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return codes
      .filter((c) => severity === 'all' || c.default_severity === severity)
      .filter((c) =>
        !q ||
        c.id.toLowerCase().includes(q) ||
        (c.title ?? '').toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[(a.default_severity ?? '').toLowerCase()] ?? 9
        const sb = SEVERITY_ORDER[(b.default_severity ?? '').toLowerCase()] ?? 9
        return sa - sb || a.id.localeCompare(b.id)
      })
  }, [codes, search, severity])

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
        <Link href="/" className="text-lg font-bold text-cyan-400">CoiAdditionalInsuredProver</Link>
        <div className="flex items-center gap-4">
          <Link href="/pricing" className="hidden text-stone-300 hover:text-white sm:inline">Pricing</Link>
          <Link href="/auth/sign-in" className="text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-stone-950 hover:bg-cyan-400">Get Started</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Reference Catalog</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Deficiency Reason Codes</h1>
          <p className="mt-4 text-stone-400">
            Every certificate is graded against the contract requirement template. When a coverage line, endorsement,
            or limit falls short, the grading engine emits one of these explainable reason codes, linked to the exact
            field that triggered it. This catalog documents what each code means and how to remediate it.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, title, or description…"
              className="w-full rounded-lg border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-white placeholder:text-stone-500 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="rounded-lg border border-stone-800 bg-stone-900 px-4 py-2.5 text-sm text-white focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          >
            <option value="all">All severities</option>
            {severities.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {!loading && !error && (
          <p className="mt-4 text-sm text-stone-500">
            {filtered.length} of {codes.length} {codes.length === 1 ? 'code' : 'codes'}
          </p>
        )}

        <div className="mt-6">
          {loading ? (
            <PageSpinner label="Loading reason codes…" />
          ) : error ? (
            <EmptyState
              title="Could not load reason codes"
              description={error}
              icon={<span>⚠️</span>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={codes.length === 0 ? 'No reason codes published' : 'No matching reason codes'}
              description={codes.length === 0 ? 'The catalog has not been seeded yet.' : 'Try a different search or severity filter.'}
              icon={<span>🔎</span>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((c) => (
                <article key={c.id} className="flex flex-col rounded-xl border border-stone-800 bg-stone-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <code className="rounded-md bg-stone-800 px-2 py-1 font-mono text-sm font-semibold text-cyan-300">{c.id}</code>
                    {c.default_severity && (
                      <Badge tone={severityTone(c.default_severity)}>{c.default_severity}</Badge>
                    )}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-white">{c.title}</h2>
                  <p className="mt-2 flex-1 text-sm text-stone-400">{c.description}</p>
                  {c.remediation && (
                    <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Remediation</div>
                      <p className="mt-1 text-sm text-stone-300">{c.remediation}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
