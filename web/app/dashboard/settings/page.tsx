'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, toneForStatus } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Workspace {
  id: string
  name: string
  invite_code: string
  created_by?: string | null
  default_gl_each_occurrence?: number | null
  default_gl_aggregate?: number | null
  require_pnc_default?: boolean | null
  require_waiver_default?: boolean | null
  fiscal_year_start_month?: number | null
  settings?: Record<string, any> | null
  created_at?: string
}

interface Member {
  id: string
  workspace_id: string
  user_id: string
  role: string
  joined_at?: string
}

interface SeedStatus {
  seeded: boolean
  counts?: Record<string, number>
}

interface BillingPlan {
  subscription?: {
    id?: string
    plan_id?: string
    status?: string
    current_period_end?: string | null
    stripe_customer_id?: string | null
    stripe_subscription_id?: string | null
  } | null
  plan?: { id?: string; name?: string; price_cents?: number } | null
  stripeEnabled?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function dollars(cents?: number | null): string {
  if (cents == null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0 })}`
}

function limit(n?: number | null): string {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString()}`
}

function shortDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SettingsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [seed, setSeed] = useState<SeedStatus | null>(null)
  const [billing, setBilling] = useState<BillingPlan | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Workspace settings form
  const [form, setForm] = useState({
    name: '',
    default_gl_each_occurrence: '',
    default_gl_aggregate: '',
    require_pnc_default: false,
    require_waiver_default: false,
    fiscal_year_start_month: 1,
  })
  const [savingWs, setSavingWs] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)
  const [wsSaved, setWsSaved] = useState(false)

  // Invite / join
  const [inviteCopied, setInviteCopied] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinMsg, setJoinMsg] = useState<string | null>(null)

  // Create workspace
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)
  const [createWsError, setCreateWsError] = useState<string | null>(null)

  // Seed
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)

  // Billing
  const [billingBusy, setBillingBusy] = useState<'checkout' | 'portal' | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)

  function applyWorkspaceToForm(ws: Workspace) {
    setForm({
      name: ws.name || '',
      default_gl_each_occurrence: ws.default_gl_each_occurrence != null ? String(ws.default_gl_each_occurrence) : '',
      default_gl_aggregate: ws.default_gl_aggregate != null ? String(ws.default_gl_aggregate) : '',
      require_pnc_default: !!ws.require_pnc_default,
      require_waiver_default: !!ws.require_waiver_default,
      fiscal_year_start_month: ws.fiscal_year_start_month || 1,
    })
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const ws = await api.getCurrentWorkspace().catch(() => null)
      setWorkspace(ws)
      if (ws?.id) applyWorkspaceToForm(ws)

      const [mem, st, bill] = await Promise.all([
        ws?.id ? api.getWorkspaceMembers(ws.id).catch(() => []) : Promise.resolve([]),
        api.getSeedStatus().catch(() => null),
        api.getBillingPlan().catch(() => null),
      ])
      setMembers(Array.isArray(mem) ? mem : [])
      setSeed(st)
      setBilling(bill)
    } catch (e: any) {
      setError(e?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const seedCounts = useMemo(() => {
    const c = seed?.counts || {}
    return Object.entries(c).filter(([, v]) => typeof v === 'number')
  }, [seed])

  async function saveWorkspace() {
    if (!workspace) return
    if (!form.name.trim()) {
      setWsError('Workspace name is required')
      return
    }
    setSavingWs(true)
    setWsError(null)
    setWsSaved(false)
    const body = {
      name: form.name.trim(),
      default_gl_each_occurrence: form.default_gl_each_occurrence ? Number(form.default_gl_each_occurrence) : null,
      default_gl_aggregate: form.default_gl_aggregate ? Number(form.default_gl_aggregate) : null,
      require_pnc_default: form.require_pnc_default,
      require_waiver_default: form.require_waiver_default,
      fiscal_year_start_month: Number(form.fiscal_year_start_month),
    }
    try {
      const updated = await api.updateWorkspace(workspace.id, body)
      const next = updated?.id ? updated : { ...workspace, ...body }
      setWorkspace(next)
      applyWorkspaceToForm(next)
      setWsSaved(true)
      setTimeout(() => setWsSaved(false), 2500)
    } catch (e: any) {
      setWsError(e?.message || 'Failed to save workspace')
    } finally {
      setSavingWs(false)
    }
  }

  async function copyInvite() {
    if (!workspace?.invite_code) return
    try {
      await navigator.clipboard.writeText(workspace.invite_code)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    } catch {
      setInviteCopied(false)
    }
  }

  async function joinWorkspace() {
    if (!joinCode.trim()) {
      setJoinError('Enter an invite code')
      return
    }
    setJoining(true)
    setJoinError(null)
    setJoinMsg(null)
    try {
      const ws = await api.joinWorkspace(joinCode.trim())
      setJoinMsg(`Joined "${ws?.name || 'workspace'}". Reloading...`)
      setJoinCode('')
      await load()
    } catch (e: any) {
      setJoinError(e?.message || 'Failed to join workspace')
    } finally {
      setJoining(false)
    }
  }

  async function createWorkspace() {
    if (!newWsName.trim()) {
      setCreateWsError('Workspace name is required')
      return
    }
    setCreatingWs(true)
    setCreateWsError(null)
    try {
      await api.createWorkspace({ name: newWsName.trim() })
      setNewWsName('')
      await load()
    } catch (e: any) {
      setCreateWsError(e?.message || 'Failed to create workspace')
    } finally {
      setCreatingWs(false)
    }
  }

  async function runSeed() {
    setSeeding(true)
    setSeedError(null)
    try {
      await api.seedSample()
      const st = await api.getSeedStatus().catch(() => null)
      setSeed(st)
      // refresh members in case seeding touched workspace
      if (workspace?.id) {
        const mem = await api.getWorkspaceMembers(workspace.id).catch(() => [])
        setMembers(Array.isArray(mem) ? mem : [])
      }
    } catch (e: any) {
      setSeedError(e?.message || 'Failed to seed sample data')
    } finally {
      setSeeding(false)
    }
  }

  async function checkout() {
    setBillingBusy('checkout')
    setBillingError(null)
    try {
      const res = await api.startCheckout()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('No checkout URL returned')
      }
    } catch (e: any) {
      setBillingError(e?.message || 'Billing is not configured')
    } finally {
      setBillingBusy(null)
    }
  }

  async function portal() {
    setBillingBusy('portal')
    setBillingError(null)
    try {
      const res = await api.openPortal()
      if (res?.url) {
        window.location.href = res.url
      } else {
        setBillingError('No portal URL returned')
      }
    } catch (e: any) {
      setBillingError(e?.message || 'Billing is not configured')
    } finally {
      setBillingBusy(null)
    }
  }

  async function signOut() {
    try {
      await authClient.signOut()
    } finally {
      window.location.href = '/auth/sign-in'
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  if (error) {
    return (
      <EmptyState
        title="Could not load settings"
        description={error}
        action={<Button variant="secondary" onClick={load}>Retry</Button>}
      />
    )
  }

  const planName = billing?.plan?.name || billing?.subscription?.plan_id || 'Free'
  const isPro = (billing?.plan?.id || billing?.subscription?.plan_id || '').toLowerCase().includes('pro')
  const subStatus = billing?.subscription?.status || (isPro ? 'active' : 'free')

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your workspace defaults, team members, sample data, and subscription.
          </p>
        </div>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>

      {!workspace ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No active workspace"
              description="You are not a member of any workspace yet. Join one with an invite code below."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Members" value={members.length} />
          <Stat label="Plan" value={planName} tone={isPro ? 'success' : 'default'} />
          <Stat
            label="Sample Data"
            value={seed?.seeded ? 'Loaded' : 'Empty'}
            tone={seed?.seeded ? 'success' : 'default'}
          />
          <Stat label="FY Starts" value={MONTHS[(workspace.fiscal_year_start_month || 1) - 1]} />
        </div>
      )}

      {/* Workspace settings */}
      {workspace && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Workspace</h2>
            <p className="mt-1 text-sm text-slate-400">
              Defaults applied when grading certificates and building requirement templates.
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            {wsError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{wsError}</div>
            )}
            {wsSaved && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                Workspace settings saved.
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Workspace Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Northgate Construction Group"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Default GL Each Occurrence</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.default_gl_each_occurrence}
                  onChange={(e) => setForm({ ...form, default_gl_each_occurrence: e.target.value })}
                  placeholder="1000000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Current: {limit(workspace.default_gl_each_occurrence)}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Default GL Aggregate</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.default_gl_aggregate}
                  onChange={(e) => setForm({ ...form, default_gl_aggregate: e.target.value })}
                  placeholder="2000000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Current: {limit(workspace.default_gl_aggregate)}</p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Fiscal Year Start Month</label>
              <select
                value={form.fiscal_year_start_month}
                onChange={(e) => setForm({ ...form, fiscal_year_start_month: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none sm:max-w-xs"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.require_pnc_default}
                  onChange={(e) => setForm({ ...form, require_pnc_default: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  <span className="font-medium text-slate-200">Require Primary &amp; Non-Contributory by default</span>
                  <span className="mt-0.5 block text-xs text-slate-500">New templates inherit the P&amp;NC requirement.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.require_waiver_default}
                  onChange={(e) => setForm({ ...form, require_waiver_default: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  <span className="font-medium text-slate-200">Require Waiver of Subrogation by default</span>
                  <span className="mt-0.5 block text-xs text-slate-500">New templates inherit the waiver requirement.</span>
                </span>
              </label>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveWorkspace} disabled={savingWs}>
                {savingWs ? <Spinner /> : 'Save Workspace'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Members & invite */}
      {workspace && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
            <p className="mt-1 text-sm text-slate-400">
              Share the invite code so teammates can join this workspace.
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex-1">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Invite Code</div>
                <div className="mt-1 font-mono text-lg font-semibold tracking-wider text-amber-300">
                  {workspace.invite_code || '—'}
                </div>
              </div>
              <Button variant="secondary" onClick={copyInvite} disabled={!workspace.invite_code}>
                {inviteCopied ? 'Copied!' : 'Copy code'}
              </Button>
            </div>

            {members.length === 0 ? (
              <EmptyState title="No members" description="Members will appear here once they join." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Role</TH>
                    <TH className="text-right">Joined</TH>
                  </TR>
                </THead>
                <TBody>
                  {members.map((m) => (
                    <TR key={m.id}>
                      <TD className="font-mono text-xs text-slate-300">{m.user_id}</TD>
                      <TD>
                        <Badge tone={m.role === 'owner' ? 'amber' : toneForStatus(m.role)}>{m.role}</Badge>
                      </TD>
                      <TD className="text-right text-slate-400">{shortDate(m.joined_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {/* Create a new workspace */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Create a Workspace</h2>
          <p className="mt-1 text-sm text-slate-400">
            Start a new workspace for your organization. You will be the owner and can invite teammates afterward.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {createWsError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{createWsError}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="Workspace name (e.g. Acme Construction)"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <Button onClick={createWorkspace} disabled={creatingWs}>
              {creatingWs ? <Spinner /> : 'Create Workspace'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Join another workspace */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Join a Workspace</h2>
          <p className="mt-1 text-sm text-slate-400">
            Enter an invite code to join an existing workspace as a member.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {joinError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{joinError}</div>
          )}
          {joinMsg && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{joinMsg}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm uppercase tracking-wider text-slate-200 placeholder:text-slate-600 placeholder:normal-case focus:border-amber-500 focus:outline-none"
            />
            <Button onClick={joinWorkspace} disabled={joining}>
              {joining ? <Spinner /> : 'Join'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Sample data */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Sample Data</h2>
          <p className="mt-1 text-sm text-slate-400">
            Load a realistic GC subcontractor portfolio — projects, vendors, templates, and certificates with mixed compliance — to explore the platform.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {seedError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{seedError}</div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={seed?.seeded ? 'success' : 'neutral'}>
              {seed?.seeded ? 'Sample data loaded' : 'No sample data'}
            </Badge>
            <Button onClick={runSeed} disabled={seeding}>
              {seeding ? <Spinner label="Seeding..." /> : seed?.seeded ? 'Re-seed Sample Data' : 'Seed Sample Data'}
            </Button>
          </div>

          {seedCounts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {seedCounts.map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{k.replace(/_/g, ' ')}</div>
                  <div className="mt-0.5 text-xl font-semibold text-slate-100">{v}</div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Billing &amp; Subscription</h2>
          <p className="mt-1 text-sm text-slate-400">
            Manage your plan. {billing?.stripeEnabled === false ? 'Stripe is not configured on this deployment.' : 'Powered by Stripe.'}
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {billingError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{billingError}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-white">{planName}</span>
                <Badge tone={toneForStatus(subStatus)}>{subStatus}</Badge>
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {billing?.plan?.price_cents != null
                  ? `${dollars(billing.plan.price_cents)} / month`
                  : isPro
                    ? 'Active subscription'
                    : 'Free tier'}
              </div>
              {billing?.subscription?.current_period_end && (
                <div className="mt-1 text-xs text-slate-500">
                  Renews {shortDate(billing.subscription.current_period_end)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isPro && (
                <Button onClick={checkout} disabled={billingBusy !== null || billing?.stripeEnabled === false}>
                  {billingBusy === 'checkout' ? <Spinner /> : 'Upgrade to Pro'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={portal}
                disabled={billingBusy !== null || billing?.stripeEnabled === false}
              >
                {billingBusy === 'portal' ? <Spinner /> : 'Manage Billing'}
              </Button>
            </div>
          </div>

          {billing?.stripeEnabled === false && (
            <p className="text-xs text-slate-500">
              Checkout and the billing portal are disabled until Stripe environment variables are configured on the backend.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
