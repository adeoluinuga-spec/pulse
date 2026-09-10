# Performance appraisal workspace

The /appraisal page now uses authenticated, organisation-scoped data. The previous fixture screen has been replaced with an employee, manager and HR review workflow.

## Activate the database

Run supabase/schema/10_performance_appraisal.sql once in the Supabase SQL Editor, or apply its matching migration with the normal migration runner. Do not apply both. It assumes the core Pulse schema already exists. The SQL Editor copy wraps the migration in a transaction.

Organisation structure has a separate SQL Editor script: supabase/schema/09_organisation_structure.sql. Reporting lines in employees.line_manager_id provide default appraisal reviewers.

Live migration execution was attempted through the linked Supabase CLI but failed with LegacyDbConfigLoginRoleNetworkError / TransportError. Neither successful live activation nor a production tenant rehearsal is claimed here. The appraisal migration was executed successfully against an isolated PostgreSQL database for verification.

Back up the database before production migration. Existing duplicate appraisal rows for the same employee and cycle must be resolved deliberately: the unique index fails rather than deleting them. Existing unmanaged cycles are visible, but the new command workflow requires a newly created managed cycle. Browser access to legacy appraisal/peer tables and the old score calculator is revoked; the new server API owns scoped reads and writes.

## Workflow

1. HR creates a named period, review deadline, reporting cadence and weights.
2. HR enrols existing staff and confirms reviewers, defaulting to current reporting lines. Self-review as the assigned manager is prohibited.
3. HR opens employee reflections. Assigned peers submit feedback on observed work.
4. After the period ends, HR opens manager sign-off. Managers complete five ratings, evidence notes and dated development commitments.
5. Sign-off calculates and freezes evidence on the server. Missing weighted evidence blocks submission.
6. An independent HR administrator reviews the evidence, records a final rating and rationale, and releases the result. HR cannot release their own appraisal or one they authored as reviewer.
7. Employees can acknowledge receipt and record disagreement. Employees and reviewers continue tracking development after release and cycle closure.

Return-to-employee and return-to-manager actions require reasons. Rework preserves the previous snapshot in audit history. Reviewer reassignment clears the former reviewer's unsent assessment.

## Existing parameters and scoring

Default weights preserve the existing database model:

| Component | Weight | Source |
| --- | ---: | --- |
| Goal achievement | 35% | Employee-owned goals linked to the cycle; weighted completion |
| Report consistency | 20% | Submitted work reports covering completed weekly/monthly periods |
| KPI performance | 25% | Existing employee KPIs; weighted target attainment |
| Manager assessment | 10% | Five observable-work ratings, each 1 to 5 |
| Peer feedback | 10% | Mean contribution rating from at least three distinct peers |

HR can choose weights totalling 100 at cycle creation. Zero explicitly excludes a component; weights remain fixed afterward. Small teams should choose an appropriate peer weight before opening a cycle.

Objectives and KPIs can be linked from existing employee records or created in the review workspace. New links use a cycle foreign key. Legacy cycle-name links are accepted only if that name is unique in the organisation. Higher-is-better and lower-is-better KPIs are supported; attainment is capped at 100. Invalid metrics cannot silently disappear from a score.

Missing evidence is not zero and does not silently redistribute final weights. Coverage is shown while a review is incomplete. Duplicate reports count once per reporting period; ongoing periods are excluded, join date adjusts the start, and weekdays fully covered by approved leave are excused. This currently assumes a Monday-Friday workweek, without organisation-specific holiday calendars.

Self-reflection adds context but no extra numeric score. HR's final 1-5 assessment is recorded separately from the weighted evidence score. There is no automatic promotion, compensation or employment recommendation.

## Privacy and accountability

- Authenticated server routes derive organisation and role from the signed-in employee.
- Employees see their own reviews; managers see assigned reviews; HR sees their organisation.
- Unreleased manager notes, calibration and snapshots are hidden from the subject, including HR reviewing their own record.
- Peer aggregates require three distinct contributors. Individual peer ratings and comments are not exposed in review results.
- Approved leave dates adjust reporting expectations; leave type, mood and other personal health information are not scoring inputs.
- Transactions, revision checks, row locks and an audit trail protect workflow changes.
- Released CSV exports respect review scope and escape spreadsheet formula prefixes.
- Released reviews support browser printing/PDF and post-review development tracking.

## Verification

- Full pure test suite: 246 passed, one existing integration skip.
- Nine appraisal scoring/privacy tests cover weights, missing evidence, peer thresholds, KPI direction, report deduplication, leave and unreleased confidentiality.
- scripts/tests/appraisal-db.mjs executes the actual migration against isolated PostgreSQL/PGlite and checks the complete workflow, cross-tenant denial, stale revisions, independent calibration, frozen evidence, rework audit, acknowledgement and browser privileges.
- scripts/tests/appraisal-browser.mjs uses synthetic API fixtures with external traffic blocked. It checks HR cycle setup/evidence, manager draft saving, employee acknowledgement and mobile overflow.
- TypeScript, targeted appraisal lint and production build pass. Broader navigation lint still reports a pre-existing set-state-in-effect error and dependency warnings in WorkSidebar.tsx.
- These tests do not substitute for live Supabase activation and an HR/manager/employee rehearsal.

Run pure tests with:
node --experimental-strip-types --test src/lib/*.test.ts

The DB/browser harnesses use the optional PULSE_TEST_TOOLS directory containing @electric-sql/pglite and playwright; they do not add production dependencies. For the browser harness, start Next on port 3100 with NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS=true locally and set PULSE_TEST_BROWSER to Chrome. Never enable this bypass in production. API authentication remains required even during local UI fixture tests.

## Design basis and boundaries

The design uses a continuing plan, monitor, develop and review cycle rather than a one-off numerical judgement. References: [OPM Performance Management Cycle](https://www.opm.gov/policy-data-oversight/performance-management/performance-management-cycle/), [CIPD Performance Reviews](https://www.cipd.org/en/knowledge/factsheets/appraisals-factsheet/) and [CIPD Performance Feedback Evidence Review](https://www.cipd.org/en/knowledge/evidence-reviews/performance-feedback/).

This is not a claim of standards certification. Existing assessment/360 surveys remain separate from appraisal peer assignments; no incompatible scores are merged. Automated notifications, configurable work calendars, translations and changes to the separate goals-page fixture journey are outside this delivery. Evidence loading is paginated with a 20,000-record guard rather than silently truncating.
