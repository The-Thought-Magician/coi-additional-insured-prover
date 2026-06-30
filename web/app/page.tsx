import Link from 'next/link'

const FEATURES = [
  {
    title: 'ACORD 25 Intake & Parsing',
    body: 'Ingest certificates and parse them into structured coverage lines: GL, Auto, Umbrella, Workers Comp, Professional. Carrier, NAIC, policy number, dates, and limits per line.',
  },
  {
    title: 'Endorsement Ledger',
    body: 'Record the forms that were actually attached: CG 20 10, CG 20 37, blanket AI, CG 24 04 waiver, P&NC. We grade the endorsement, not the checked box.',
  },
  {
    title: 'Deterministic Grading Engine',
    body: 'Auto-grade every certificate against the contract’s requirement template and emit precise, explainable deficiency reason codes linked to the exact field that triggered them.',
  },
  {
    title: 'Per-Contract Requirement Templates',
    body: 'Define required forms, P&NC, waiver of subrogation, and minimum limits per coverage line. Versioned so re-grades use the rules in force at issue.',
  },
  {
    title: 'Coverage-Lapse Timeline',
    body: 'Cross policy effective and expiry dates against on-site dates to surface exactly which days a vendor worked uninsured — the smoking gun in a claim.',
  },
  {
    title: 'Deficiency & Remediation Workbench',
    body: 'Every deficiency is a first-class record with severity, assignee, and status. Request corrected COIs, track due dates, and resolve when a compliant cert arrives.',
  },
  {
    title: 'Expiry & Renewal Radar',
    body: 'See certificates expiring in 0-30 / 31-60 / 61-90 days and already-expired. Auto-create reminders and log renewal requests per vendor.',
  },
  {
    title: 'Audit-Ready Evidence Packs',
    body: 'Generate immutable per-vendor or per-project snapshots: certificate, endorsement ledger, grading result, template version, and lapse timeline for litigation and lenders.',
  },
  {
    title: 'Compliance Reporting',
    body: 'Workspace KPIs: percent compliant vendors, open deficiencies by reason code, certs expiring this month, and vendors currently working uninsured.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-bold text-amber-400">CoiAdditionalInsuredProver</span>
        <div className="flex items-center gap-4">
          <Link href="/reason-codes" className="hidden text-slate-300 hover:text-white sm:inline">Reason Codes</Link>
          <Link href="/pricing" className="hidden text-slate-300 hover:text-white sm:inline">Pricing</Link>
          <Link href="/auth/sign-in" className="text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 rounded-lg font-semibold">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          For risk managers and contract-compliance leads at GCs and developers
        </div>
        <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
          Prove the endorsement,<br />not just the <span className="text-amber-400">checked box</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          A checked &ldquo;additional insured&rdquo; box on an ACORD 25 is informational only. The binding document is the
          endorsement form. CoiAdditionalInsuredProver grades the endorsement against your contract requirements,
          with reason-coded deficiencies and an exact coverage-lapse timeline.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-6 py-3 rounded-lg font-semibold">
            Start free
          </Link>
          <Link href="/auth/sign-in" className="border border-slate-700 hover:bg-slate-800 px-6 py-3 rounded-lg font-semibold text-slate-200">
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-600">All features free for signed-in users. Sample portfolio included.</p>
      </section>

      {/* Problem */}
      <section className="border-y border-slate-800 bg-slate-900/40 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Risk transfer fails silently</h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-slate-400">
            A subcontractor&rsquo;s COI shows an additional-insured checkbox, but the attached endorsement is a CG 20 10
            (ongoing operations only) when the contract required CG 20 37 (completed operations) too. Two years later a
            completed-operations claim hits, the sub&rsquo;s carrier denies AI status, and the GC&rsquo;s own carrier pays — then
            surcharges. That is the six-figure failure mode no checkbox tracker catches.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['Wrong form delivered', 'CG 20 10 where CG 20 37 was required — completed operations never covered.'],
              ['Coverage lapsed on-site', 'The vendor worked while their policy was expired. The exact uninsured days are your exposure.'],
              ['Manual review fails', 'A lead policing 300 subs across 40 projects cannot eyeball every form number against every contract.'],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left">
                <h3 className="font-semibold text-amber-300">{t}</h3>
                <p className="mt-2 text-sm text-slate-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Everything to prove risk transfer</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">
          Deterministic, explainable grading from intake through audit-ready evidence.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 px-6 py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Stop trusting the checkbox</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          Load the sample GC portfolio and watch the grading engine flag wrong forms, missing P&amp;NC, and uninsured days in seconds.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-6 py-3 rounded-lg font-semibold">
            Create your workspace
          </Link>
          <Link href="/pricing" className="border border-slate-700 hover:bg-slate-800 px-6 py-3 rounded-lg font-semibold text-slate-200">
            See pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-sm text-slate-600">
        <p>CoiAdditionalInsuredProver — COI endorsement compliance for general contractors and developers.</p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <Link href="/reason-codes" className="hover:text-slate-400">Reason Codes</Link>
          <Link href="/pricing" className="hover:text-slate-400">Pricing</Link>
          <Link href="/auth/sign-in" className="hover:text-slate-400">Sign In</Link>
        </div>
      </footer>
    </main>
  )
}
