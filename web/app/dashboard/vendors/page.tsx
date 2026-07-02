'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Vendor {
  id: string
  legal_name: string
  dba?: string
  trade?: string
  ein?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  status?: string
  risk_tier?: string
  tags?: string[]
  notes?: string
  created_at?: string
}
interface SavedView {
  id: string
  name: string
  entity: string
  filters: VendorFilters
}
interface VendorFilters {
  search?: string
  status?: string
  risk_tier?: string
}

const STATUSES = ['active', 'inactive', 'archived']
const RISK_TIERS = ['low', 'medium', 'high']

const blankForm = {
  legal_name: '',
  dba: '',
  trade: '',
  ein: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  address: '',
  status: 'active',
  risk_tier: 'medium',
  tags: '',
  notes: '',
}

function riskTone(tier?: string) {
  const t = (tier ?? '').toLowerCase()
  if (t === 'high') return 'danger'
  if (t === 'medium') return 'warning'
  if (t === 'low') return 'success'
  return 'neutral'
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // filters
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [riskTier, setRiskTier] = useState('')

  // create modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...blankForm })
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  // saved-view save modal
  const [showSaveView, setShowSaveView] = useState(false)
  const [viewName, setViewName] = useState('')
  const [savingView, setSavingView] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadVendors = async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (search.trim()) params.search = search.trim()
      if (status) params.status = status
      if (riskTier) params.risk_tier = riskTier
      const res = await api.getVendors(params)
      setVendors(Array.isArray(res) ? res : [])
    } catch (e) {
      setError((e as Error).message || 'Failed to load vendors')
    } finally {
      setLoading(false)
    }
  }

  const loadViews = () => {
    api.getSavedViews('vendor')
      .then((res: SavedView[]) => setSavedViews(Array.isArray(res) ? res : []))
      .catch(() => setSavedViews([]))
  }

  // server-side filter for status/risk_tier/search via params
  useEffect(() => {
    loadVendors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, riskTier])

  useEffect(() => {
    const t = setTimeout(loadVendors, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => { loadViews() }, [])

  // Client-side safety filter (in case backend ignores a param).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return vendors.filter((v) => {
      if (status && (v.status ?? '') !== status) return false
      if (riskTier && (v.risk_tier ?? '') !== riskTier) return false
      if (!q) return true
      return [v.legal_name, v.dba, v.trade, v.contact_name, v.contact_email]
        .some((f) => (f ?? '').toLowerCase().includes(q))
    })
  }, [vendors, search, status, riskTier])

  const create = async () => {
    if (!form.legal_name.trim()) { setFormError('Legal name is required.'); return }
    setCreating(true)
    setFormError('')
    try {
      const body = {
        legal_name: form.legal_name.trim(),
        dba: form.dba.trim() || undefined,
        trade: form.trade.trim() || undefined,
        ein: form.ein.trim() || undefined,
        contact_name: form.contact_name.trim() || undefined,
        contact_email: form.contact_email.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
        risk_tier: form.risk_tier,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim() || undefined,
      }
      await api.createVendor(body)
      setShowCreate(false)
      setForm({ ...blankForm })
      loadVendors()
    } catch (e) {
      setFormError((e as Error).message || 'Failed to create vendor')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (v: Vendor) => {
    if (!confirm(`Delete vendor "${v.legal_name}"? This cannot be undone.`)) return
    setDeletingId(v.id)
    try {
      await api.deleteVendor(v.id)
      setVendors((cur) => cur.filter((x) => x.id !== v.id))
    } catch (e) {
      setError((e as Error).message || 'Failed to delete vendor')
    } finally {
      setDeletingId(null)
    }
  }

  const clearFilters = () => { setSearch(''); setStatus(''); setRiskTier('') }
  const hasFilters = Boolean(search.trim() || status || riskTier)

  const applyView = (v: SavedView) => {
    const f = v.filters || {}
    setSearch(f.search ?? '')
    setStatus(f.status ?? '')
    setRiskTier(f.risk_tier ?? '')
  }

  const saveView = async () => {
    if (!viewName.trim()) return
    setSavingView(true)
    try {
      const body = {
        name: viewName.trim(),
        entity: 'vendor',
        filters: {
          search: search.trim() || undefined,
          status: status || undefined,
          risk_tier: riskTier || undefined,
        },
      }
      await api.createSavedView(body)
      setShowSaveView(false)
      setViewName('')
      loadViews()
    } catch (e) {
      setError((e as Error).message || 'Failed to save view')
    } finally {
      setSavingView(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const inputCls = 'w-full rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-white placeholder:text-stone-500 focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'
  const selectCls = 'rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-sm text-white focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Vendors</h1>
          <p className="mt-1 text-sm text-stone-400">Subcontractor registry. Track trades, risk tiers, and compliance status.</p>
        </div>
        <Button onClick={() => { setForm({ ...blankForm }); setFormError(''); setShowCreate(true) }}>+ Add Vendor</Button>
      </div>

      {/* Saved views */}
      {savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Saved views:</span>
          {savedViews.map((v) => (
            <button
              key={v.id}
              onClick={() => applyView(v)}
              className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs text-stone-200 hover:border-cyan-500/50 hover:text-cyan-300"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/50 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, trade, contact…"
          className={`${inputCls} max-w-xs flex-1`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={riskTier} onChange={(e) => setRiskTier(e.target.value)} className={selectCls}>
          <option value="">All risk tiers</option>
          {RISK_TIERS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {hasFilters && <Button variant="ghost" onClick={clearFilters}>Clear</Button>}
        <Button variant="secondary" onClick={() => { setViewName(''); setShowSaveView(true) }} disabled={!hasFilters}>
          Save view
        </Button>
        <span className="ml-auto text-sm text-stone-500">{filtered.length} {filtered.length === 1 ? 'vendor' : 'vendors'}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <PageSpinner label="Loading vendors…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No vendors match your filters' : 'No vendors yet'}
          description={hasFilters ? 'Adjust or clear the filters to see more.' : 'Add your first subcontractor to start tracking certificate compliance.'}
          icon={<span>🏗️</span>}
          action={hasFilters
            ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
            : <Button onClick={() => setShowCreate(true)}>+ Add Vendor</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Vendor</TH>
              <TH>Trade</TH>
              <TH>Contact</TH>
              <TH>Risk</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((v) => (
              <TR key={v.id}>
                <TD>
                  <Link href={`/dashboard/vendors/${v.id}`} className="font-medium text-white hover:text-cyan-300">
                    {v.legal_name}
                  </Link>
                  {v.dba && <div className="text-xs text-stone-500">dba {v.dba}</div>}
                  {v.tags && v.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {v.tags.slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400">{t}</span>
                      ))}
                    </div>
                  )}
                </TD>
                <TD>{v.trade || <span className="text-stone-600">—</span>}</TD>
                <TD>
                  {v.contact_name || v.contact_email ? (
                    <div>
                      {v.contact_name && <div className="text-stone-300">{v.contact_name}</div>}
                      {v.contact_email && <div className="text-xs text-stone-500">{v.contact_email}</div>}
                    </div>
                  ) : <span className="text-stone-600">—</span>}
                </TD>
                <TD><Badge tone={riskTone(v.risk_tier)}>{v.risk_tier || 'n/a'}</Badge></TD>
                <TD><Badge tone={toneForStatus(v.status)}>{v.status || 'unknown'}</Badge></TD>
                <TD className="text-right">
                  <div className="inline-flex items-center gap-2">
                    <Link href={`/dashboard/vendors/${v.id}`}><Button variant="ghost">View</Button></Link>
                    <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => remove(v)} disabled={deletingId === v.id}>
                      {deletingId === v.id ? <Spinner /> : 'Delete'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Create vendor modal */}
      <Modal
        open={showCreate}
        onClose={() => !creating && setShowCreate(false)}
        title="Add Vendor"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create vendor'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Legal name *</label>
            <input value={form.legal_name} onChange={set('legal_name')} className={inputCls} placeholder="Acme Electrical, Inc." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">DBA</label>
              <input value={form.dba} onChange={set('dba')} className={inputCls} placeholder="Acme Electric" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Trade</label>
              <input value={form.trade} onChange={set('trade')} className={inputCls} placeholder="Electrical" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">EIN</label>
              <input value={form.ein} onChange={set('ein')} className={inputCls} placeholder="12-3456789" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Address</label>
              <input value={form.address} onChange={set('address')} className={inputCls} placeholder="123 Main St" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Contact name</label>
              <input value={form.contact_name} onChange={set('contact_name')} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Contact email</label>
              <input value={form.contact_email} onChange={set('contact_email')} className={inputCls} type="email" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Contact phone</label>
              <input value={form.contact_phone} onChange={set('contact_phone')} className={inputCls} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Status</label>
              <select value={form.status} onChange={set('status')} className={`${selectCls} w-full`}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Risk tier</label>
              <select value={form.risk_tier} onChange={set('risk_tier')} className={`${selectCls} w-full`}>
                {RISK_TIERS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Tags (comma-separated)</label>
            <input value={form.tags} onChange={set('tags')} className={inputCls} placeholder="union, prevailing-wage" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} className={inputCls} rows={3} />
          </div>
        </div>
      </Modal>

      {/* Save view modal */}
      <Modal
        open={showSaveView}
        onClose={() => !savingView && setShowSaveView(false)}
        title="Save current filters as a view"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSaveView(false)} disabled={savingView}>Cancel</Button>
            <Button onClick={saveView} disabled={savingView || !viewName.trim()}>{savingView ? 'Saving…' : 'Save view'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-stone-400">
            Captures the active search and filters so you can re-apply them with one click.
          </p>
          <input value={viewName} onChange={(e) => setViewName(e.target.value)} className={inputCls} placeholder="e.g. High-risk active subs" autoFocus />
          <div className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-2 text-xs text-stone-500">
            {[search.trim() && `search: "${search.trim()}"`, status && `status: ${status}`, riskTier && `risk: ${riskTier}`].filter(Boolean).join(' · ') || 'No filters set'}
          </div>
        </div>
      </Modal>
    </div>
  )
}
