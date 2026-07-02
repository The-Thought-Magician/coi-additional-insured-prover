import Link from 'next/link'

const FEATURES = [
  {
    title: 'ACORD 25 Intake & Parsing',
    body: 'Ingest certificates and parse them into structured coverage lines: GL, Auto, Umbrella, Workers Comp, Professional. Carrier, NAIC, policy number, dates, and limits are extracted per line for audit.',
  },
  {
    title: 'Endorsement Ledger',
    body: 'Record the forms actually attached to the policy: CG 20 10, CG 20 37, blanket AI, CG 24 04 waiver, P&NC. Additional insured status is evidenced by the endorsement, not the checked box.',
  },
  {
    title: 'Deterministic Grading Engine',
    body: 'Every certificate is graded against the contract requirement template on file, producing explainable, reason-coded deficiencies linked to the exact field that failed review.',
  },
  {
    title: 'Per-Contract Requirement Templates',
    body: 'Codify required forms, primary-and-noncontributory language, waiver of subrogation, and minimum limits per coverage line. Templates are versioned so re-grades apply the rules in force at time of issue.',
  },
  {
    title: 'Coverage-Lapse Timeline',
    body: 'Policy effective and expiry dates are cross-referenced against on-site dates to produce a precise record of any period a vendor performed work without active coverage.',
  },
  {
    title: 'Deficiency & Remediation Workbench',
    body: 'Every deficiency is logged as a first-class record with severity, assignee, and status. Corrected certificates are requested, due dates tracked, and records closed only on confirmed compliance.',
  },
  {
    title: 'Expiry & Renewal Radar',
    body: 'Certificates approaching expiration are surfaced at 0-30, 31-60, and 61-90 day intervals, alongside those already lapsed, with reminders and renewal requests logged per vendor.',
  },
  {
    title: 'Audit-Ready Evidence Packs',
    body: 'Generate an immutable evidentiary record per vendor or per project: certificate, endorsement ledger, grading result, template version in force, and coverage-lapse timeline, suitable for litigation, audit, or lender review.',
  },
  {
    title: 'Compliance Reporting',
    body: 'Workspace-level reporting on percent of vendors in compliance, open deficiencies by reason code, certificates expiring in the current period, and vendors currently performing work without evidenced coverage.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <nav className="border-b border-stone-200 bg-stone-50 px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-bold text-stone-900">Coi<span className="text-cyan-500">AI</span>Prover</span>
        <div className="flex items-center gap-4">
          <Link href="/reason-codes" className="hidden text-stone-600 hover:text-stone-900 sm:inline">Reason Codes</Link>
          <Link href="/pricing" className="hidden text-stone-600 hover:text-stone-900 sm:inline">Pricing</Link>
          <Link href="/auth/sign-in" className="text-stone-600 hover:text-stone-900">Sign In</Link>
          <Link href="/auth/sign-up" className="bg-cyan-500 hover:bg-cyan-400 text-stone-950 px-4 py-2 rounded-lg font-semibold">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700">
          For risk managers and contract-compliance leads at GCs and developers
        </div>
        <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
          Prove additional insured status,<br />not just a <span className="text-cyan-500">checked box</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600">
          A checked &ldquo;additional insured&rdquo; field on an ACORD 25 is informational only and confers no rights. The
          binding instrument is the endorsement form attached to the policy. CoiAdditionalInsuredProver grades that
          endorsement against your contract requirements and produces an audit-ready COI evidence trail, with
          reason-coded deficiencies and a precise coverage-lapse timeline.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-cyan-500 hover:bg-cyan-400 text-stone-950 px-6 py-3 rounded-lg font-semibold">
            Start free
          </Link>
          <Link href="/auth/sign-in" className="border border-stone-300 hover:bg-stone-200 px-6 py-3 rounded-lg font-semibold text-stone-700">
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-xs text-stone-500">All features free for signed-in users. Sample portfolio included for review.</p>
      </section>

      {/* Problem */}
      <section className="border-y border-stone-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Risk transfer fails silently</h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-stone-600">
            A subcontractor&rsquo;s certificate shows an additional-insured field checked, but the endorsement actually
            attached is a CG 20 10 (ongoing operations only) where the contract required a CG 20 37 (completed
            operations) as well. A completed-operations claim surfaces years later, the subcontractor&rsquo;s carrier
            denies additional insured status on the applicable claim, and the general contractor&rsquo;s own carrier pays
            and subsequently surcharges. That is the failure mode a checkbox tracker does not catch, and it is the
            gap this system is built to close.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['Wrong form delivered', 'CG 20 10 provided where CG 20 37 was contractually required — completed operations exposure remains uncovered.'],
              ['Coverage lapsed on-site', 'The vendor performed work while the policy was expired. The exact uninsured period is your documented exposure.'],
              ['Manual review does not scale', 'A compliance lead reviewing hundreds of subcontractors across dozens of projects cannot reliably verify every form number against every contract by hand.'],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-left">
                <h3 className="font-semibold text-cyan-700">{t}</h3>
                <p className="mt-2 text-sm text-stone-600">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">A complete evidence trail for risk transfer</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-stone-600">
          Deterministic, explainable grading from certificate intake through audit-ready evidence production.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-stone-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200 px-6 py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">Stop relying on the checkbox</h2>
        <p className="mx-auto mt-3 max-w-xl text-stone-600">
          Load the sample portfolio and observe the grading engine flag incorrect endorsement forms, missing
          primary-and-noncontributory language, and uninsured periods in seconds.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/auth/sign-up" className="bg-cyan-500 hover:bg-cyan-400 text-stone-950 px-6 py-3 rounded-lg font-semibold">
            Create your workspace
          </Link>
          <Link href="/pricing" className="border border-stone-300 hover:bg-stone-200 px-6 py-3 rounded-lg font-semibold text-stone-700">
            See pricing
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-stone-50 py-8 text-center text-sm text-stone-500">
        <p>CoiAdditionalInsuredProver — audit-ready COI endorsement compliance for general contractors and developers.</p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <Link href="/reason-codes" className="hover:text-stone-700">Reason Codes</Link>
          <Link href="/pricing" className="hover:text-stone-700">Pricing</Link>
          <Link href="/auth/sign-in" className="hover:text-stone-700">Sign In</Link>
        </div>
      </footer>
    </main>
  )
}
