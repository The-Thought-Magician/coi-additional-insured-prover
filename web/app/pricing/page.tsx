'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const FREE_FEATURES = [
  'Unlimited vendors, projects, and certificates',
  'ACORD 25 intake and coverage-line parsing',
  'Endorsement ledger (CG 20 10 / CG 20 37 / blanket AI / P&NC / waiver)',
  'Deterministic grading engine with reason codes',
  'Per-contract requirement templates (versioned)',
  'Coverage-lapse timeline and uninsured-day detection',
  'Deficiency workbench and remediation tracking',
  'Expiry / renewal radar and reminders',
  'Audit-ready evidence packs',
  'Carrier & rating registry',
  'Compliance reporting and KPIs',
  'Sample GC portfolio seeder',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState(false)
  const [planName, setPlanName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    // Public page: billing call only succeeds when signed in; ignore failures.
    api.getBillingPlan()
      .then((res: any) => {
        setStripeEnabled(Boolean(res?.stripeEnabled))
        if (res?.plan?.name) setPlanName(res.plan.name)
      })
      .catch(() => { /* not signed in or backend unavailable */ })
  }, [])

  const upgrade = async () => {
    setBusy(true)
    setNote('')
    try {
      const res: any = await api.startCheckout()
      if (res?.url) { window.location.href = res.url; return }
      setNote('Billing is not configured. All features are already free.')
    } catch {
      setNote('Billing is not configured. All features are already free.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-cyan-400">CoiAdditionalInsuredProver</Link>
        <div className="flex items-center gap-4">
          <Link href="/reason-codes" className="hidden text-stone-300 hover:text-white sm:inline">Reason Codes</Link>
          <Link href="/auth/sign-in" className="text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-cyan-500 hover:bg-cyan-400 text-stone-950 px-4 py-2 rounded-lg font-semibold">Get Started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black sm:text-5xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-stone-400">
          Every feature is free for signed-in users. A Pro plan exists for future managed billing, but you never need it
          to grade certificates, prove endorsements, or generate evidence packs.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="rounded-2xl border-2 border-cyan-500/40 bg-stone-900 p-8 text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Free</h2>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                {planName ? `Current: ${planName}` : 'Everything included'}
              </span>
            </div>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-4xl font-black">$0</span>
              <span className="pb-1 text-stone-500">/ forever</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-stone-300">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-cyan-400">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/auth/sign-up" className="mt-8 block rounded-lg bg-cyan-500 px-4 py-3 text-center font-semibold text-stone-950 hover:bg-cyan-400">
              Start free
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-8 text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-200">Pro</h2>
              <span className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs font-medium text-stone-400">
                {stripeEnabled ? 'Available' : 'Coming soon'}
              </span>
            </div>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-4xl font-black text-stone-300">Optional</span>
            </div>
            <p className="mt-6 text-sm text-stone-400">
              The same full feature set, billed via Stripe for organizations that require managed billing, invoicing, or
              seat administration. Stripe is optional — when it is not configured, checkout returns 503 and every feature
              stays free.
            </p>
            <button
              onClick={upgrade}
              disabled={busy}
              className="mt-8 block w-full rounded-lg border border-stone-700 px-4 py-3 text-center font-semibold text-stone-200 hover:bg-stone-800 disabled:opacity-50"
            >
              {busy ? 'Starting checkout...' : stripeEnabled ? 'Upgrade to Pro' : 'Contact for Pro'}
            </button>
            {note && <p className="mt-3 text-center text-xs text-stone-500">{note}</p>}
          </div>
        </div>

        <p className="mt-10 text-sm text-stone-500">
          Already have an account? <Link href="/dashboard/settings" className="text-cyan-400 hover:text-cyan-300">Manage billing in settings</Link>
        </p>
      </section>
    </main>
  )
}
