'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Carrier {
  id: string
  name: string
  naic: string | null
  am_best_rating: string | null
  admitted: boolean | null
  created_at?: string
}

const RATING_ORDER = ['A++', 'A+', 'A', 'A-', 'B++', 'B+', 'B', 'B-', 'C++', 'C+', 'C', 'C-', 'D', 'E', 'F', 'NR']

function ratingTone(rating?: string | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!rating) return 'neutral'
  const r = rating.toUpperCase().trim()
  if (['A++', 'A+', 'A', 'A-'].includes(r)) return 'success'
  if (['B++', 'B+', 'B', 'B-'].includes(r)) return 'warning'
  if (r === 'NR' || r === '') return 'neutral'
  return 'danger'
}

const emptyForm = { name: '', naic: '', am_best_rating: '', admitted: true }

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [admittedFilter, setAdmittedFilter] = useState<'all' | 'admitted' | 'non-admitted'>('all')
  const [ratingFilter, setRatingFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Carrier | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getCarriers()
      setCarriers(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load carriers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo(() => {
    const total = carriers.length
    const admitted = carriers.filter((c) => c.admitted).length
    const aRated = carriers.filter((c) => ratingTone(c.am_best_rating) === 'success').length
    const subStandard = carriers.filter(
      (c) => ratingTone(c.am_best_rating) === 'danger',
    ).length
    return { total, admitted, aRated, subStandard }
  }, [carriers])

  const ratingOptions = useMemo(() => {
    const present = new Set(carriers.map((c) => (c.am_best_rating || '').toUpperCase().trim()).filter(Boolean))
    return RATING_ORDER.filter((r) => present.has(r))
  }, [carriers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return carriers
      .filter((c) => {
        if (q) {
          const hay = `${c.name} ${c.naic ?? ''} ${c.am_best_rating ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (admittedFilter === 'admitted' && !c.admitted) return false
        if (admittedFilter === 'non-admitted' && c.admitted) return false
        if (ratingFilter !== 'all') {
          if ((c.am_best_rating || '').toUpperCase().trim() !== ratingFilter) return false
        }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [carriers, search, admittedFilter, ratingFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: Carrier) {
    setEditing(c)
    setForm({
      name: c.name || '',
      naic: c.naic || '',
      am_best_rating: c.am_best_rating || '',
      admitted: c.admitted ?? true,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError('Carrier name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    const body = {
      name: form.name.trim(),
      naic: form.naic.trim() || null,
      am_best_rating: form.am_best_rating.trim() || null,
      admitted: form.admitted,
    }
    try {
      if (editing) {
        await api.updateCarrier(editing.id, body)
      } else {
        await api.createCarrier(body)
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save carrier')
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Carrier) {
    if (!confirm(`Delete carrier "${c.name}"? This removes it from the rating registry.`)) return
    setDeletingId(c.id)
    try {
      await api.deleteCarrier(c.id)
      setCarriers((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e: any) {
      alert(e?.message || 'Failed to delete carrier')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Registry</h1>
          <p className="mt-1 text-sm text-stone-400">
            Track insurance carriers, NAIC numbers, and AM Best financial-strength ratings used in COI grading.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Carrier</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Carriers" value={stats.total} />
        <Stat label="Admitted" value={stats.admitted} tone="success" hint="Licensed in state" />
        <Stat label="A-Rated or Better" value={stats.aRated} tone="success" />
        <Stat label="Below B-" value={stats.subStandard} tone={stats.subStandard ? 'danger' : 'default'} />
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, NAIC, rating..."
              className="min-w-[200px] flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
            <select
              value={admittedFilter}
              onChange={(e) => setAdmittedFilter(e.target.value as any)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All status</option>
              <option value="admitted">Admitted</option>
              <option value="non-admitted">Non-admitted</option>
            </select>
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All ratings</option>
              {ratingOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading carriers..." />
      ) : error ? (
        <EmptyState
          title="Could not load carriers"
          description={error}
          action={<Button variant="secondary" onClick={load}>Retry</Button>}
        />
      ) : carriers.length === 0 ? (
        <EmptyState
          title="No carriers yet"
          description="Add the insurance carriers your subcontractors place coverage with to enable AM Best rating checks during grading."
          action={<Button onClick={openCreate}>+ Add Carrier</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching carriers" description="Try clearing your search or filters." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Carrier</TH>
              <TH>NAIC</TH>
              <TH>AM Best</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium text-stone-100">{c.name}</TD>
                <TD className="font-mono text-xs text-stone-400">{c.naic || '—'}</TD>
                <TD>
                  {c.am_best_rating ? (
                    <Badge tone={ratingTone(c.am_best_rating)}>{c.am_best_rating}</Badge>
                  ) : (
                    <span className="text-stone-600">Not rated</span>
                  )}
                </TD>
                <TD>
                  <Badge tone={c.admitted ? toneForStatus('admitted') : 'neutral'}>
                    {c.admitted ? 'Admitted' : 'Non-admitted'}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="inline-flex gap-2">
                    <Button variant="ghost" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                    <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => remove(c)} disabled={deletingId === c.id}>
                      {deletingId === c.id ? <Spinner /> : 'Delete'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Carrier' : 'Add Carrier'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner /> : editing ? 'Save Changes' : 'Add Carrier'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formError}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Carrier Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Travelers Indemnity Company"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">NAIC #</label>
              <input
                value={form.naic}
                onChange={(e) => setForm({ ...form, naic: e.target.value })}
                placeholder="25658"
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">AM Best Rating</label>
              <select
                value={form.am_best_rating}
                onChange={(e) => setForm({ ...form, am_best_rating: e.target.value })}
                className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">— Unrated —</option>
                {RATING_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={form.admitted}
              onChange={(e) => setForm({ ...form, admitted: e.target.checked })}
              className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-cyan-500 focus:ring-cyan-500"
            />
            Admitted carrier (licensed in state)
          </label>
        </div>
      </Modal>
    </div>
  )
}
