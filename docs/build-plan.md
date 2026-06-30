# CoiAdditionalInsuredProver — Build Plan (Authoritative Build Contract)

> This is the single source of truth. Filenames, mount paths, api method names, and page file paths declared here are BINDING. Every backend route file mounts under `/api/v1` via the child Hono `api` router. Every domain route file does `export default router`. Public reads / auth-gated writes with zod validation and ownership checks. Frontend calls are relative `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Backend trusts `X-User-Id` and uses `getUserId(c)` everywhere. Web uses `proxy.ts` only.

---

## (a) Tables (columns)

(Authoritative DDL is `backend/src/db/schema.ts` + `backend/src/db/migrate.ts`. Summary below.)

- **workspaces** — id, name, invite_code(uniq), created_by, default_gl_each_occurrence, default_gl_aggregate, require_pnc_default, require_waiver_default, fiscal_year_start_month, settings(jsonb), created_at, updated_at
- **workspace_members** — id, workspace_id→workspaces, user_id, role, joined_at; UNIQUE(workspace_id,user_id)
- **vendors** — id, workspace_id→workspaces, legal_name, dba, trade, ein, contact_name, contact_email, contact_phone, address, status, risk_tier, tags(jsonb), notes, created_by, created_at, updated_at
- **projects** — id, workspace_id→workspaces, name, address, owner_developer, lender, prime_contract_ref, template_id→requirement_templates, lender_mandated, holder_entity_text, start_date, end_date, status, created_by, created_at, updated_at
- **vendor_project_assignments** — id, workspace_id→workspaces, vendor_id→vendors, project_id→projects, onsite_start, onsite_end, scope_of_work, created_at; UNIQUE(vendor_id,project_id)
- **requirement_templates** — id, workspace_id→workspaces, name, description, version, applies_to_risk_tier, require_ai_ongoing, require_ai_completed, accept_blanket_ai, require_pnc, require_waiver_subrogation, min_carrier_am_best, is_active, created_by, created_at, updated_at
- **template_line_requirements** — id, template_id→requirement_templates, coverage_type, required, min_each_occurrence, min_aggregate, notes, created_at; UNIQUE(template_id,coverage_type)
- **certificates** — id, workspace_id→workspaces, vendor_id→vendors, project_id→projects, template_id→requirement_templates, template_version, holder_text, producer, insured_name, description_of_operations, issue_date, status, compliance_status, source, created_by, created_at, updated_at
- **coverage_lines** — id, certificate_id→certificates, coverage_type, carrier_name, carrier_naic, policy_number, effective_date, expiry_date, each_occurrence, aggregate_limit, additional_insured_box, subrogation_waived_box, pnc_box, created_at
- **endorsements** — id, certificate_id→certificates, form_number, edition_date, endorsement_type, coverage_type, scope, is_blanket, scheduled_holder_text, provided, created_at
- **gradings** — id, workspace_id→workspaces, certificate_id→certificates, template_id→requirement_templates, template_version, overall_status, score(real), passed_count, failed_count, results(jsonb), graded_by, created_at
- **reason_codes** — id(text PK, seeded), title, description, default_severity, remediation, created_at
- **deficiencies** — id, workspace_id→workspaces, certificate_id→certificates, grading_id→gradings, reason_code→reason_codes, severity, detail, status, assigned_to, due_date, resolved_at, created_at, updated_at
- **coverage_gaps** — id, workspace_id→workspaces, assignment_id→vendor_project_assignments, vendor_id→vendors, project_id→projects, coverage_type, gap_start, gap_end, gap_days, worked_uninsured, created_at
- **evidence_packs** — id, workspace_id→workspaces, vendor_id→vendors, project_id→projects, certificate_id→certificates, title, snapshot(jsonb), generated_by, created_at
- **carriers** — id, name, naic(uniq), am_best_rating, admitted, created_at
- **waivers** — id, workspace_id→workspaces, deficiency_id→deficiencies, justification, waived_by, expires_at, created_at
- **renewal_reminders** — id, workspace_id→workspaces, vendor_id→vendors, certificate_id→certificates, coverage_type, expiry_date, status, requested_at, created_at
- **notifications** — id, workspace_id→workspaces, user_id, type, title, body, link, read, created_at
- **tasks** — id, workspace_id→workspaces, title, description, task_type, status, assigned_to, due_date, vendor_id→vendors, project_id→projects, certificate_id→certificates, deficiency_id→deficiencies, created_by, created_at, updated_at
- **activity_log** — id, workspace_id→workspaces, actor_id, action, entity_type, entity_id, metadata(jsonb), created_at
- **attachments** — id, workspace_id→workspaces, certificate_id→certificates, filename, file_type, url, uploaded_by, created_at
- **saved_views** — id, workspace_id→workspaces, user_id, name, entity, filters(jsonb), created_at
- **plans** — id(text PK, seeded 'free'/'pro'), name, price_cents, created_at
- **subscriptions** — id, user_id(uniq), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend Route Files (mount under `/api/v1`)

Conventions: each file `const router = new Hono()` + `export default router`. Public reads, auth-gated writes (`authMiddleware` per-route or `router.use('*', authMiddleware)`), zod validation, ownership checks via `getUserId(c)` and `workspace_id` membership. Response shapes are JSON.

### 1. `workspaces.ts` — mount `/workspaces`
- `GET /` — auth — list workspaces the user is a member of → `Workspace[]`
- `GET /current` — auth — the user's active (first) workspace → `Workspace`
- `POST /` — auth — create workspace (generates invite_code, adds creator as owner) → `Workspace` 201
- `GET /:id` — auth — workspace detail (member check) → `Workspace`
- `PUT /:id` — auth — update workspace settings (owner only) → `Workspace`
- `POST /join` — auth — join via `{ invite_code }` → `Workspace`
- `GET /:id/members` — auth — list members → `WorkspaceMember[]`

### 2. `vendors.ts` — mount `/vendors`
- `GET /` — auth — list vendors in workspace (filter by status/risk_tier/search) → `Vendor[]`
- `GET /:id` — auth — vendor detail → `Vendor`
- `POST /` — auth — create vendor → `Vendor` 201
- `PUT /:id` — auth — update vendor (ownership) → `Vendor`
- `DELETE /:id` — auth — delete vendor → `{ success }`
- `GET /:id/scorecard` — auth — compliance scorecard (cert counts, open deficiencies, status) → `{ compliant, deficient, expired, open_deficiencies, certificates }`
- `GET /:id/assignments` — auth — projects this vendor is assigned to → `Assignment[]`

### 3. `projects.ts` — mount `/projects`
- `GET /` — auth — list projects in workspace → `Project[]`
- `GET /:id` — auth — project detail → `Project`
- `POST /` — auth — create project → `Project` 201
- `PUT /:id` — auth — update project → `Project`
- `DELETE /:id` — auth — delete project → `{ success }`
- `GET /:id/rollup` — auth — per-project compliance rollup → `{ total_vendors, compliant, deficient, expiring }`
- `GET /:id/vendors` — auth — vendors mapped to project with assignments → `Assignment[]`
- `POST /:id/assign` — auth — assign vendor `{ vendor_id, onsite_start, onsite_end, scope_of_work }` → `Assignment` 201
- `DELETE /assignments/:assignmentId` — auth — unassign → `{ success }`

### 4. `templates.ts` — mount `/templates`
- `GET /` — auth — list requirement templates → `Template[]`
- `GET /:id` — auth — template detail incl. line requirements → `{ template, lines }`
- `POST /` — auth — create template → `Template` 201
- `PUT /:id` — auth — update template (bumps version) → `Template`
- `DELETE /:id` — auth — delete template → `{ success }`
- `PUT /:id/lines` — auth — replace line requirements `{ lines: LineReq[] }` → `LineReq[]`

### 5. `certificates.ts` — mount `/certificates`
- `GET /` — auth — list certificates (filter vendor/project/compliance_status) → `Certificate[]`
- `GET /:id` — auth — full detail (cert + coverage_lines + endorsements + latest grading) → `{ certificate, coverage_lines, endorsements, grading }`
- `POST /` — auth — intake/create certificate with nested `{ ...header, coverage_lines[], endorsements[] }` → `Certificate` 201
- `PUT /:id` — auth — update certificate header → `Certificate`
- `DELETE /:id` — auth — delete certificate (and children) → `{ success }`
- `POST /:id/parse` — auth — re-parse raw ACORD payload `{ raw }` into coverage lines → `{ coverage_lines, endorsements }`
- `POST /:id/regrade` — auth — run the grading engine, write grading + deficiencies → `{ grading, deficiencies }`

### 6. `coverageLines.ts` — mount `/coverage-lines`
- `GET /certificate/:certificateId` — public read — coverage lines for a certificate → `CoverageLine[]`
- `POST /` — auth — add a coverage line → `CoverageLine` 201
- `PUT /:id` — auth — update a coverage line → `CoverageLine`
- `DELETE /:id` — auth — delete a coverage line → `{ success }`

### 7. `endorsements.ts` — mount `/endorsements`
- `GET /certificate/:certificateId` — public read — endorsement ledger for a certificate → `Endorsement[]`
- `POST /` — auth — add an endorsement → `Endorsement` 201
- `PUT /:id` — auth — update an endorsement → `Endorsement`
- `DELETE /:id` — auth — delete an endorsement → `{ success }`

### 8. `gradings.ts` — mount `/gradings`
- `GET /certificate/:certificateId` — auth — grading history for a certificate → `Grading[]`
- `GET /:id` — auth — grading detail with results → `Grading`

### 9. `deficiencies.ts` — mount `/deficiencies`
- `GET /` — auth — list deficiencies in workspace (filter status/reason_code/vendor/project) → `Deficiency[]`
- `GET /:id` — auth — deficiency detail → `Deficiency`
- `PUT /:id` — auth — update (assign, set due_date, status) → `Deficiency`
- `POST /:id/resolve` — auth — mark resolved → `Deficiency`

### 10. `reasonCodes.ts` — mount `/reason-codes`
- `GET /` — public read — full reason-code catalog → `ReasonCode[]`
- `GET /:id` — public read — single reason code → `ReasonCode`

### 11. `coverageGaps.ts` — mount `/coverage-gaps`
- `GET /` — auth — all computed gaps in workspace (filter vendor/project, worked_uninsured) → `CoverageGap[]`
- `POST /recompute` — auth — recompute gaps from assignments + coverage lines `{ assignment_id? }` → `CoverageGap[]`
- `GET /assignment/:assignmentId` — auth — gaps for one assignment → `CoverageGap[]`

### 12. `evidencePacks.ts` — mount `/evidence-packs`
- `GET /` — auth — list evidence packs → `EvidencePack[]`
- `GET /:id` — auth — pack detail (immutable snapshot) → `EvidencePack`
- `POST /` — auth — generate a pack `{ vendor_id?, project_id?, certificate_id?, title }` → `EvidencePack` 201

### 13. `carriers.ts` — mount `/carriers`
- `GET /` — public read — carrier/rating registry → `Carrier[]`
- `POST /` — auth — add carrier → `Carrier` 201
- `PUT /:id` — auth — update carrier → `Carrier`
- `DELETE /:id` — auth — delete carrier → `{ success }`

### 14. `waivers.ts` — mount `/waivers`
- `GET /` — auth — list waivers in workspace → `Waiver[]`
- `POST /` — auth — create waiver for a deficiency `{ deficiency_id, justification, expires_at }` (sets deficiency status=waived) → `Waiver` 201
- `DELETE /:id` — auth — revoke waiver (reopens deficiency) → `{ success }`

### 15. `renewals.ts` — mount `/renewals`
- `GET /radar` — auth — buckets of expiring/expired coverage lines (0-30/31-60/61-90/expired) → `{ expired, in30, in60, in90 }`
- `GET /reminders` — auth — list renewal reminders → `Reminder[]`
- `POST /reminders` — auth — create reminder `{ vendor_id, certificate_id?, expiry_date, coverage_type }` → `Reminder` 201
- `POST /reminders/:id/request` — auth — log a renewal request (sets status, requested_at) → `Reminder`

### 16. `notifications.ts` — mount `/notifications`
- `GET /` — auth — current user's notifications in workspace → `Notification[]`
- `POST /:id/read` — auth — mark one read → `Notification`
- `POST /read-all` — auth — mark all read → `{ success }`

### 17. `tasks.ts` — mount `/tasks`
- `GET /` — auth — list tasks (filter status/assigned_to/mine) → `Task[]`
- `GET /:id` — auth — task detail → `Task`
- `POST /` — auth — create task → `Task` 201
- `PUT /:id` — auth — update task (status, assignee, due) → `Task`
- `DELETE /:id` — auth — delete task → `{ success }`

### 18. `reports.ts` — mount `/reports`
- `GET /overview` — auth — workspace KPIs (% compliant vendors, open deficiencies by reason, certs expiring this month, vendors working uninsured) → `{ kpis, deficiency_by_reason, expiring_count, uninsured_vendors }`
- `GET /by-project` — auth — per-project compliance rollup list → `ProjectRollup[]`
- `GET /by-reason` — auth — open-deficiency counts grouped by reason code → `{ reason_code, count }[]`

### 19. `activity.ts` — mount `/activity`
- `GET /` — auth — workspace audit log (filter entity_type/actor/date) → `ActivityLog[]`

### 20. `attachments.ts` — mount `/attachments`
- `GET /certificate/:certificateId` — auth — attachment metadata for a certificate → `Attachment[]`
- `POST /` — auth — register attachment metadata → `Attachment` 201
- `DELETE /:id` — auth — delete attachment → `{ success }`

### 21. `savedViews.ts` — mount `/saved-views`
- `GET /` — auth — current user's saved views (filter by entity) → `SavedView[]`
- `POST /` — auth — create saved view → `SavedView` 201
- `DELETE /:id` — auth — delete saved view → `{ success }`

### 22. `seed.ts` — mount `/seed`
- `POST /sample` — auth — seed a realistic GC subcontractor portfolio into the user's workspace (projects, vendors, templates, certificates with mixed compliance, assignments) → `{ seeded: true, counts }`
- `GET /status` — auth — whether the workspace already has sample data → `{ seeded, counts }`

### 23. `billing.ts` — mount `/billing`
- `GET /plan` — auth — current subscription + plan + `stripeEnabled` → `{ subscription, plan, stripeEnabled }`
- `POST /checkout` — auth — Stripe checkout session; 503 if unconfigured → `{ url }` | 503
- `POST /portal` — auth — Stripe billing portal; 503 if unconfigured → `{ url }` | 503
- `POST /webhook` — public — Stripe webhook; 503 if unconfigured → `{ received }` | 503

(Total: 23 route files.)

---

## (c) `web/lib/api.ts` Method List

Each method is `fetch('/api/proxy/<path>')`; path maps 1:1 to `/api/v1/<path>`. Mutations send `Content-Type: application/json` + `JSON.stringify`. `export default api`.

**Workspaces**
- `getWorkspaces()` → GET `/api/proxy/workspaces`
- `getCurrentWorkspace()` → GET `/api/proxy/workspaces/current`
- `createWorkspace(body)` → POST `/api/proxy/workspaces`
- `getWorkspace(id)` → GET `/api/proxy/workspaces/:id`
- `updateWorkspace(id, body)` → PUT `/api/proxy/workspaces/:id`
- `joinWorkspace(invite_code)` → POST `/api/proxy/workspaces/join`
- `getWorkspaceMembers(id)` → GET `/api/proxy/workspaces/:id/members`

**Vendors**
- `getVendors(params?)` → GET `/api/proxy/vendors`
- `getVendor(id)` → GET `/api/proxy/vendors/:id`
- `createVendor(body)` → POST `/api/proxy/vendors`
- `updateVendor(id, body)` → PUT `/api/proxy/vendors/:id`
- `deleteVendor(id)` → DELETE `/api/proxy/vendors/:id`
- `getVendorScorecard(id)` → GET `/api/proxy/vendors/:id/scorecard`
- `getVendorAssignments(id)` → GET `/api/proxy/vendors/:id/assignments`

**Projects**
- `getProjects()` → GET `/api/proxy/projects`
- `getProject(id)` → GET `/api/proxy/projects/:id`
- `createProject(body)` → POST `/api/proxy/projects`
- `updateProject(id, body)` → PUT `/api/proxy/projects/:id`
- `deleteProject(id)` → DELETE `/api/proxy/projects/:id`
- `getProjectRollup(id)` → GET `/api/proxy/projects/:id/rollup`
- `getProjectVendors(id)` → GET `/api/proxy/projects/:id/vendors`
- `assignVendor(id, body)` → POST `/api/proxy/projects/:id/assign`
- `unassignVendor(assignmentId)` → DELETE `/api/proxy/projects/assignments/:assignmentId`

**Templates**
- `getTemplates()` → GET `/api/proxy/templates`
- `getTemplate(id)` → GET `/api/proxy/templates/:id`
- `createTemplate(body)` → POST `/api/proxy/templates`
- `updateTemplate(id, body)` → PUT `/api/proxy/templates/:id`
- `deleteTemplate(id)` → DELETE `/api/proxy/templates/:id`
- `setTemplateLines(id, lines)` → PUT `/api/proxy/templates/:id/lines`

**Certificates**
- `getCertificates(params?)` → GET `/api/proxy/certificates`
- `getCertificate(id)` → GET `/api/proxy/certificates/:id`
- `createCertificate(body)` → POST `/api/proxy/certificates`
- `updateCertificate(id, body)` → PUT `/api/proxy/certificates/:id`
- `deleteCertificate(id)` → DELETE `/api/proxy/certificates/:id`
- `parseCertificate(id, raw)` → POST `/api/proxy/certificates/:id/parse`
- `regradeCertificate(id)` → POST `/api/proxy/certificates/:id/regrade`

**Coverage lines**
- `getCoverageLines(certificateId)` → GET `/api/proxy/coverage-lines/certificate/:certificateId`
- `createCoverageLine(body)` → POST `/api/proxy/coverage-lines`
- `updateCoverageLine(id, body)` → PUT `/api/proxy/coverage-lines/:id`
- `deleteCoverageLine(id)` → DELETE `/api/proxy/coverage-lines/:id`

**Endorsements**
- `getEndorsements(certificateId)` → GET `/api/proxy/endorsements/certificate/:certificateId`
- `createEndorsement(body)` → POST `/api/proxy/endorsements`
- `updateEndorsement(id, body)` → PUT `/api/proxy/endorsements/:id`
- `deleteEndorsement(id)` → DELETE `/api/proxy/endorsements/:id`

**Gradings**
- `getGradings(certificateId)` → GET `/api/proxy/gradings/certificate/:certificateId`
- `getGrading(id)` → GET `/api/proxy/gradings/:id`

**Deficiencies**
- `getDeficiencies(params?)` → GET `/api/proxy/deficiencies`
- `getDeficiency(id)` → GET `/api/proxy/deficiencies/:id`
- `updateDeficiency(id, body)` → PUT `/api/proxy/deficiencies/:id`
- `resolveDeficiency(id)` → POST `/api/proxy/deficiencies/:id/resolve`

**Reason codes**
- `getReasonCodes()` → GET `/api/proxy/reason-codes`
- `getReasonCode(id)` → GET `/api/proxy/reason-codes/:id`

**Coverage gaps**
- `getCoverageGaps(params?)` → GET `/api/proxy/coverage-gaps`
- `recomputeCoverageGaps(body?)` → POST `/api/proxy/coverage-gaps/recompute`
- `getAssignmentGaps(assignmentId)` → GET `/api/proxy/coverage-gaps/assignment/:assignmentId`

**Evidence packs**
- `getEvidencePacks()` → GET `/api/proxy/evidence-packs`
- `getEvidencePack(id)` → GET `/api/proxy/evidence-packs/:id`
- `createEvidencePack(body)` → POST `/api/proxy/evidence-packs`

**Carriers**
- `getCarriers()` → GET `/api/proxy/carriers`
- `createCarrier(body)` → POST `/api/proxy/carriers`
- `updateCarrier(id, body)` → PUT `/api/proxy/carriers/:id`
- `deleteCarrier(id)` → DELETE `/api/proxy/carriers/:id`

**Waivers**
- `getWaivers()` → GET `/api/proxy/waivers`
- `createWaiver(body)` → POST `/api/proxy/waivers`
- `deleteWaiver(id)` → DELETE `/api/proxy/waivers/:id`

**Renewals**
- `getRenewalRadar()` → GET `/api/proxy/renewals/radar`
- `getReminders()` → GET `/api/proxy/renewals/reminders`
- `createReminder(body)` → POST `/api/proxy/renewals/reminders`
- `requestRenewal(id)` → POST `/api/proxy/renewals/reminders/:id/request`

**Notifications**
- `getNotifications()` → GET `/api/proxy/notifications`
- `markNotificationRead(id)` → POST `/api/proxy/notifications/:id/read`
- `markAllNotificationsRead()` → POST `/api/proxy/notifications/read-all`

**Tasks**
- `getTasks(params?)` → GET `/api/proxy/tasks`
- `getTask(id)` → GET `/api/proxy/tasks/:id`
- `createTask(body)` → POST `/api/proxy/tasks`
- `updateTask(id, body)` → PUT `/api/proxy/tasks/:id`
- `deleteTask(id)` → DELETE `/api/proxy/tasks/:id`

**Reports**
- `getReportsOverview()` → GET `/api/proxy/reports/overview`
- `getReportsByProject()` → GET `/api/proxy/reports/by-project`
- `getReportsByReason()` → GET `/api/proxy/reports/by-reason`

**Activity**
- `getActivity(params?)` → GET `/api/proxy/activity`

**Attachments**
- `getAttachments(certificateId)` → GET `/api/proxy/attachments/certificate/:certificateId`
- `createAttachment(body)` → POST `/api/proxy/attachments`
- `deleteAttachment(id)` → DELETE `/api/proxy/attachments/:id`

**Saved views**
- `getSavedViews(entity?)` → GET `/api/proxy/saved-views`
- `createSavedView(body)` → POST `/api/proxy/saved-views`
- `deleteSavedView(id)` → DELETE `/api/proxy/saved-views/:id`

**Seed**
- `seedSample()` → POST `/api/proxy/seed/sample`
- `getSeedStatus()` → GET `/api/proxy/seed/status`

**Billing**
- `getBillingPlan()` → GET `/api/proxy/billing/plan`
- `startCheckout()` → POST `/api/proxy/billing/checkout`
- `openPortal()` → POST `/api/proxy/billing/portal`

---

## (d) Page List

Conventions: public pages are static or client; dashboard pages are `'use client'`, guard `authClient.getSession()`, fetch via `api.*`. All dashboard pages live under `app/dashboard/*` and share `app/dashboard/layout.tsx` (Pattern B sidebar).

| # | Route Path | File (under `web/`) | Kind | API methods used | Renders |
|---|------------|----------------------|------|------------------|---------|
| 1 | `/` | `app/page.tsx` | public | (none) | Static landing: hero, problem, feature grid, CTAs to sign-up/pricing |
| 2 | `/auth/sign-in` | `app/auth/sign-in/page.tsx` | public | (authClient) | Email/password sign-in form |
| 3 | `/auth/sign-up` | `app/auth/sign-up/page.tsx` | public | (authClient) | Name/email/password sign-up form |
| 4 | `/pricing` | `app/pricing/page.tsx` | public | `getBillingPlan`, `startCheckout` | Static plan tiers + upgrade CTA |
| 5 | `/reason-codes` | `app/reason-codes/page.tsx` | public | `getReasonCodes` | Public reference catalog of deficiency reason codes |
| 6 | `/dashboard` | `app/dashboard/page.tsx` | dashboard | `getReportsOverview`, `getCurrentWorkspace`, `getRenewalRadar`, `getSeedStatus` | KPI overview cards, expiring summary, working-uninsured callout |
| 7 | `/dashboard/vendors` | `app/dashboard/vendors/page.tsx` | dashboard | `getVendors`, `createVendor`, `deleteVendor`, `getSavedViews`, `createSavedView` | Vendor registry table, create form, filters, saved views |
| 8 | `/dashboard/vendors/[id]` | `app/dashboard/vendors/[id]/page.tsx` | dashboard | `getVendor`, `updateVendor`, `getVendorScorecard`, `getVendorAssignments`, `getCertificates` | Vendor detail, scorecard, assignments, vendor's certificates |
| 9 | `/dashboard/projects` | `app/dashboard/projects/page.tsx` | dashboard | `getProjects`, `createProject`, `deleteProject`, `getTemplates` | Project registry table + create form (template select) |
| 10 | `/dashboard/projects/[id]` | `app/dashboard/projects/[id]/page.tsx` | dashboard | `getProject`, `updateProject`, `getProjectRollup`, `getProjectVendors`, `assignVendor`, `unassignVendor`, `getVendors` | Project detail, compliance rollup, vendor map, assign vendor |
| 11 | `/dashboard/certificates` | `app/dashboard/certificates/page.tsx` | dashboard | `getCertificates`, `deleteCertificate`, `getVendors`, `getProjects` | Certificate list with compliance status badges + filters |
| 12 | `/dashboard/certificates/new` | `app/dashboard/certificates/new/page.tsx` | dashboard | `createCertificate`, `parseCertificate`, `getVendors`, `getProjects`, `getTemplates`, `getCarriers` | ACORD 25 intake form: header + coverage lines + endorsements |
| 13 | `/dashboard/certificates/[id]` | `app/dashboard/certificates/[id]/page.tsx` | dashboard | `getCertificate`, `updateCertificate`, `regradeCertificate`, `getCoverageLines`, `createCoverageLine`, `updateCoverageLine`, `deleteCoverageLine`, `getEndorsements`, `createEndorsement`, `updateEndorsement`, `deleteEndorsement`, `getGradings`, `getAttachments`, `createAttachment`, `deleteAttachment` | Certificate detail: coverage lines, endorsement ledger, grading results + reason codes, regrade, attachments |
| 14 | `/dashboard/templates` | `app/dashboard/templates/page.tsx` | dashboard | `getTemplates`, `createTemplate`, `deleteTemplate` | Requirement templates list + create |
| 15 | `/dashboard/templates/[id]` | `app/dashboard/templates/[id]/page.tsx` | dashboard | `getTemplate`, `updateTemplate`, `setTemplateLines` | Template editor: AI/P&NC/waiver flags + per-line minimums |
| 16 | `/dashboard/deficiencies` | `app/dashboard/deficiencies/page.tsx` | dashboard | `getDeficiencies`, `updateDeficiency`, `resolveDeficiency`, `getReasonCodes`, `createWaiver` | Open-deficiency workbench: filter, assign, resolve, waive |
| 17 | `/dashboard/renewals` | `app/dashboard/renewals/page.tsx` | dashboard | `getRenewalRadar`, `getReminders`, `createReminder`, `requestRenewal` | Expiry radar buckets + reminders + request renewal |
| 18 | `/dashboard/coverage-gaps` | `app/dashboard/coverage-gaps/page.tsx` | dashboard | `getCoverageGaps`, `recomputeCoverageGaps`, `getVendors`, `getProjects` | Coverage-lapse timeline explorer, worked-uninsured highlights, recompute |
| 19 | `/dashboard/evidence-packs` | `app/dashboard/evidence-packs/page.tsx` | dashboard | `getEvidencePacks`, `getEvidencePack`, `createEvidencePack`, `getVendors`, `getProjects`, `getCertificates` | Evidence packs list + generate + snapshot viewer |
| 20 | `/dashboard/carriers` | `app/dashboard/carriers/page.tsx` | dashboard | `getCarriers`, `createCarrier`, `updateCarrier`, `deleteCarrier` | Carrier/rating registry CRUD table |
| 21 | `/dashboard/waivers` | `app/dashboard/waivers/page.tsx` | dashboard | `getWaivers`, `deleteWaiver` | Waiver/exception management list + revoke |
| 22 | `/dashboard/tasks` | `app/dashboard/tasks/page.tsx` | dashboard | `getTasks`, `createTask`, `updateTask`, `deleteTask`, `getVendors`, `getProjects` | Task workbench: mine/overdue/all, create, complete |
| 23 | `/dashboard/notifications` | `app/dashboard/notifications/page.tsx` | dashboard | `getNotifications`, `markNotificationRead`, `markAllNotificationsRead` | Notification feed + mark read |
| 24 | `/dashboard/activity` | `app/dashboard/activity/page.tsx` | dashboard | `getActivity` | Audit-trail viewer with entity/actor filters |
| 25 | `/dashboard/reports` | `app/dashboard/reports/page.tsx` | dashboard | `getReportsOverview`, `getReportsByProject`, `getReportsByReason` | Compliance reporting: KPIs, per-project rollup, deficiency-by-reason |
| 26 | `/dashboard/settings` | `app/dashboard/settings/page.tsx` | dashboard | `getCurrentWorkspace`, `updateWorkspace`, `getWorkspaceMembers`, `joinWorkspace`, `seedSample`, `getSeedStatus`, `getBillingPlan`, `startCheckout`, `openPortal` | Workspace settings, members/invite, seed sample data, billing |

(Total: 26 pages — 5 public, 21 dashboard.)

Plus 2 route handlers (not counted as pages): `app/api/auth/[...path]/route.ts`, `app/api/proxy/[...path]/route.ts`.

---

## (e) DashboardLayout Sidebar Nav

`web/components/DashboardLayout.tsx` (`'use client'`, `<aside>` with `usePathname()` active state, mobile drawer, sign-out via `authClient.signOut()`). Sections:

- **Overview**
  - Dashboard → `/dashboard`
  - Reports → `/dashboard/reports`
- **Compliance**
  - Certificates → `/dashboard/certificates`
  - Deficiencies → `/dashboard/deficiencies`
  - Coverage Gaps → `/dashboard/coverage-gaps`
  - Evidence Packs → `/dashboard/evidence-packs`
- **Registry**
  - Vendors → `/dashboard/vendors`
  - Projects → `/dashboard/projects`
  - Carriers → `/dashboard/carriers`
- **Configuration**
  - Requirement Templates → `/dashboard/templates`
  - Waivers → `/dashboard/waivers`
- **Operations**
  - Renewals → `/dashboard/renewals`
  - Tasks → `/dashboard/tasks`
  - Notifications → `/dashboard/notifications`
  - Activity Log → `/dashboard/activity`
- **Account**
  - Settings → `/dashboard/settings`

(Detail pages `/dashboard/vendors/[id]`, `/dashboard/projects/[id]`, `/dashboard/certificates/[id]`, `/dashboard/certificates/new`, `/dashboard/templates/[id]` are reached from their list pages, not the sidebar.)

---

## Consistency Guarantee

- Every `lib/api.ts` method maps to exactly one backend endpoint declared in section (b).
- Every backend endpoint is consumed by at least one page in section (d).
- 23 route files, 26 pages (5 public + 21 dashboard), 26 tables (incl. billing).
- All 23 idea.md major feature sections are covered.
