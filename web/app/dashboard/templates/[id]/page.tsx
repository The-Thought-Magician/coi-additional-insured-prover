'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Template {
  id: string
  name: string
  description?: string | null
  version?: number
  applies_to_risk_tier?: string | null
  require_ai_ongoing?: boolean
  require_ai_completed?: boolean
  accept_blanket_ai?: boolean
  require_pnc?: boolean
  require_waiver_subrogation?: boolean
  min_carrier_am_best?: string | null
  is_active?: boolean
}

interface LineReq {
  id?: string
  coverage_type: string
  required: boolean
  min_each_occurrence: number | null
  min_aggregate: number | null
  notes: string | null
}

const COVERAGE_TYPES = [
  'general_liability',
  'auto_liability',
  'umbrella_excess',
  'workers_comp',
  'employers_liability',
  'professional_liability',
  'pollution',
]

const RISK_TIERS = ['', 'low', 'medium', 'high']

function labelFor(ct: string) {
  return ct
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function emptyLine(coverage_type = 'general_liability'): LineReq {
  return { coverage_type, required: true, min_each_occurrence: null, min_aggregate: null, notes: null }
}

function parseMoney(v: string): number | null {
  const cleaned = v.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return isNaN(n) ? null : n
}

function fmtMoney(n: number | null) {
  if (n == null) return ''
  return n.toLocaleString()
}

export default function TemplateEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [lines, setLines] = useState<LineReq[]>([])

  const [savingHeader, setSavingHeader] = useState(false)
  const [savingLines, setSavingLines] = useState(false)
  const [headerNote, setHeaderNote] = useState<string | null>(null)
  const [linesNote, setLinesNote] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res: any = await api.getTemplate(id)
      // Endpoint returns { template, lines }
      const t: Template = res?.template ?? res
      const l: any[] = res?.lines ?? res?.template?.lines ?? []
      setTemplate(t)
      setLines(
        (Array.isArray(l) ? l : []).map((x) => ({
          id: x.id,
          coverage_type: x.coverage_type,
          required: x.required ?? true,
          min_each_occurrence: x.min_each_occurrence ?? null,
          min_aggregate: x.min_aggregate ?? null,
          notes: x.notes ?? null,
        }))
      )
    } catch (e: any) {
      setError(e?.message || 'Failed to load template')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function patchTemplate<K extends keyof Template>(key: K, value: Template[K]) {
    setTemplate((t) => (t ? { ...t, [key]: value } : t))
    setHeaderNote(null)
  }

  async function saveHeader() {
    if (!template) return
    setSavingHeader(true)
    setHeaderNote(null)
    setError(null)
    try {
      const updated: any = await api.updateTemplate(id, {
        name: template.name,
        description: template.description ?? null,
        applies_to_risk_tier: template.applies_to_risk_tier || null,
        require_ai_ongoing: !!template.require_ai_ongoing,
        require_ai_completed: !!template.require_ai_completed,
        accept_blanket_ai: !!template.accept_blanket_ai,
        require_pnc: !!template.require_pnc,
        require_waiver_subrogation: !!template.require_waiver_subrogation,
        min_carrier_am_best: template.min_carrier_am_best || null,
        is_active: !!template.is_active,
      })
      const t: Template = updated?.template ?? updated
      if (t && t.id) setTemplate((prev) => ({ ...(prev as Template), ...t }))
      setHeaderNote('Saved. Version bumped.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save template')
    } finally {
      setSavingHeader(false)
    }
  }

  function updateLine(idx: number, patch: Partial<LineReq>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    setLinesNote(null)
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.coverage_type))
    const next = COVERAGE_TYPES.find((c) => !used.has(c)) ?? 'general_liability'
    setLines((prev) => [...prev, emptyLine(next)])
    setLinesNote(null)
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
    setLinesNote(null)
  }

  async function saveLines() {
    setSavingLines(true)
    setLinesNote(null)
    setError(null)
    // Guard duplicate coverage types (UNIQUE(template_id,coverage_type))
    const seen = new Set<string>()
    for (const l of lines) {
      if (seen.has(l.coverage_type)) {
        setError(`Duplicate coverage type: ${labelFor(l.coverage_type)}. Each coverage type can appear once.`)
        setSavingLines(false)
        return
      }
      seen.add(l.coverage_type)
    }
    try {
      const payload = lines.map((l) => ({
        coverage_type: l.coverage_type,
        required: l.required,
        min_each_occurrence: l.min_each_occurrence,
        min_aggregate: l.min_aggregate,
        notes: l.notes,
      }))
      const res: any = await api.setTemplateLines(id, payload)
      if (Array.isArray(res)) {
        setLines(
          res.map((x: any) => ({
            id: x.id,
            coverage_type: x.coverage_type,
            required: x.required ?? true,
            min_each_occurrence: x.min_each_occurrence ?? null,
            min_aggregate: x.min_aggregate ?? null,
            notes: x.notes ?? null,
          }))
        )
      }
      setLinesNote('Line minimums saved.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save line requirements')
    } finally {
      setSavingLines(false)
    }
  }

  if (loading) return <PageSpinner label="Loading template..." />

  if (error && !template) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/templates" className="text-sm text-amber-400 hover:text-amber-300">
          ← Back to templates
        </Link>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      </div>
    )
  }

  if (!template) return null

  const flags: { key: keyof Template; label: string; hint: string }[] = [
    { key: 'require_ai_ongoing', label: 'Additional Insured — Ongoing Operations', hint: 'CG 20 10 or equivalent' },
    { key: 'require_ai_completed', label: 'Additional Insured — Completed Operations', hint: 'CG 20 37 or equivalent' },
    { key: 'accept_blanket_ai', label: 'Accept Blanket Additional Insured', hint: 'Blanket endorsement satisfies AI' },
    { key: 'require_pnc', label: 'Primary & Non-Contributory', hint: 'AI coverage is primary' },
    { key: 'require_waiver_subrogation', label: 'Waiver of Subrogation', hint: 'Carrier waives subrogation rights' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/dashboard/templates" className="text-sm text-amber-400 hover:text-amber-300">
            ← Back to templates
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-white">
            {template.name || 'Untitled Template'}
            <Badge tone="neutral">v{template.version ?? 1}</Badge>
            <Badge tone={template.is_active ? 'success' : 'neutral'}>
              {template.is_active ? 'active' : 'inactive'}
            </Badge>
          </h1>
        </div>
        <Button onClick={() => router.push('/dashboard/templates')} variant="secondary">
          Done
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Template Details & Endorsement Flags</h2>
            <p className="text-xs text-slate-500">Saving bumps the template version.</p>
          </div>
          {headerNote && <span className="text-xs text-emerald-400">{headerNote}</span>}
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
              <input
                value={template.name}
                onChange={(e) => patchTemplate('name', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Risk Tier
              </label>
              <select
                value={template.applies_to_risk_tier || ''}
                onChange={(e) => patchTemplate('applies_to_risk_tier', e.target.value || null)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                {RISK_TIERS.map((t) => (
                  <option key={t || 'any'} value={t}>
                    {t || 'any'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Description
            </label>
            <textarea
              value={template.description ?? ''}
              onChange={(e) => patchTemplate('description', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Minimum Carrier A.M. Best Rating
              </label>
              <input
                value={template.min_carrier_am_best ?? ''}
                onChange={(e) => patchTemplate('min_carrier_am_best', e.target.value || null)}
                placeholder="A-"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={!!template.is_active}
                  onChange={(e) => patchTemplate('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-amber-500"
                />
                Active (available for assignment)
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Additional Insured / P&NC / Waiver Flags
            </h3>
            <div className="space-y-2">
              {flags.map((f) => (
                <label
                  key={String(f.key)}
                  className="flex items-start gap-3 rounded-lg border border-transparent px-2 py-1.5 hover:border-slate-800 hover:bg-slate-900/60"
                >
                  <input
                    type="checkbox"
                    checked={!!template[f.key]}
                    onChange={(e) => patchTemplate(f.key, e.target.checked as any)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 accent-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-200">{f.label}</span>
                    <span className="block text-xs text-slate-500">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button onClick={saveHeader} disabled={savingHeader}>
              {savingHeader ? <Spinner label="Saving..." /> : 'Save Details'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Per-Line Minimum Limits</h2>
            <p className="text-xs text-slate-500">
              Required coverage types and their minimum each-occurrence / aggregate limits.
            </p>
          </div>
          {linesNote && <span className="text-xs text-emerald-400">{linesNote}</span>}
        </CardHeader>
        <CardBody className="space-y-4">
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-500">
              No line requirements yet. Add a coverage type to set its minimum limits.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Coverage Type</TH>
                  <TH>Required</TH>
                  <TH>Min Each Occurrence</TH>
                  <TH>Min Aggregate</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">—</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l, idx) => (
                  <TR key={l.id ?? `new-${idx}`}>
                    <TD>
                      <select
                        value={l.coverage_type}
                        onChange={(e) => updateLine(idx, { coverage_type: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                      >
                        {COVERAGE_TYPES.map((c) => (
                          <option key={c} value={c}>
                            {labelFor(c)}
                          </option>
                        ))}
                      </select>
                    </TD>
                    <TD>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={l.required}
                          onChange={(e) => updateLine(idx, { required: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-amber-500"
                        />
                        <span className="text-xs text-slate-400">{l.required ? 'required' : 'optional'}</span>
                      </label>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">$</span>
                        <input
                          value={fmtMoney(l.min_each_occurrence)}
                          onChange={(e) => updateLine(idx, { min_each_occurrence: parseMoney(e.target.value) })}
                          placeholder="1,000,000"
                          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">$</span>
                        <input
                          value={fmtMoney(l.min_aggregate)}
                          onChange={(e) => updateLine(idx, { min_aggregate: parseMoney(e.target.value) })}
                          placeholder="2,000,000"
                          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </TD>
                    <TD>
                      <input
                        value={l.notes ?? ''}
                        onChange={(e) => updateLine(idx, { notes: e.target.value || null })}
                        placeholder="optional"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
                      />
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                        onClick={() => removeLine(idx)}
                      >
                        Remove
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          <div className="flex items-center justify-between">
            <Button variant="secondary" onClick={addLine}>
              + Add Coverage Line
            </Button>
            <Button onClick={saveLines} disabled={savingLines}>
              {savingLines ? <Spinner label="Saving..." /> : 'Save Line Minimums'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
