# Pulse 360 — Reconciliation Report (Phase 1, read-only)

**Date:** 2026-09-05 · **Against:** `main` @ `a3574f7` plus uncommitted working tree · **Live DB:** `yluskblohjdioqmeczsd` (eu-west-1)
**Method:** every claim below is traced from a file:line or a live-database query. No code or migrations were written.

> ### ⚠️ Status update — Phase 2 completed
>
> Four of the defects below are **fixed and verified**: **D1** (PDF fabricated scores), **D2** and **D3** (`prior_cycle_id` missing, and the error-swallow hiding it), and **D10** (schema doc drift). The Phase 1 sweep for message-matched error suppression found exactly one instance and it is gone.
>
> **D4-D9 and D11-D15 remain open.** See `OPERATOR_ROADMAP.md` for the current operator view and the live blocker list.

---

## Verdict

The premise that three agents produced competing schema histories is **not what I found**. There is exactly one coherent migration history — three sequential, additive files, all applied, and the live database matches them column for column. Nobody wrote a rogue migration and nobody edited the frozen schema file to invent a column. What did happen is subtler and worse for a green build: **one branch deferred a schema need and then wrote code against the column anyway, guarded by an error-swallowing check that turns a hard failure into silent nothing** (`assessmentPdfData.ts:70`), and **the PDF renderer was told to build against a mock score object and never stopped** — it still fabricates every number on every individual report, at four call sites, with `scoreSubjectFromDatabase` appearing nowhere in the PDF path. `tsc`, `next build` and 161 tests are all green, and all three are green *because* of the stubs, not in spite of them: the mock satisfies the type, the swallowed error satisfies the runtime, and the tests assert the shape of a plan object rather than the existence of the column it names. The collect → score → suppress → gate chain underneath is genuinely sound and I re-verified it; the failure is concentrated in what gets rendered and handed to a human at the end.

---

## 1. Migration inventory

| # | File | Creates / alters | Feature |
|---|---|---|---|
| 1 | `20260903_000001_assessment_schema.sql` | 10 `assessment_*` tables, RLS on all, 13 indexes, 18 policies, `assessment_cycle_dashboard` view | Original 360 schema |
| 2 | `20260904_000001_assessment_response_contract.sql` | `assessment_items` table; repoints `assessment_responses` (`item_id`, `item_type`, `not_observed`, `updated_at`); rater-group rename; `framework_id`/`framework_version`; `last_saved_at`; 4 functions + 4 triggers | Response contract |
| 3 | `20260904_000002_assessment_report_access_tiers.sql` | `line_manager_report_access_enabled`, `report_status`; `assessment_response_verbatims_pseudonymized` view; drops 2 HR policies, adds 4 tier policies; 2 indexes | Access tiers |

**Findings:**

- **Two migrations touching the same object:** none in conflict. Migration 2 and 3 both `alter` `assessment_cycles` and `assessment_reports`, but add disjoint columns. No overlap.
- **Same column added twice / conflicting types:** none. Every `add column` uses `if not exists` and no column is added by two files.
- **Never applied:** none. All three are applied — verified against `information_schema` (145 live columns) and `pg_policies`.
- **Direct edits to the frozen `08_360_assessments.sql`:** **no phantom columns.** I extracted all 135 column declarations from `08` and diffed against the 145 live columns. Nothing is declared in `08` that does not exist live. The drift runs the other way: `08` is **stale by exactly two columns** it never absorbed from migration 3 — `assessment_cycles.line_manager_report_access_enabled` and `assessment_reports.report_status`.

**One coherent schema history, not several.** The file is documentation and is two columns behind; it is not a competing source of truth.

---

## 2. Code versus schema drift

I swept every `.from("…")` (26 distinct tables/views) and every `.select("…")` (103 distinct column tokens) in `src/` against the live schema.

**Exactly one genuine drift: `assessment_cycles.prior_cycle_id`.** Referenced in 4 files, exists in no migration, no schema file, and not in the live database.

```
src/app/api/assessments/cycles/clone/route.ts:200   .select(… , prior_cycle_id)
src/lib/assessmentComparison.ts:75, :333            writes prior_cycle_id into the new cycle
src/lib/assessmentPdfData.ts:24, :65, :70, :130-131, :142
src/lib/assessmentComparison.test.ts:141            asserts it — and passes
```

`BASELINE_SCHEMA_REQUEST.md` at repo root is the branch's own note that it deferred this and shipped the code regardless.

### The named-gap checklist

| Item | Status |
|---|---|
| `assessment_cycles.prior_cycle_id` | **MISSING** — code references it in 4 files |
| `min_responses_threshold`, `suppression_mode` | **Not columns, and nothing reads them.** Implemented instead as a per-request option with a constant default (`MINIMUM_RESPONSES_PER_GROUP = 3`, `assessmentScoring.ts:25`). Not a defect; not per-cycle configurable either. |
| `reminder_days` | **Absent.** Reminder cadence is a hard-coded weekly cron. |
| `line_manager_can_view` | **Exists under a different name** — `line_manager_report_access_enabled` (migration 3, live). Works. |
| `retention_months` | **Not a column.** Retention lives in `assessment_cycles.client_context` jsonb (`assessmentRetention.ts:21` `parseRetentionConfig`). Works. |
| `invite_status` ∈ issued/sent/delivery_failed/bounced | **Constraint allows `draft,sent,opened,submitted,expired` only.** Code writes only allowed values; `delivery_failed` exists as an in-memory return value (`reviewers/route.ts:37,:70`) and is **never written** — the failure path reverts to `draft` (`:251`, `:393`). No constraint violation. No `bounced` handling at all. |
| `assessment_reviewers.last_saved_at` | **Exists**, live, written by trigger, read by the review page. |
| `assessment_items` + responses pointing at it | **Exists.** `assessment_responses.item_id` NOT NULL with `unique (reviewer_id, item_id)`. |
| `assessment_responses.not_observed`, `item_id` | **Both exist**, live, with the rating/not-observed check constraint. |
| `assessment_reports.state` | **Exists under a different name** — `report_status` (`draft`/`in_review`/`released`). |
| `assessment_reports.pdf_status`, `pdf_storage_path` | **Absent, and nothing reads them.** PDFs are generated on demand, not stored. |
| Theme-analysis table for AI output | **No table.** Generated and edited versions both ride on `assessment_audit_events` metadata (`synthesisRunner.ts:498-512`). Functionally complete — version history and editor id are stored — but it is an event log doing a document store's job, by the author's own note at `:8-14`. |
| Queue-token mechanism | **No dedicated mechanism.** The queue reuses an assignment's `token_hash` (`review/queue/[token]/page.tsx:80`). |
| Pseudonymised view over responses | **Exists** and is used — `assessment_response_verbatims_pseudonymized`, read by the AI runner at `synthesisRunner.ts:441`. |

**Schema objects nothing reads:** `assessment_self_assessments` (superseded by `reviewer_group = 'self'`, retained deliberately); `assessment_cycle_dashboard` view (no reader in `src/`); `assessment_reviewers.invite_channel` values `sms`/`whatsapp`/`portal` (constraint allows them, no sender exists).

---

## 3. Stub and mock sweep

**Zero `TODO` / `FIXME` / `NOT IMPLEMENTED` comments in `src/`** (the 80 raw grep hits are HTML `placeholder=` attributes).

The stubs are not labelled. They are named `Mock`.

### The three the build prompts told agents to stub

**a) PDF renderer — STILL A MOCK. This is the headline defect.**

```
src/lib/assessmentPdfReport.ts:273   export function createMockSubjectScores(subjectId, seed = 1)
src/lib/assessmentPdfData.ts:172     scores: createMockSubjectScores(subject.id, subjectIndex + 1)
src/lib/assessmentPdfData.ts:174     priorScores: createMockSubjectScores(...)
src/lib/assessmentPdfData.ts:187     scores: createMockSubjectScores(...)   ← aggregate
src/lib/assessmentPdfData.ts:199     scores: createMockSubjectScores(...)   ← aggregate
src/app/api/assessments/reports/pdf/route.ts:206        buildMockIndividualReport(...)
src/app/api/assessments/reports/pdf/batch/route.ts:160  buildMockIndividualReport(...)
```

`scoreSubjectFromDatabase` appears **nowhere** in the PDF path. Scores are `3.25 + ((seed + index) % 5) * 0.18` where `seed` is the subject's index in an array. Competency ids are four hard-coded placeholders (`strategic_leadership`, `people_leadership`, `execution`, `customer_focus`) against a real cycle's eight. The "suppressed customer category" in the output is hard-coded, not derived — so the PDF *appears* to honour n<3 while honouring nothing.

**b) Rater queue link — RESOLVES.** `/review/queue/[token]` exists and renders; `/review/[token]` exists. Verified over HTTP in yesterday's rehearsal.

**c) Invitation links — the assessment link RESOLVES; the queue link in the same email 404s.** `reviewers/route.ts:64` builds `new URL("/review/queue", …)` with **no token**. The only route is `/review/queue/[token]`. Every invitation carries a dead "Pulse review queue" link.

**Other mocks:** `src/data/mockData.ts` is still imported by `appraisal/page.tsx:6`, `dashboard/ai-wellbeing/page.tsx:12`, `dashboard/hr/page.tsx:33`. Outside 360 scope, but it is live mock data in a shipping app.

---

## 4. The seams, traced

| Seam | State | Evidence |
|---|---|---|
| **a)** `/review/[token]` → `assessment_responses` | **CONNECTED** | `PATCH` = draft, `POST` = submit (`submissions/route.ts:429-434`). `item_id` and `not_observed` land correctly; trigger fills `competency_id`/`item_type`; freeze trigger blocks post-submit writes. Proven end-to-end in the rehearsal. |
| **b)** responses → scoring | **CONNECTED** | `reports/route.ts:401` calls `scoreSubjectFromDatabase`. No `reviewerScores` / `competencyScores` in the request body anywhere. Reads the table. |
| **c)** scoring → PDF | **BROKEN — mock** | §3a. |
| **d)** responses → AI synthesis | **CONNECTED, correctly** | `synthesisRunner.ts:441` reads `assessment_response_verbatims_pseudonymized`. No `reviewer_name` / `reviewer_email` in the AI path. |
| **e)** reports → access tiers | **CONNECTED, both layers** | App: `reports/route.ts` uses `canReadIndividualReport` / `canReadAggregateReport` / `canReadCompletionTracking` / `canManageReportState`. Policy: 4 tier policies live. Both verified — 14/14 as `authenticated` with real JWT claims. |
| **f)** clone → `prior_cycle_id` → year-on-year | **BROKEN, two ways** | Clone: `clone/route.ts:200` selects a non-existent column and `assessmentComparison.ts:333` inserts it → PostgREST error → 500. PDF: `assessmentPdfData.ts:70` **swallows** the error (`!error.message.includes("prior_cycle_id")`) so comparison silently never runs and no one is told. |
| **g)** launch → Resend | **CONNECTED and correct** | Real call at `reviewers/route.ts:40`. `invite_status` set to `sent` **only** on `response.ok` (`:269`, `:415`); reverts to `draft` on failure (`:251`, `:393`). Never observed delivering to a real inbox. |

---

## 5. The four silent-failure checks

**n<3 suppression — every surface:**

| Surface | Applied? |
|---|---|
| Scoring service | **Yes** — `assessmentScoring.ts`, verified: 24 thin cells all `mean: null` |
| Report payload | **Yes** — suppressed entries null, withheld categories named in `risk_notes` |
| Cohort aggregate | **Yes** — segments under 3 subjects suppressed |
| Export | **Yes, by omission** — `exports/route.ts:150-188` emits no `byGroup` at all, and only released reports. A thin category has no surface to leak through. |
| **Individual PDF** | **NO — theatre.** The suppression shown is a hard-coded literal in the mock (`assessmentPdfReport.ts:277-286`), not computed. |
| AI themes | **Code exists** (`gateThemes`, support counted from cited labels, not model-asserted) — **never executed against a real model response.** |

**Unable to Observe:** correctly excluded from every denominator — `isScored()` requires `!notObserved && rating !== null`; DB check constraint forbids a rating alongside `not_observed`. Verified: three 4s plus one not-observed means 4, not 3.

**Access tiers, what each role actually reaches today:**

| Role | Reaches |
|---|---|
| participant | own report, released only. Nothing else. Verified: sees exactly 1 of 10. |
| line_manager | direct report's report, released only, and only with `line_manager_report_access_enabled` — verified blocked off / allowed on |
| hr_admin | completion tracking + aggregate. **No** individual report, **no** raw verbatim. **But see D4 — the default export scope locks HR out entirely.** |
| executive_view | aggregate only. No individual report, no verbatim. |
| super_admin | everything, every access logged (`report_viewed` / `report_released` / `report_exported`) |

**Anti-quotation:** exists and is wired at three call sites — `synthesisRunner.ts:356` (regenerates on hit, up to 2 retries), `cohort/route.ts:109` (422), `review/route.ts:99` (refuses a consultant edit that pastes rater wording). Word-level, >8 consecutive words, punctuation-insensitive. **Never run against a real model response.**

---

## 6. Build and test state

| | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **BUILD_OK** |
| `node --experimental-strip-types --test src/lib/*.test.ts` | **161 pass, 0 fail** |

`assessmentComparison.test.ts` passes 5/5 including `assert.equal(plan.cycle.prior_cycle_id, "cycle-1")` at line 141 — asserting the shape of an object the database cannot store. This is the clearest illustration in the repo that a green suite is not evidence.

---

## 7. Defect table

| # | Defect | Severity | Evidence | Est. |
|---|---|---|---|---|
| D1 | Individual + aggregate PDF render fabricated scores and four placeholder competencies | **BLOCKS-COHORT** | `assessmentPdfData.ts:172,174,187,199`; `assessmentPdfReport.ts:273` | 2–3 d |
| D2 | `prior_cycle_id` missing → clone cycle returns 500 | **BLOCKS-COHORT** | `clone/route.ts:200`; `assessmentComparison.ts:333` | 0.5 d |
| D3 | Year-on-year comparison silently disabled by a swallowed error | **BLOCKS-COHORT** | `assessmentPdfData.ts:70` | (with D2) |
| D4 | Default export scope `all` requires score access → hr_admin gets 403 for any export | **BLOCKS-PILOT** | `exports/route.ts:105-116` | 0.25 d |
| D5 | Invitation email's queue link has no token → 404 on every invite | **BLOCKS-PILOT** | `reviewers/route.ts:64` | 0.25 d |
| D6 | AI synthesis never exercised against the live API; request shapes unproven | **BLOCKS-PILOT** | no execution evidence | 0.5 d |
| D7 | Email delivery never observed reaching a real inbox | **BLOCKS-PILOT** | `reviewers/route.ts:40` untested | 0.25 d |
| D8 | `send-reminders` has no cycle or org filter — reminds every unsubmitted rater globally | **BLOCKS-PILOT** | `supabase/functions/send-reminders/index.ts:22-27` | 1 d |
| D9 | Reminder cadence is one global weekly cron, not per-cycle | COSMETIC | `06_cron.sql`; live `cron.job` = `weekly-report-reminder` | 1 d |
| D10 | `08_360_assessments.sql` stale by 2 columns vs migration 3 | COSMETIC | diff of 135 declared vs 145 live | 0.25 d |
| D11 | AI syntheses stored on `assessment_audit_events`, no dedicated table | COSMETIC | `synthesisRunner.ts:8-14,498` | 1 d |
| D12 | Queue reuses assignment tokens; opening another assignment rotates its token and kills its emailed link | COSMETIC | `review/queue/[token]/open/[reviewerId]/route.ts` | 1–2 d |
| D13 | With all peer categories suppressed, "overall" silently becomes the line manager's rating alone | COSMETIC | rehearsal: s07 scored 3.06 on one rater | 0.5 d |
| D14 | `mockData.ts` still imported by 3 shipping pages (non-360) | COSMETIC | `appraisal/page.tsx:6`, `ai-wellbeing:12`, `hr:33` | 1 d |
| D15 | `assessmentReportRls.test.ts` asserts migration file text, not behaviour | COSMETIC | passed green while none of it was applied | 0.5 d |

**Blocking the cohort: D1–D3 → ~3 days.**
**Blocking a pilot: D4–D8 → ~2.25 days.**
**Everything: ~10–11 days**, though D9–D15 are genuinely deferrable to a second cycle.

---

## 8. What I recommend for Phase 2, in order

1. **D2 + D3 together** — one additive migration for `prior_cycle_id`, then delete the swallow at `assessmentPdfData.ts:70` so a missing column fails loudly instead of quietly. Cheapest fix, and it unblocks D1's prior-cycle half.
2. **D1** — feed `buildIndividualPdfReport` from `scoreSubjectFromDatabase`. The largest piece, and nothing ships before it.
3. **D5, D4** — two small, high-embarrassment fixes.
4. **D7, D6** — one real email to an inbox you control, one AI synthesis run for one subject. Both need your go-ahead; D6 spends money.
5. **D8** — scope the reminder query before any second cycle exists.

**Additive only.** Nothing in D1–D8 requires dropping or retyping a column that holds data; `prior_cycle_id` is a new nullable FK.

---

**Phase 1 ends here. No code or migrations written. Awaiting your read before Phase 2.**
