# Pulse 360 Study Pack - Current Capability and Delivery Guide

**Prepared:** 2026-09-09
**Repository baseline:** `main` at `d2348f7` (`Unify 360 competency and statement builder`)
**Purpose:** the authoritative functional study pack for the Pulse 360 module. It replaces the 2026-09-04 pre-build gap audit. It is written for a delivery agent, implementation lead, or client-facing HR consultant.

## 1. Executive position

Pulse is now a real multi-tenant 360-degree assessment product, not a design prototype. A tenant can create a cycle, define a framework and item-level instrument, add internal participants, assign internal or external raters, launch collection, notify staff, collect token-secured mobile responses with draft recovery, score the data with confidentiality suppression, generate and release reports, export permitted data, and support a follow-on cycle against a baseline.

The product is ready for a controlled tenant rehearsal once the tenant has a real instrument, valid rater assignments, deployed email configuration, and the database migrations applied. It is not yet ready to be described as unattended enterprise operations at scale. The durable job, scheduled governance, and a few HR operator screens are the next phase.

### Readiness snapshot

| Area | Current state | Delivery judgement |
|---|---|---|
| Tenant isolation | Every assessment root is scoped by `org_id`; service-role routes re-check organisation ownership; RLS remains a second defence | Strong, but exercise cross-tenant tests before every new deployment |
| Cycle and instrument setup | HR can create and launch cycles, build competencies, and add/remove item-level statements from the Framework tab | Usable for first cycle |
| Collection | Public, phone-first token route; single-use hashed tokens; autosaved drafts; resume; Unable to Observe; final confirmation | Ready for controlled rehearsal |
| Rater operations | Internal/external reviewer assignment, relationship checks, bulk CSV/XLSX validation, per-rater load warnings, queue | Ready, with email delivery rehearsal required |
| Analysis | Scores come from submitted response data; UTO excluded; category and segment suppression; self-versus-others gaps; verbatim pseudonymisation | Strong core logic |
| Reports | Generate, review, release, individual and aggregate PDFs, CSV/XLSX export | Functional; durable batch persistence remains open |
| Governance | Role tiers, release gate, audit events, export logging, retention configuration/purge endpoint, clone/provenance | APIs are present; automation and admin UX remain incomplete |
| Wider Pulse platform | Dashboard work is partially live, but appraisal/goals still show fixture data in places | Separate product-readiness concern |

## 2. What a tenant can do today

### Configure an assessment

1. HR creates a cycle at `/assessments`, choosing dates, levels, weights and the tenant context.
2. HR adds participants from existing tenant employees or through the participant import path. Subject creation links the assessment subject to the tenant employee where possible, which supports participant dashboards and report entitlement.
3. HR uses the Framework tab to add competencies. These are persisted through `/api/assessments/frameworks`; they survive navigation and reload.
4. Each competency card is expandable. HR adds scale statements directly within that competency. The statements persist through `/api/assessments/items`; their displayed contribution is distributed within the competency's weight. Standalone text items are also supported by the underlying item contract.
5. The older `/assessments/instrument` page remains available as a secondary instrument-management route. The normal workflow is now the inline Framework experience, so the main page no longer sends HR to a disconnected "Build rating statements" step.

### Select raters and launch

- The reviewer workflow supports `self`, `line_manager`, `direct_report`, `colleague`, and `customer` relationships.
- For known employees, the UI can use organisation data and relationship validation. Customers remain free-form because they may not have a tenant account.
- `/assessments/reviewers/bulk` accepts CSV or XLSX. It validates every row before import, identifies missing subjects, invalid groups, duplicate assignments and relationship contradictions, produces a row-level error report, and warns when a rater exceeds the configurable default load cap of six.
- Participants can nominate raters through `/assessments/nominations`; approval creates the corresponding reviewer assignment rather than requiring HR to type it again. Rejection can carry a substitution.
- Launching `/api/assessments/cycles/[cycleId]/launch` moves a setup cycle to `collecting`, inserts in-app notifications for the tenant's employees and sends a launch email to each employee with an email address. A participant added to a live cycle also receives the participant notification path.
- Rater invitations are individual, expiring, SHA-256-hashed tokens. The invitation uses the tenant reply-to address when one is configured, otherwise the tenant HR admin address.

### Collect reviews safely

The rater opens `/review/[token]` without signing in. This route is deliberately public and is not gated by `src/proxy.ts`.

- The GET contract derives the cycle and subject from the reviewer token. It exposes the subject display name only, the rater relationship, the active instrument, saved draft and expiry. It never exposes subject email, staff ID, or other raters.
- The review flow shows one competency at a time and is designed for a narrow mobile viewport first.
- Every scale item has both a 1-5 score and a first-class Unable to Observe control. UTO is stored as `not_observed`, has no numeric rating, and is excluded by scoring.
- Item comments are optional. Open-text items are handled as narrative questions.
- PATCH saves drafts, advances the assignment to `in_progress`, records `last_saved_at`, and allows the same token to resume. POST submits the complete review, records an audit event, and closes the assignment.
- Expired, invalid and already-submitted links return a human explanation and `/review/contact`, rather than a 404 or stack trace.
- Submission rejects a closed cycle or a cycle past `closes_on`, even where the token itself has not yet expired.
- `/review/queue/[token]` groups assignments for the same rater and provides a next-up route, avoiding a pile of unrelated links for multi-subject raters.

### Score, review and release

- `src/lib/assessmentScoring.ts` and `assessmentScoringService.ts` compute subject and cohort outputs from persisted responses, not client-supplied numbers.
- Scores are aggregated by competency, item and reviewer category. UTO is excluded. Categories below the default threshold of three are suppressed rather than rendered as zero.
- Self-versus-others gaps, blind spots and hidden strengths are calculated from the same scoring service.
- Narrative analysis reads the pseudonymised verbatim view. Lower tiers cannot join a comment back to reviewer name or email.
- `/assessments/reports` gives the report operator a console to generate a report, move it from `draft` to `in_review`, and release it. Release is blocked until the data-quality rule is met.
- Individual report access is released-only for the participant or an enabled line manager. HR sees completion and aggregate outputs, executive view sees aggregate outputs, and super admin has support access. The route layer enforces this despite service-role reads, and the migration adds matching RLS policies.
- Individual and aggregate PDF output uses `@react-pdf/renderer` on the Node.js runtime. PDF data is loaded through the real scoring service; there are no fabricated score values in the current PDF path.
- CSV/XLSX exports are permission-gated, include completion, score and aggregate datasets according to the caller tier, exclude raw verbatims and named raters, and create `report_exported` audit events.

### Run future cycles and governance operations

- `/api/assessments/cycles/clone` copies the cycle configuration, competencies, items and participant population. It records `prior_cycle_id` and allows the population to be carried forward or replaced.
- Reports carry framework provenance. Comparison is flagged when framework versions differ; a suppressed category in either cycle does not produce a delta.
- Retention is held per cycle in `client_context`, defaulting to 365 days. `/api/assessments/retention` can read/update that configuration and manually purge a cycle, producing a certificate stored in an audit event. A scheduled mode exists and requires `CRON_SECRET`.

## 3. Architecture map for the next agent

| Concern | Primary ownership | Important files |
|---|---|---|
| HR 360 command centre | Assessment setup, participant/reviewer workflows, framework cards | `src/app/assessments/page.tsx` |
| Public rater experience | Token resolution, drafting, submit/reopen states | `src/app/review/[token]/page.tsx`, `ReviewFlow.tsx`, `src/app/api/assessments/submissions/route.ts` |
| Rater queue | Multi-assignment landing and secure token hand-off | `src/app/review/queue/[token]/page.tsx` |
| Instrument persistence | Framework and item CRUD | `src/app/api/assessments/frameworks/route.ts`, `items/route.ts` |
| Scoring | All score, suppression and comparison rules | `src/lib/assessmentScoring.ts`, `assessmentScoringService.ts`, `assessmentComparison.ts` |
| Reports | Access, state machine, report generation and operator UI | `src/app/api/assessments/reports/route.ts`, `src/app/assessments/reports/ReportConsole.tsx` |
| PDFs | PDF data adapter and documents | `src/lib/assessmentPdfData.ts`, `assessmentPdfDocument.ts`, `src/app/api/assessments/reports/pdf/**` |
| Notifications/email | In-app rows, Resend messages, reply-to resolution | `src/lib/notifications.ts`, `src/lib/pulseEmail.ts`, launch/reviewer routes |
| Security/retention | Tier rules and governance endpoints | `assessmentReportAccess.ts`, `retention/route.ts`, migrations dated `20260904` onward |

## 4. Important operational prerequisites

Before a real tenant collection window opens, an operator must confirm all of the following:

- The assessment migrations have been applied to the target Supabase project, including `20260904_000001_assessment_response_contract.sql`, `20260904_000002_assessment_report_access_tiers.sql`, `20260905_000001_assessment_prior_cycle.sql`, and `20260908_000001_org_reply_to_email.sql`.
- The deployed Next.js environment has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, Resend credentials, and a verified `FROM_EMAIL` address. Do not rely on `.env.local` as evidence of production configuration.
- The `send-notification` Edge Function has the matching secrets configured and is deployed when it is being used by the notification flow.
- Each tenant either has `organisations.reply_to_email` set to its HR mailbox or at least one valid `hr_admin` employee email for the fallback.
- A real framework and active items exist before launch. A cycle with no items technically launches but has nothing useful to collect.
- One email invitation is rehearsed to an address the project team can inspect in Resend, and one mobile rater completes, resumes, and submits a real test review.
- The scheduled retention route and reminder infrastructure are intentionally configured or intentionally disabled. An endpoint existing in the repository does not mean a host scheduler is calling it.

## 5. Known limitations and risk register

These are current gaps, not historical pre-build findings.

| Priority | Gap | Consequence | Recommended next action |
|---|---|---|---|
| P0 | No automated live-environment rehearsal is committed in the repo | Green TypeScript and unit tests cannot prove production secrets, email delivery, RLS application or Edge Function deployment | Run the rehearsal in `REHEARSAL_REPORT.md` against a non-production tenant before inviting a client cohort |
| P1 | PDF batch jobs are stored in a process-local `Map` | A server restart, serverless instance change, or long-running batch can lose job state and generated buffers; this is not durable/resumable enterprise batch processing | Move batch metadata to Postgres and files to Supabase Storage, then use a durable worker/queue |
| P1 | Framework save currently creates a new framework snapshot on competency add | It works, but can leave multiple framework versions in the tenant library and needs a clearer edit/version lifecycle | Add explicit framework update/versioning semantics and an operator list/archive view |
| P1 | Retention has an API but no committed scheduler wiring or management UI | Compliance behaviour depends on external scheduler configuration and manual API use | Add an authenticated scheduler configuration/runbook and a small HR governance screen |
| P1 | Clone, retention and AI synthesis are largely API-first | The capabilities exist but are not all discoverable in normal HR navigation | Add dedicated surfaces outside the monolithic assessment page |
| P1 | The main assessment page remains very large | It is harder to test and increases merge conflict risk for parallel agents | Extract setup, framework, reviewer and command tabs into route-level components; preserve current behaviour first |
| P2 | Reviewer invitation delivery state is based on send attempt/result, not provider webhooks | Bounces and downstream delivery events are not represented | Add Resend webhook handling and a delivery-status model before high-volume rollout |
| P2 | Reminder policy is not tenant-configurable in the HR UI | HR can send on-demand reminders, but full cadence control is not yet productised | Add per-cycle cadence, audience and escalation controls |
| P2 | Wider appraisal/goals pages still contain fixture-data journeys | It lowers total-product launch readiness but does not invalidate the 360 collection spine | Treat appraisal integration as a separate delivery stream |

## 6. Recommended next phase

### Phase A - Controlled tenant rehearsal (first)

Run one end-to-end rehearsal with a test cycle and five to ten employees. Validate emails, notifications, permissions for all report roles, draft/resume on a mobile device, scoring and suppression, release, PDF download and exported files. Record actual results in the rehearsal report. This is a delivery activity, not a code rewrite.

### Phase B - Operational hardening

Build durable PDF batching, a real scheduler for reminders and retention, Resend delivery/bounce webhooks, and an HR-facing governance area for retention, clone and reminder settings. This turns a good controlled-cycle product into a repeatable service operation.

### Phase C - Product architecture and enterprise scale

Split `src/app/assessments/page.tsx` into maintainable surfaces, add framework version history, role-aware reviewer selection refinements, richer completion-chasing tools, and deployable end-to-end tests. Then address the unrelated appraisal/goals fixture-data journey so the full Pulse platform meets the same standard as 360.

## 7. Handover rules

- Do not edit `supabase/schema/08_360_assessments.sql` in place. Add a timestamped migration and update the schema copy only as documentation.
- Assessment API routes authenticate with an anon client and operate with a service-role client. Every access restriction must exist in route code and RLS policy.
- Add pure-function tests under `src/lib/*.test.ts` and run `node --experimental-strip-types --test src/lib/*.test.ts`.
- Finish code work with `npx tsc --noEmit` and `npx next build`.
- Do not add new 360 features to the large assessment page. Prefer a new route/component unless repairing existing behaviour there.
