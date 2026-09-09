# Pulse Status and To-Do

**Updated:** 2026-09-09
**Repository baseline:** `main` at `d2348f7`
**Use this document as the working checklist.** Tick an item only after code is merged, the stated checks pass, and any required deployment/configuration action is evidenced.

## 1. Current delivery status

### 360 assessment delivery

- [x] Multi-tenant assessment cycle model and organisation scoping
- [x] Internal participant creation linked to tenant employees
- [x] Participant notification path: in-app plus assessment email
- [x] Cycle launch action and all-employee launch awareness notification
- [x] Cycle lifecycle transitions, including explicit close
- [x] In-product competency framework creation
- [x] Inline item/statement creation beneath a clickable competency card
- [x] Standalone instrument route retained as a secondary management surface
- [x] Public token review route that does not require a Pulse account
- [x] Token hashing, expiry, one-assignment binding and used-link messaging
- [x] Mobile-first competency-by-competency review flow
- [x] Draft autosave/resume and `last_saved_at`
- [x] Unable to Observe storage and scoring exclusion
- [x] Open-text item support and review-before-submit flow
- [x] Rater queue for people assigned more than one review
- [x] Reviewer bulk CSV/XLSX validation, error report and confirm-then-import flow
- [x] Rater-load warning with a default cap of six
- [x] Participant nomination and approval-to-assignment connection
- [x] Server-side score calculation from responses
- [x] n<3 category and segment suppression
- [x] Self-versus-others gaps, blind spots and hidden strengths
- [x] Pseudonymised verbatim read path for analysis
- [x] Role-based report access and released-only participant/manager access
- [x] Report state machine: draft -> in review -> released
- [x] Report access/export audit events
- [x] HR report console for generate, review, release and export
- [x] Individual and aggregate PDF routes using real scores
- [x] CSV/XLSX export without raw verbatim-to-rater identity joins
- [x] Retention configuration, manual purge certificate and scheduled purge endpoint
- [x] Prior-cycle linkage, clone API and PDF movement/provenance support
- [x] Tenant-level reply-to email with HR-admin fallback
- [x] Global seven-second success toast for platform action feedback

### Wider platform

- [x] Employee/manager/executive dashboard routes have a 360-aware status card
- [ ] Appraisal and goals pages consume the real appraisal API rather than fixture data
- [ ] Platform-wide end-to-end tests cover the primary role journeys
- [ ] Production observability, incident runbook and support/admin tooling are complete

## 2. Immediate operator checklist - before inviting real raters

- [ ] Confirm all listed 360 migrations are applied to the target Supabase project.
- [ ] Confirm production Resend key, verified `FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, and Edge Function secrets.
- [ ] Set `organisations.reply_to_email` for the tenant HR mailbox, or verify the HR-admin fallback has a correct email.
- [ ] Create/review the live competency framework and active statements. Do not launch an empty instrument.
- [ ] Add all participants and confirm every internal participant is linked to the correct employee account.
- [ ] Add/approve reviewer assignments and clear bulk-import errors. Review rater-load warnings deliberately.
- [ ] Send one invite to a controlled mailbox and verify receipt, sender, reply-to, token destination, and expiry.
- [ ] Complete one mobile review, close the browser midway, resume, mark one item Unable to Observe, then submit.
- [ ] Confirm the submitted assignment cannot be reopened and the participant dashboard reflects the cycle.
- [ ] Generate a report only after sufficient responses, then review, release and open it as the participant, their line manager, HR and executive view.
- [ ] Download one individual PDF, one aggregate PDF, CSV and XLSX; inspect suppression labels and ensure aggregate output has no named people.
- [ ] Decide whether reminders and retention scheduling are enabled for this tenant; document the intended cadence and the scheduler owner.

## 3. Next engineering phase - priority order

### P0 - Rehearse and evidence the live system

- [ ] Execute the full non-production rehearsal in `REHEARSAL_REPORT.md` and record actual identifiers, timestamps and outcomes.
- [ ] Validate database policies against real roles, not migration-text assertions alone.
- [ ] Verify Resend sends and reply handling in the deployed environment, including a failed-send path.

### P1 - Make long-running operations durable

- [ ] Replace process-memory PDF batch jobs with persisted job rows, durable file storage, retries and resumable worker execution.
- [ ] Add a durable scheduled runner for retention purge with alerting and a signed invocation runbook.
- [ ] Add a per-cycle scheduled reminder engine; keep on-demand reminders as the manual override.
- [ ] Add provider webhooks for delivered, bounced and complained email states, then surface these states to HR.

### P1 - Complete operator UX outside the command centre

- [ ] Build a dedicated Cycle Operations route: lifecycle, launch history, reminder configuration and close controls.
- [ ] Build a Governance route: retention period, purge eligibility, manual certificate history and export audit history.
- [ ] Build a Cycle Clone route: prior-cycle chooser, population changes, comparison compatibility warning and confirmation.
- [ ] Build an AI narrative review route, with explicit reviewer approval and version history if AI synthesis remains in the offering.
- [ ] Add framework list, edit, archive and version history. Avoid creating an opaque stack of snapshots as frameworks evolve.

### P2 - Codebase and product quality

- [ ] Decompose `src/app/assessments/page.tsx` into route-level feature components without changing user behaviour.
- [ ] Add browser-level tests for public review, release gate, tenant isolation and notification/email presentation.
- [ ] Add monitoring for failed assessment sends, failed PDF jobs, failed scheduled purges and cross-tenant access denials.
- [ ] Decide and document the definitive meaning of `direct_report` in every UI label, import template and report category.
- [ ] Replace mock-data appraisal and goals journeys with live API-backed ones.

## 4. Explicit non-goals for the next 360 hardening pass

- Do not redesign the scoring algorithm without a psychometric decision and client sign-off.
- Do not weaken suppression to make small categories visible.
- Do not make RLS the sole access control while routes still use a service-role client.
- Do not add a second instrument workflow to the command centre; improve the existing inline competency workflow or extract it cleanly.
- Do not treat a green TypeScript build as proof that Supabase, Resend, Edge Functions or scheduled jobs are configured in production.

## 5. Definition of ready for a client cohort

The 360 module is ready to open a cohort when all immediate operator items are complete, the rehearsal passes with real tenant identities, email delivery is observed, and the client has approved the instrument and confidentiality rules. It is ready for repeatable enterprise operations after the P1 durable-job and scheduler items are complete.
