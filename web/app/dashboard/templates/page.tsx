'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
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
  created_at?: string
}

const RISK_TIERS = ['', 'low', 'medium', 'high']

function fmtDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    applies_to_risk_tier: '',
    require_ai_ongoing: true,
    require_ai_completed: false,
    accept_blanket_ai: true,
    require_pnc: true,
    require_waiver_subrogation: true,
    min_carrier_am_best: 'A-',
  })

  const [deleting, setDeleting] = useState<Template | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getTemplates()
      setTemplates(Array.isArray(res) ? res : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (activeOnly && !t.is_active) return false
      if (tierFilter && (t.applies_to_risk_tier || '') !== tierFilter) return false
      if (q) {
        const hay = `${t.name} ${t.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [templates, search, tierFilter, activeOnly])

  const stats = useMemo(() => {
    const total = templates.length
    const active = templates.filter((t) => t.is_active).length
    const pnc = templates.filter((t) => t.require_pnc).length
    const waiver = templates.filter((t) => t.require_waiver_subrogation).length
    return { total, active, pnc, waiver }
  }, [templates])

  function resetForm() {
    setForm({
      name: '',
      description: '',
      applies_to_risk_tier: '',
      require_ai_ongoing: true,
      require_ai_completed: false,
      accept_blanket_ai: true,
      require_pnc: true,
      require_waiver_subrogation: true,
      min_carrier_am_best: 'A-',
    })
    setFormError(null)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('Template name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const created: Template = await api.createTemplate({
        name: form.name.trim(),
        description: form.description.trim() || null,
        applies_to_risk_tier: form.applies_to_risk_tier || null,
        require_ai_ongoing: form.require_ai_ongoing,
        require_ai_completed: form.require_ai_completed,
        accept_blanket_ai: form.accept_blanket_ai,
        require_pnc: form.require_pnc,
        require_waiver_subrogation: form.require_waiver_subrogation,
        min_carrier_am_best: form.min_carrier_am_best.trim() || null,
        is_active: true,
      })
      setCreateOpen(false)
      resetForm()
      if (created && created.id) {
        setTemplates((prev) => [created, ...prev])
      } else {
        await load()
      }
    } catch (e: any) {
      setFormError(e?.message || 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await api.deleteTemplate(deleting.id)
      setTemplates((prev) => prev.filter((t) => t.id !== deleting.id))
      setDeleting(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to delete template')
    } finally {
      setDeleteBusy(false)
    }
  }

  function reqChips(t: Template) {
    const chips: { label: string; on: boolean }[] = [
      { label: 'AI Ongoing', on: !!t.require_ai_ongoing },
      { label: 'AI Completed', on: !!t.require_ai_completed },
      { label: 'Blanket OK', on: !!t.accept_blanket_ai },
      { label: 'P&NC', on: !!t.require_pnc },
      { label: 'Waiver', on: !!t.require_waiver_subrogation },
    ]
    return (
      <div className="flex flex-wrap gap-1">
        {chips
          .filter((c) => c.on)
          .map((c) => (
            <Badge key={c.label} tone="info">
              {c.label}
            </Badge>
          ))}
        {chips.every((c) => !c.on) && <span className="text-stone-600">none</span>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Requirement Templates</h1>
          <p className="mt-1 text-sm text-stone-400">
            Versioned insurance requirement sets applied to projects and certificates for grading.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm()
            setCreateOpen(true)
          }}
        >
          + New Template
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Templates" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="success" />
        <Stat label="Require P&NC" value={stats.pnc} tone="warning" />
        <Stat label="Require Waiver" value={stats.waiver} tone="warning" />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none sm:max-w-xs"
          />
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
          >
            {RISK_TIERS.map((t) => (
              <option key={t || 'all'} value={t}>
                {t ? `Risk: ${t}` : 'All risk tiers'}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-stone-600 bg-stone-950 accent-cyan-500"
            />
            Active only
          </label>
          <span className="text-xs text-stone-500 sm:ml-auto">
            {filtered.length} of {templates.length}
          </span>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading templates..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title={templates.length === 0 ? 'No requirement templates yet' : 'No templates match your filters'}
          description={
            templates.length === 0
              ? 'Create a template to define the additional-insured, P&NC, waiver, and per-line minimum requirements for a class of contracts.'
              : 'Try clearing the search or filters above.'
          }
          action={
            templates.length === 0 ? (
              <Button
                onClick={() => {
                  resetForm()
                  setCreateOpen(true)
                }}
              >
                + New Template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Version</TH>
              <TH>Risk Tier</TH>
              <TH>Requirements</TH>
              <TH>Min A.M. Best</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    href={`/dashboard/templates/${t.id}`}
                    className="font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    {t.name}
                  </Link>
                  {t.description && (
                    <div className="mt-0.5 max-w-sm truncate text-xs text-stone-500">{t.description}</div>
                  )}
                </TD>
                <TD>
                  <Badge tone="neutral">v{t.version ?? 1}</Badge>
                </TD>
                <TD className="capitalize">{t.applies_to_risk_tier || 'any'}</TD>
                <TD>{reqChips(t)}</TD>
                <TD>{t.min_carrier_am_best || '—'}</TD>
                <TD>
                  <Badge tone={t.is_active ? 'success' : 'neutral'}>{t.is_active ? 'active' : 'inactive'}</Badge>
                </TD>
                <TD className="text-stone-500">{fmtDate(t.created_at)}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/templates/${t.id}`}>
                      <Button variant="secondary" className="px-3 py-1.5 text-xs">
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setDeleting(t)}
                    >
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="New Requirement Template"
        footer={
          <>
            <Button variant="ghost" onClick={() => !saving && setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={saving}>
              {saving ? <Spinner label="Creating..." /> : 'Create Template'}
            </Button>
          </>
        }
      >
        <form onSubmit={submitCreate} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Standard Subcontractor — GL/Auto/Umbrella"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="When this template applies..."
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Risk Tier
              </label>
              <select
                value={form.applies_to_risk_tier}
                onChange={(e) => setForm({ ...form, applies_to_risk_tier: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                {RISK_TIERS.map((t) => (
                  <option key={t || 'any'} value={t}>
                    {t || 'any'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">
                Min A.M. Best
              </label>
              <input
                value={form.min_carrier_am_best}
                onChange={(e) => setForm({ ...form, min_carrier_am_best: e.target.value })}
                placeholder="A-"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <fieldset className="rounded-lg border border-stone-800 p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
              Endorsement Requirements
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ['require_ai_ongoing', 'Additional Insured — Ongoing Ops'],
                ['require_ai_completed', 'Additional Insured — Completed Ops'],
                ['accept_blanket_ai', 'Accept Blanket Additional Insured'],
                ['require_pnc', 'Primary & Non-Contributory'],
                ['require_waiver_subrogation', 'Waiver of Subrogation'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-stone-300">
                  <input
                    type="checkbox"
                    checked={(form as any)[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-stone-600 bg-stone-950 accent-cyan-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-stone-500">
            Per-coverage minimum limits are configured in the template editor after creation.
          </p>
        </form>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        title="Delete Template"
        footer={
          <>
            <Button variant="ghost" onClick={() => !deleteBusy && setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? <Spinner label="Deleting..." /> : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-300">
          Delete template <span className="font-semibold text-white">{deleting?.name}</span>? Projects using this
          template will lose their requirement linkage. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
