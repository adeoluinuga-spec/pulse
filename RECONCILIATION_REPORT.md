# Pulse 360 Reconciliation Report

**Reconciled:** 2026-09-09
**Repository baseline:** `main` at `d2348f7`
**Method:** source and migration reconciliation. This report does not claim that a particular production project has applied migrations or configured secrets; that requires the rehearsal and deployment checks.

## 1. Why this report was refreshed

The original reconciliation report correctly identified early design and schema issues, but it is no longer a safe description of the product. Since that report, the repository has added the response contract, public review journey, score service, report access migration, prior-cycle migration, email reply-to migration, reporting UI, exports, retention, cycle launch, participant dashboard awareness and the inline competency/statement workflow.

The current conclusion is not "the chain is severed." The collection-to-reporting chain is connected in code. The outstanding risk is operational durability and deployment verification.

## 2. Reconciled capability matrix

| Historic concern | Current state | Reconciliation evidence |
|---|---|---|
| Public invite target 404ed | Resolved | `src/app/review/[token]` and `ReviewFlow.tsx` exist; GET `submissions` resolves a token to a safe instrument payload |
| No draft or resume | Resolved | PATCH submissions persists responses, `in_progress`, `last_saved_at`; flow reloads saved draft |
| No Unable to Observe | Resolved | Response contract has `not_observed`; review UI exposes it and scoring excludes it |
| No item-level instrument | Resolved | `assessment_items`, item route, inline Framework statements and instrument route |
| No score aggregation | Resolved | `assessmentScoringService.ts` reads persisted response data for report and PDF paths |
| n<3 anonymity failure | Resolved in scoring/reporting | Group and cohort suppression is part of score calculation; PDF/report model labels suppressed data rather than zero |
| Raw named verbatims available to HR | Restricted | Report access migration introduces pseudonymised verbatim view; route policy limits named verbatims to super admin |
| Participant could not see own report | Resolved after release | Access policy and application checks use `assessment_subjects.employee_id`; participant report access is released-only |
| HR/executive could see individual reports | Restricted | HR is completion/aggregate tier; executive is aggregate tier; super admin is support tier |
| No report lifecycle | Resolved | `report_status` and route rules implement draft -> in_review -> released; console exposes the workflow |
| PDFs used fabricated score data | Resolved | `assessmentPdfData.ts` calls `scoreSubjectFromDatabase`; current PDF builders receive real scores |
| No export | Resolved | `/api/assessments/exports` produces CSV/XLSX and records `report_exported` |
| No retention mechanism | Partially resolved | Retention API, purge and deletion certificate exist; external scheduler and operator UI still required |
| No baseline/YoY basis | Resolved in model/API/PDF | `prior_cycle_id` migration, clone endpoint and comparison/PDF data path exist |
| 568 assignments had to be typed manually | Resolved | Bulk reviewer CSV/XLSX endpoint and dedicated UI with validation and per-row report |
| Approval did not create assignment | Resolved | Nomination route creates reviewer assignment on approval/substitution |
| No cycle launch notification | Resolved | launch route writes tenant notifications and sends launch email; participant add path notifies participants |

## 3. Current schema and migration position

The 360 schema has a coherent additive migration history in the repository:

| Migration | Purpose |
|---|---|
| `20260903_000001_assessment_schema.sql` | Core assessment cycles, framework, subjects, reviewers, responses, nominations, reports and audit events |
| `20260904_000001_assessment_response_contract.sql` | Item-level response contract, `not_observed`, draft metadata and related database support |
| `20260904_000002_assessment_report_access_tiers.sql` | Report state, participant/manager access, restricted response access, pseudonymised verbatim view and report audit indexes |
| `20260905_000001_assessment_prior_cycle.sql` | `prior_cycle_id` for clone/comparison provenance |
| `20260908_000001_org_reply_to_email.sql` | Per-tenant reply-to email with fallback behaviour |

The frozen `supabase/schema/08_360_assessments.sql` remains documentation, not a mutation target. Future changes must be new timestamped migrations first, then documentation updates.

## 4. Security and tenant isolation reconciliation

### What is in place

- Assessment cycles have organisation ownership and all downstream reads are tied to cycle/subject/reviewer relationships.
- `/api/assessments/*` authenticates the caller before service-role access. Because service-role bypasses RLS, routes use explicit organisation and role checks; RLS policies are intentionally defence in depth.
- The public review endpoint trusts the server-resolved reviewer row, never user-supplied cycle or subject IDs.
- Tokens are SHA-256 hashed, unique while live, time-bound and single-use after submit.
- Participant and line-manager access requires released report state; HR and executive aggregation rules are explicit in `assessmentReportAccess.ts`.
- Export and PDF download paths create audit events including actor, role, IP and user agent.

### What still needs proof or hardening

- The repo cannot prove which migrations exist in the target database. Check them before a launch.
- RLS tests include migration-text coverage; retain and expand them, but add a deployment-level test with real roles and a real database.
- There is no email-provider webhook model for bounce/complaint status. A successful API call is not proof of inbox delivery.
- A cross-tenant regression suite at browser/API level should be added before a second external tenant is onboarded.

## 5. Reporting reconciliation

The report path is now: submitted responses -> `scoreSubjectFromDatabase` -> persisted report summary/release state -> report console/PDF/export. PDFs explicitly load current and prior data through `loadPdfReportData`, then call `buildIndividualReport` or `buildAggregateReport`.

The important remaining caveat is batch execution. `reports/pdf/batch/route.ts` maintains jobs and generated file buffers in a module-level `Map`. It has per-report status during the current process and can retry a listed job in that same process, but it is not recoverable after restart or portable across serverless instances. The feature should therefore be described as an operator-assisted batch generator, not as a durable job system, until database/storage-backed jobs are built.

## 6. Operator-surface reconciliation

| Capability | Current operator surface | Gap |
|---|---|---|
| Cycle lifecycle and launch | Main 360 command centre | Good for cycle one; launch history and scheduling controls are absent |
| Framework and statements | Main Framework tab; secondary instrument route | Needs explicit framework edit/version/archive experience |
| Bulk reviewers | Dedicated `/assessments/reviewers/bulk` route | Good; add eventual-email delivery state later |
| Nominations | Dedicated participant nomination route plus approval API | Validate full tenant journey in rehearsal |
| Reports and export | `/assessments/reports` | Super-admin workflow is explicit; add richer filtering/audit view later |
| PDFs | Dedicated PDF/batch route | Durable jobs/storage absent |
| Retention | API only | Needs HR governance UI and a scheduler runbook |
| Clone and comparison | API/PDF data path | Needs a clear HR clone screen |
| AI synthesis | API/service foundation | Needs consultant review UI and live quality exercise |

## 7. Reconciliation verdict

The current repository reconciles to a credible 360 assessment delivery system for a controlled client cycle. There are no longer known source-level gaps preventing collection, scoring, report generation or tiered release. The next agent should not rebuild those foundations.

Their work should be to prove the deployed chain, then harden durable operations: persistent batch jobs, scheduled jobs, provider webhooks, richer governance/clone UX and end-to-end tenant security testing.
