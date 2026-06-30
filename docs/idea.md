# CoiAdditionalInsuredProver — Feature Spec

> Prove every vendor's certificate actually names you as additional insured with the right endorsement form, not just a checked box on the ACORD 25.

---

## Overview

CoiAdditionalInsuredProver is a SaaS platform for risk managers and contract-compliance leads at general contractors (GCs) and large property developers. It ingests subcontractor Certificates of Insurance (ACORD 25 and attached endorsements), parses them into structured coverage lines, and then **proves** — deterministically, with reason codes — that each certificate actually transfers risk: that the correct additional-insured (AI) endorsement form was provided, that primary-and-noncontributory (P&NC) wording is present, that waiver-of-subrogation applies, and that limits meet the contract's requirements.

The product's core thesis is that the failure mode that costs GCs six figures in litigation is not a missing certificate — it is a present certificate whose endorsement form did not actually do what the contract required. A checked "additional insured" box on an ACORD 25 is informational only; the binding document is the endorsement (CG 20 10, CG 20 37, blanket AI, etc.). This platform grades the endorsement, not the box.

The platform is multi-tenant by workspace. Every record is scoped to a `workspace_id`. All features are FREE for signed-in users; Stripe billing is wired but optional (returns 503 when unconfigured). A built-in sample-data seeder loads a realistic GC subcontractor portfolio for instant demoability.

---

## Problem

General contractors and developers face direct six-figure exposure when a subcontractor's missing or wrong endorsement shifts an injury claim back onto the GC's own policy, raising premiums and EMR (Experience Modification Rate). Specifically:

- **Risk transfer fails silently.** A subcontractor's COI shows an "additional insured" checkbox, but the attached endorsement is a CG 20 10 (ongoing operations only) when the contract required CG 20 37 (completed operations) too. Two years later a completed-operations claim hits, the sub's carrier denies AI status, and the GC's own carrier pays — then surcharges.
- **Compliance is mandated.** Prime contracts and construction lenders require specific AI forms, P&NC, waiver of subrogation, and minimum limits per coverage line. Noncompliance can stop a draw or breach the prime.
- **COIs expire annually.** Policies renew yearly, forcing recurring re-review of hundreds of certificates. Coverage gaps (the days a vendor worked while their policy was lapsed or expired) are the smoking gun in a claim.
- **Manual review does not scale.** A compliance lead policing 300 subs across 40 projects cannot eyeball every endorsement form number against every contract requirement.

---

## Target Users

- **Risk managers** at general contractors and large property developers.
- **Contract-compliance leads** policing hundreds of subcontractor certificates across many projects.
- **Project administrators / contract administrators** who collect COIs at onboarding and at each renewal.
- **Buyer:** Risk manager or contract-compliance lead at a GC or property developer.

---

## Why this is NOT an existing project (near-neighbors named)

- **Generic vendor-management / supplier-record tools** (e.g. supplier onboarding, vendor master data): they track that a vendor exists and may store a COI PDF, but they do not parse the ACORD 25 into coverage lines nor grade endorsement forms against contract requirements. They check "is there a document," not "does the document transfer risk."
- **`clinical-credential-lapse-warden`** (sibling venture): tracks healthcare-provider licenses and credential expiry. It is about person-level credentials, not insurance endorsement forms, AI status, or P&NC wording. No ACORD parsing, no coverage-line grading.
- **COI tracking add-ons in construction-management suites**: typically a checkbox + expiry-date reminder. They do not maintain an endorsement ledger distinguishing CG 20 10 vs CG 20 37 vs blanket AI, nor produce deficiency reason codes, nor compute the exact days a vendor worked uninsured.
- **Insurance broker portals**: issue and store certificates from the broker's side; they are not the holder's (GC's) compliance-grading tool and do not encode the GC's per-contract requirement templates.

The distinct capability here: **deterministically prove that the endorsement form and P&NC wording actually transfer risk against a per-contract requirement template, with reason-coded deficiencies and an exact coverage-lapse timeline.** That is the precise thing that fails GCs in litigation, and no near-neighbor does it.

---

## Major Feature Sections

### 1. Workspace & Team Management
- Create and manage workspaces (one GC org per workspace).
- Invite teammates via invite code; roles (owner, compliance lead, reviewer, read-only).
- Per-workspace settings: default required limits, default required AI forms, fiscal year.
- Workspace-scoped everything: vendors, projects, certificates are all keyed to `workspace_id`.

### 2. Vendor / Subcontractor Registry
- CRUD subcontractor records: legal name, DBA, trade, EIN, contact, address.
- Vendor status (active, inactive, terminated).
- Vendor risk tier (low/medium/high) driving stricter requirement defaults.
- Vendor-to-project assignments (one vendor can work many projects).
- Vendor notes and tags.

### 3. Project / Job Registry
- CRUD projects (jobs): name, address, owner/developer, lender, prime contract reference, start/end dates.
- Project lender requirements flag (lender-mandated minimum limits).
- Assign requirement templates per project.
- Map which vendors are assigned to which projects with on-site start/end dates.

### 4. ACORD 25 Intake & Parsing
- Intake a certificate: upload reference, or paste/enter structured ACORD 25 fields, or generate from sample seeder.
- Parse into coverage lines: General Liability, Auto Liability, Umbrella/Excess, Workers Comp, Professional/E&O.
- Capture per line: carrier name, NAIC, policy number, effective date, expiry date, each-occurrence limit, aggregate limit, the checkbox states (AI, subrogation waived, P&NC).
- Capture certificate holder, description of operations, issue date, producer.
- Validate certificate completeness (missing dates, missing limits, expired on arrival).

### 5. Endorsement Ledger
- Per certificate, record which endorsement forms were actually attached/provided.
- Supported forms: CG 20 10 (AI ongoing ops), CG 20 37 (AI completed ops), blanket AI, CG 24 04 (waiver of subrogation), primary-and-noncontributory endorsement, CA AI (auto), umbrella follow-form.
- Per endorsement: form number, edition date, scope (ongoing/completed/both), applies-to coverage line, blanket vs scheduled, scheduled-holder text.
- Track provided-vs-required: which forms the contract required vs which were actually delivered.

### 6. Per-Contract Requirement Templates
- Define reusable requirement templates: required coverage lines, minimum each-occurrence and aggregate limits per line, required AI forms (ongoing/completed/both), P&NC required, waiver-of-subrogation required, umbrella minimum.
- Templates assignable to projects and/or vendor risk tiers.
- Template versioning so re-grades use the version in force at certificate issue.

### 7. Deterministic COI Grading Engine
- Auto-grade each incoming certificate against the applicable requirement template.
- Produce a pass/fail per requirement plus an overall compliance status (compliant, deficient, expired, pending).
- Emit precise **deficiency reason codes** (e.g. `AI_COMPLETED_OPS_MISSING`, `LIMIT_BELOW_REQUIRED`, `PNC_MISSING`, `WAIVER_MISSING`, `POLICY_EXPIRED`, `BLANKET_AI_NOT_ACCEPTED`, `WRONG_FORM_EDITION`).
- Re-grade on demand and on template change.
- Grading is deterministic and explainable: each reason code links to the exact rule and the exact certificate field that triggered it.

### 8. Deficiency Management & Remediation
- A deficiency is a first-class record: certificate, reason code, severity, status (open, waived, resolved), assigned-to.
- Remediation workflow: request a corrected COI/endorsement from the vendor, track due date, mark resolved when a compliant certificate arrives.
- Bulk view of all open deficiencies across the workspace, filterable by project/vendor/reason code.

### 9. Expiry / Renewal Radar
- Track each policy's expiry date per coverage line.
- Radar view: certificates expiring in 0-30 / 31-60 / 61-90 days, and already-expired.
- Auto-create renewal reminders and renewal tasks.
- Renewal request log per vendor.

### 10. Coverage-Lapse Timeline
- For each vendor-project assignment, compute the timeline of covered vs uncovered days using policy effective/expiry dates and the vendor's on-site dates.
- Surface **exactly which days a vendor worked uninsured** (on-site but no active policy on that coverage line).
- Per-line lapse segments with start/end and gap length.

### 11. Holder / Project Mapping
- Map one policy across many projects (a vendor's single GL policy covers work on several jobs).
- Verify the certificate holder text and AI scheduling cover the specific project/holder entity.
- Detect holder-mismatch (cert names a different holder/entity than the project requires).

### 12. Audit-Ready Evidence Packs
- Generate a per-vendor (or per-project) evidence pack: the certificate, the endorsement ledger, the grading result with reason codes, the requirement template version, and the coverage-lapse timeline.
- Packs are immutable snapshots for litigation/lender/audit.
- Export pack as structured JSON; list and retrieve past packs.

### 13. Sample-Data Seeder (GC Subcontractor Portfolio)
- One-click seed of a realistic GC portfolio: ~8 projects, ~30 subcontractors, ~40 certificates with a mix of compliant and deficient endorsements, requirement templates, and coverage gaps.
- Idempotent (only seeds reference/demo data when empty).
- Lets a buyer evaluate the full grading engine without uploading real COIs.

### 14. Carrier & Rating Registry
- Reference list of carriers with NAIC, AM Best rating, and admitted/non-admitted status.
- Flag certificates whose carrier falls below a minimum acceptable rating (requirement option).
- Carrier lookup used during certificate intake.

### 15. Requirement Reason-Code Catalog
- A reference catalog of all deficiency reason codes: code, human-readable title, description, default severity, remediation guidance.
- Used by the grading engine and surfaced in the UI for explainability.

### 16. Waiver & Exception Management
- Allow a compliance lead to waive a specific deficiency on a specific certificate with a justification and expiry.
- Waivers are audited (who, when, why, until when).
- Waived deficiencies still appear in evidence packs flagged as waived.

### 17. Notifications & Alerts
- Per-user notification feed: new deficiency, certificate expiring, renewal due, deficiency resolved, waiver expiring.
- Mark-read / mark-all-read.
- Notification preferences per type.

### 18. Tasks & Assignments
- Task records (request COI, follow up, review endorsement) with assignee, due date, status, and linkage to vendor/project/certificate/deficiency.
- My-tasks view and overdue view.

### 19. Reporting & Compliance Dashboard
- Workspace KPIs: % compliant vendors, open-deficiency count by reason code, certificates expiring this month, vendors currently working uninsured.
- Per-project compliance rollup.
- Per-vendor compliance scorecard.

### 20. Activity Log / Audit Trail
- Append-only log of every consequential action: certificate graded, deficiency opened/resolved/waived, template changed, evidence pack generated.
- Filter by entity, actor, date.

### 21. Document / Attachment References
- Attach reference metadata for uploaded COI PDFs and endorsement scans (filename, type, uploaded_by) linked to a certificate.
- (Storage URLs are references; deterministic analysis runs over the structured fields.)

### 22. Saved Views & Filters
- Save filtered certificate/deficiency/vendor list configurations for quick reuse.
- Per-user saved views.

### 23. Billing (Stripe optional)
- Free plan for all signed-in users; Pro plan defined but optional.
- Stripe checkout/portal/webhook wired; returns 503 when `STRIPE_SECRET_KEY` unset.

---

## Data Model (tables)

- `workspaces` — tenant root.
- `workspace_members` — user-to-workspace with role.
- `vendors` — subcontractors.
- `projects` — jobs.
- `vendor_project_assignments` — vendor on a project with on-site start/end.
- `requirement_templates` — reusable requirement sets (versioned).
- `template_line_requirements` — per-coverage-line minimums within a template.
- `certificates` — ACORD 25 header (holder, producer, issue date, status).
- `coverage_lines` — parsed per-line coverage on a certificate.
- `endorsements` — endorsement ledger rows on a certificate.
- `gradings` — grading run result for a certificate vs a template version.
- `deficiencies` — reason-coded deficiency records.
- `reason_codes` — catalog of deficiency reason codes.
- `coverage_gaps` — computed lapse segments per vendor-project assignment.
- `evidence_packs` — immutable audit snapshots.
- `carriers` — carrier/rating registry.
- `waivers` — deficiency waivers/exceptions.
- `renewal_reminders` — expiry/renewal radar reminders.
- `notifications` — per-user notification feed.
- `tasks` — assignments/follow-ups.
- `activity_log` — append-only audit trail.
- `attachments` — document reference metadata.
- `saved_views` — per-user saved list filters.
- `plans` — billing plans.
- `subscriptions` — per-user subscription.

---

## API Surface (high level, all under /api/v1)

- `/workspaces` — workspace CRUD + members + current.
- `/vendors` — vendor CRUD, assignments, scorecard.
- `/projects` — project CRUD, vendor mapping, compliance rollup.
- `/templates` — requirement templates + line requirements.
- `/certificates` — intake, list, detail, parse, regrade.
- `/coverage-lines` — per-certificate coverage lines.
- `/endorsements` — endorsement ledger CRUD.
- `/gradings` — grading runs + results.
- `/deficiencies` — deficiency list, update, resolve.
- `/reason-codes` — reason-code catalog (public read).
- `/coverage-gaps` — lapse timeline.
- `/evidence-packs` — generate/list/get.
- `/carriers` — carrier registry (public read).
- `/waivers` — waiver CRUD.
- `/renewals` — expiry radar + reminders.
- `/notifications` — feed + mark read.
- `/tasks` — task CRUD.
- `/reports` — dashboard KPIs + rollups.
- `/activity` — audit log.
- `/attachments` — attachment metadata.
- `/saved-views` — saved views CRUD.
- `/seed` — sample-data seeder.
- `/billing` — plan/checkout/portal/webhook.

---

## Frontend Pages (~22-26)

Public:
1. `/` — landing (static marketing).
2. `/auth/sign-in` — sign in.
3. `/auth/sign-up` — sign up.
4. `/pricing` — pricing (static + billing CTA).
5. `/reason-codes` — public reason-code catalog reference.

Dashboard (all under `/dashboard`, shared sidebar layout):
6. `/dashboard` — overview KPIs.
7. `/dashboard/vendors` — vendor registry list.
8. `/dashboard/vendors/[id]` — vendor detail + scorecard + assignments.
9. `/dashboard/projects` — project registry list.
10. `/dashboard/projects/[id]` — project detail + vendor map + compliance rollup.
11. `/dashboard/certificates` — certificate list with grading status.
12. `/dashboard/certificates/new` — intake new ACORD 25.
13. `/dashboard/certificates/[id]` — certificate detail (coverage lines, endorsement ledger, grading, regrade).
14. `/dashboard/templates` — requirement templates list.
15. `/dashboard/templates/[id]` — template editor with line requirements.
16. `/dashboard/deficiencies` — open-deficiency workbench.
17. `/dashboard/renewals` — expiry/renewal radar.
18. `/dashboard/coverage-gaps` — coverage-lapse timeline explorer.
19. `/dashboard/evidence-packs` — evidence packs list + generate.
20. `/dashboard/carriers` — carrier/rating registry.
21. `/dashboard/waivers` — waiver/exception management.
22. `/dashboard/tasks` — task workbench.
23. `/dashboard/notifications` — notification feed.
24. `/dashboard/activity` — audit log viewer.
25. `/dashboard/reports` — compliance reporting.
26. `/dashboard/settings` — workspace settings, seed sample data, billing.

---

## Build / Stack

- Backend: Hono + TypeScript on Render. Drizzle ORM + Neon Postgres.
- Frontend: Next.js 16 + React 19 + Tailwind 4, Neon Auth (`@neondatabase/auth`).
- Deterministic grading engine over uploaded/connected/generated structured data.
- Built-in sample-data seeder for demoability.
- All features FREE for signed-in users; Stripe optional (503 when unconfigured).
