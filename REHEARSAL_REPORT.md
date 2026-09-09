# Pulse 360 Pre-Launch Rehearsal Report

**Updated:** 2026-09-09
**Purpose:** a repeatable, evidence-led rehearsal protocol for a tenant's 360 cycle. This replaces the historical report as the practical go/no-go record.

## 1. Current code-level verification

The repository baseline is `main` at `d2348f7`. Before this document update, the automated checks passed:

- `node --experimental-strip-types --test src/lib/*.test.ts`: 171 passing, 1 skipped integration-style clone test when Supabase environment variables are unavailable.
- `npx tsc --noEmit`: passing.
- `npx next build`: passing.

These checks verify source compatibility and pure behaviour. They do not prove the deployed Supabase schema, Resend delivery, Edge Function secrets, scheduled jobs, or actual tenant permissions.

## 2. Rehearsal environment rules

- Use a dedicated non-production tenant or a clearly labelled test cycle. Never use real client raters to prove a feature.
- Use five to ten test employees, with at least one HR admin, super admin, participant, line manager, executive-view user, colleague and external customer email.
- Include a competency set with several scale items, at least one standalone text item, and one category that deliberately has fewer than three submitted raters.
- Record exact cycle ID, subject IDs, reviewer IDs, sent email IDs and screenshots in the evidence column. Do not record tokens in this document.
- Confirm the required migrations and secrets before testing. If a precondition is not met, mark the relevant test blocked rather than passing it by assumption.

## 3. Pre-flight evidence

| Check | Expected evidence | Result |
|---|---|---|
| Migrations applied | Supabase migration history includes the five 360 migrations listed in the study pack | [ ] |
| App environment | Production/test deployment has Supabase keys, app URL, Resend key and verified `FROM_EMAIL` | [ ] |
| Edge Function | `send-notification` secrets set and deployed where notification function is used | [ ] |
| Tenant reply-to | Organisation reply-to email set, or valid HR-admin fallback confirmed | [ ] |
| Scheduler decision | Reminder and purge scheduler owner, URL, secret and cadence documented | [ ] |
| Instrument | At least two competencies and active scale/text items visible after reload | [ ] |
| Participant linking | Internal participants resolve to their employee accounts | [ ] |

## 4. End-to-end rehearsal script

### A. HR setup and launch

| Test | Expected result | Result / evidence |
|---|---|---|
| Create cycle | New cycle is scoped to the test tenant and starts in `setup` | [ ] |
| Build framework | Competencies persist after leaving/reopening the Framework tab | [ ] |
| Add inline statement | Statement appears under the selected competency and remains after refresh | [ ] |
| Add participant | Correct employee is linked; participant receives in-app notification and email attempt | [ ] |
| Bulk reviewer dry run | CSV/XLSX returns all row errors and warnings; imports nothing before confirmation | [ ] |
| Bulk reviewer confirm | Valid assignments import; duplicate/relationship warnings are visible | [ ] |
| Nomination approval | Approved nomination creates reviewer assignment exactly once | [ ] |
| Launch cycle | Cycle becomes `collecting`; tenant launch notification and email attempt are recorded | [ ] |
| Send a reminder | Visible success toast appears; only intended open assignments are targeted | [ ] |

### B. Rater experience

| Test | Expected result | Result / evidence |
|---|---|---|
| Open secure link on 360px phone viewport | No sign-in; only named subject and safe assessment payload shown | [ ] |
| Draft autosave | Complete one answer, wait for save, close tab, reopen same link; saved answer and progress return | [ ] |
| Unable to Observe | Rater can choose it beside the scale; no artificial numeric score is sent | [ ] |
| Text item | Narrative response can be entered and preserved | [ ] |
| Review screen | Unanswered items are identified before final submit | [ ] |
| Submit | Assignment becomes submitted; confirmation is clear; reopened link says already submitted | [ ] |
| Expiry | Expired test token gives an explanatory message and contact route | [ ] |
| Queue | Multi-assignment rater sees all assignments and can open the next incomplete one | [ ] |
| Closed cycle | Attempt after close or `closes_on` returns a clear rejection, without changing responses | [ ] |

### C. Scoring, confidentiality and reports

| Test | Expected result | Result / evidence |
|---|---|---|
| UTO exclusion | Score calculation does not count the UTO response in its denominator | [ ] |
| Small category suppression | A category with fewer than three responses is visibly marked suppressed, never zero-filled | [ ] |
| Self vs others | Where self is present, comparison/gap content is calculated from actual data | [ ] |
| Pseudonymised narrative | Analysis/reporting below super admin exposes category labels only, not rater identity | [ ] |
| Generate report | Report console generates a draft from stored responses, not supplied client values | [ ] |
| Review/release | Draft can move to in review, then released only when the release rule is met | [ ] |
| Participant access | Participant opens only their own released report | [ ] |
| Line manager access | Manager sees direct-report released report only when cycle setting allows it | [ ] |
| HR access | HR can see completion/aggregate, not individual report or named verbatims | [ ] |
| Executive access | Executive sees aggregate only | [ ] |
| Super-admin access | Super admin support access works and creates appropriate audit trail | [ ] |
| Individual PDF | PDF renders true subject/cycle scores, suppression labels and no placeholder competencies | [ ] |
| Aggregate PDF | PDF contains no individual names or ranking table | [ ] |
| Export | CSV/XLSX honours caller tier, excludes raw verbatim identity joins and creates `report_exported` audit event | [ ] |

### D. Repeat-cycle and governance

| Test | Expected result | Result / evidence |
|---|---|---|
| Clone cycle | New cycle copies framework, items and selected population and records `prior_cycle_id` | [ ] |
| Framework provenance | Reports state framework version; incompatible comparison is flagged | [ ] |
| Retention configuration | Per-cycle retention setting is read and updated correctly | [ ] |
| Manual purge | Test cycle purge creates a deletion certificate/audit event and removes the intended cycle records only | [ ] |
| Scheduled purge auth | Unsigned request is rejected; signed test invocation processes only due cycles | [ ] |

## 5. Mandatory failure handling

- Email failure: stop the invitation test. Check deployment `FROM_EMAIL`, verified sender domain, Resend key, `NEXT_PUBLIC_APP_URL`, reply-to resolution and provider logs. Do not mark a database `sent` state as inbox delivery.
- Access failure: stop release. Capture role, employee ID, cycle and report state; test application route logic and RLS separately.
- Suppression failure: stop reporting. Never release a report that displays a small category as a number or empty chart without an explicit suppression label.
- Batch PDF restart failure: record it as expected current limitation. Use individual PDFs or complete a batch in one stable process for the rehearsal; do not promise resumability until durable job storage is delivered.
- Purge failure: do not retry manually against a client cycle until target cycle/organisation scope and certificate behaviour are understood.

## 6. Go/no-go criteria

**Go for controlled client collection** only when every pre-flight item and all A-C tests pass, with one observed delivered email and one real mobile completion. The P1 durable batch/scheduler work may be tracked after that only if the client cycle has an agreed manual operational owner.

**No-go** when any of the following is true: migrations are missing, email cannot be proven, an external rater cannot resume a draft, a suppressed category is exposed, a role sees more than its tier, or an item/competency cannot be persisted and subsequently loaded.

## 7. Evidence ledger

| Date | Tenant/test cycle | Tester | Outcome | Follow-up owner | Link/reference |
|---|---|---|---|---|---|
| 2026-09-09 | Repository-only verification | Codex | Build/type/unit checks passing; deployment rehearsal not yet recorded | Delivery owner | `d2348f7` |
