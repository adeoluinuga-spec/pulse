> **Superseded.** This document is out of date. For the current state of Pulse, see [PULSE_BIBLE.md](PULSE_BIBLE.md). It is kept for history.

# Pulse — Operator Roadmap

Two journeys, step by step, as they actually run on the platform today. Every step names the exact screen or endpoint, what happens underneath, and whether you can do it in a browser. Written so you can follow it with real data and see for yourself.

**Status legend**

| | Meaning |
|---|---|
| ✅ | Works in the UI. Do it in a browser. |
| ⚙️ | Works, but **API only** — no screen exists. You need curl/Postman and a logged-in session cookie. |
| ⛔ | **Cannot be done today**, by any route. |
| 🎭 | A screen exists but it shows **fake data**. |

---

# JOURNEY 1 — 360 assessment for a brand-new organisation

The client is not on Pulse. They want a 360 and nothing else.

## Phase A — Get the organisation and the HR admin onto the platform

### A1. Super admin creates the organisation ✅
**Who:** you (super admin) · **Where:** `/admin`

Fill in name, slug, currency, cadence, an HR admin email and optionally an executive email.

Underneath: `POST /api/admin/create-org` inserts into `organisations`, creates an `employees` row per invitee with their `platform_role`, and sends each a Supabase magic-link invite redirecting to `/auth/callback?next=onboarding`.

> **Gate:** this screen only works for the address in `SUPER_ADMIN_EMAIL`. Everyone else is refused at `create-org/route.ts:38`.
> **Note:** if any step fails the whole org is deleted and rolled back — you will not get a half-made org.

### A2. HR admin accepts the invite ✅
**Who:** the client's HR lead · **Where:** the emailed link → `/auth/callback` → `/onboarding`

They set a password and land in onboarding.

### A3. Onboarding — three steps ✅
**Where:** `/onboarding`

1. Organisation details — leave policy and appraisal weights
2. Import employees — CSV or one at a time
3. Send invites — `POST /api/admin/send-invites` creates `employees` rows and sends magic links

CSV columns: `name, email, department, team, cadre, peopleResponsibility, lineManagerEmail, band, joinDate`

> **For a 360-only client, do you need this?** Strictly for collecting feedback, no — raters and participants can exist purely as `assessment_subjects` / `assessment_reviewers` rows with names and emails.
> **But see D1 below.** Without employee records *and* a link from participant to employee, **no participant will ever be able to open their own report.** For a 360-only engagement where participants receive reports in-app, you still need step A3.

---

## Phase B — Build the assessment

### B1. Create the cycle ✅
**Who:** HR admin · **Where:** `/assessments` → **Command** tab

Name, client context, start and close dates, rater weights.
Underneath: `POST /api/assessments/cycles`.

> ⛔ **The cycle status can never be changed afterwards.** `/api/assessments/cycles` has only `GET` and `POST` — no `PATCH`. Whatever status it is created with (`setup` by default) is what it keeps forever. See D2.

### B2. Build the instrument ✅
**Who:** HR admin / consultant · **Where:** `/assessments/instrument`

Create the framework, then competencies, then items beneath each competency, plus standalone open-text items.

- Scale items must belong to a competency; text items stand alone.
- Roughly 4 behavioural statements per competency is the shape the reports assume.
- Underneath: `POST /api/assessments/frameworks`, `POST /api/assessments/items`.

### B3. Add participants (the people being assessed) ✅
**Who:** HR admin · **Where:** `/assessments` → **Participants** tab

Two paths: pick from the employee roster, or paste CSV (`name,email,level,function_name,region,portfolio`).

> ⛔ **Neither path links the participant to their employee record.** `POST /api/assessments/subjects` never writes `employee_id` (`subjects/route.ts:111-118`). This is the single most consequential gap in the journey — see **D1**.

### B4. Nominate raters (optional) ✅ with a caveat
**Who:** HR admin, or a manager · **Where:** `/assessments/nominations`

> ⚠️ Participants **cannot** nominate their own raters. `POST /api/assessments/nominations` requires `hr_admin`, `super_admin` or `manager` (`nominations/route.ts`). A participant with the `standard` role is refused. In practice HR types in the nominations people send by email.

### B5. Assign raters ✅
**Who:** HR admin · **Where:** `/assessments/reviewers/bulk` (CSV) or `/assessments` → per-participant

CSV columns: `subject_email, rater_name, rater_email, relationship_type`

Relationship types — **read these carefully, they were renamed:**

| Value | Means |
|---|---|
| `self` | the participant rating themselves |
| `line_manager` | the participant's **own manager** |
| `colleague` | a peer |
| `direct_report` | someone who **reports to** the participant |
| `customer` | an external stakeholder |

The importer validates every row, rejects unknown relationship types, flags duplicates, and returns a per-row error report.

> A helper warns (never blocks) when a declared `line_manager` or `direct_report` contradicts `employees.line_manager_id`.

---

## Phase C — Collect

### C1. Invitations go out ✅ — one rater at a time
**Where:** `/assessments` → per reviewer → issue invite

Each send is a real Resend email with that assignment's own tokenised link. `invite_status` becomes `sent` **only** on a confirmed 200 from Resend; on failure it reverts to `draft`. That part is honest.

> ⛔ **There is no "launch cycle" button.** Invites are issued individually (`page.tsx:1251`). For 568 assignments that is 568 clicks. See **D3**.
> ⚠️ The email contains a second link, "Pulse review queue", built as `/review/queue` with **no token** (`reviewers/route.ts:64`). The only route is `/review/queue/[token]`. **That link 404s in every invitation.** See D4.

### C2. The rater completes the assessment ✅
**Where:** `/review/[token]` — public, no login, mobile-first

Open → rate each item 1–5 or mark **Unable to Observe** → optional comment → answer the open-text items → submit.

- Save a draft with `PATCH /api/assessments/submissions`, resume later — answers come back.
- Submit with `POST`. Once submitted the token is dead: reopening shows a read-only "already submitted", and any further write is refused at the database.
- Expired token → 410. Unknown token → 404. Submitting after `closes_on` → refused.

### C3. The rater's queue ✅
**Where:** `/review/queue/[token]`

Every assignment that email owes, with "3 of 6 complete" at the top.

> ⚠️ Opening a *different* assignment from the queue **rotates that assignment's token**, so its own earlier invitation email stops working. The newest link wins. Not wrong, but tell your raters to use the queue or the email, not both.

### C4. Reminders ⚠️
Runs from a `pg_cron` job → `send-reminders` edge function, targeting unsubmitted reviewers with live tokens.

> ⚠️ **No cycle or organisation filter.** It reminds every unsubmitted rater in the entire database. With one live cycle that is fine. With two, both get chased. See D5.
> ⚠️ Cadence is a single global weekly cron (Fridays 08:00 UTC). For a 14-day window that is two reminders, total, not configurable.

### C5. Close the cycle ⛔
There is no way to close a cycle. Submission is blocked once `closes_on` has passed, so the date does the work — but the cycle `status` cannot be moved to `closed`. See D2.

---

## Phase D — Score, review, release

### D-1. Scores compute ✅ automatically, on read
Scoring runs from `assessment_responses` whenever a report or PDF is requested. It is correct and I have verified it end to end:

- **Unable to Observe reduces n** — excluded from every denominator, never counted as a zero.
- **Averaged within a rater category first**, then weighted across categories.
- **Any non-exempt category with fewer than 3 raters is suppressed** — reported as `null`, never a number. `self` and `line_manager` are exempt, being single-rater by definition.
- Self-versus-others gap, blind spots and hidden strengths are computed.

### D-2. Generate and store the report row ⚙️ API only
`POST /api/assessments/reports` with `{ cycleId, subjectId }`.

Computes from the database and ignores any scores in the body. Refuses (422) a subject too thin to report on: the rule is **a line manager response plus at least two other categories clearing 3 raters**.

> ⛔ **No screen calls this.** The console only *reads* reports (`page.tsx:492`). See D6.

### D-3. AI theme synthesis ⚙️ API only
`POST /api/ai/assessment-synthesis` → per-subject themes, strengths, development areas, divergence. Resumable; run it in batches.
Then `POST /api/ai/assessment-synthesis/cohort` for organisation-level themes.

Identity safety is real: raters reach the model as "Colleague 2", output is scanned for any run of more than 8 words shared with a source comment and regenerated if found, and a theme resting on fewer than 3 comments is dropped.

> ⛔ **No screen.** ⚠️ And this has **never been run against the live Anthropic API** — the logic is tested, the request shapes are not.

### D-4. Consultant reviews and edits ⚙️ API only
`PATCH /api/ai/assessment-synthesis/review` — saves the edited version alongside the generated one and records who edited. A draft **cannot be released until a reviewed version exists**. An edit that pastes a rater's wording back in is refused.

> ⛔ No screen. This is the "AI-generated, consultant-reviewed" promise, and today it can only be honoured through the API.

### D-5. Release the report ⚙️ API only
State machine: `draft → in_review → released`. Only `super_admin` can move it.

> ⛔ No screen. **And this is what gates the participant tier** — nothing is visible to a participant until released.

### D-6. PDFs ✅
**Where:** `/assessments/reports/pdf`

Individual and aggregate PDFs, batched. As of this week these render **real computed scores** with the cycle's real competency names — that was a mock until yesterday and is now fixed and verified.

### D-7. Export ⚙️ API only
`GET /api/assessments/exports?cycleId=…&scope=completion|scores|aggregate&format=csv|xlsx`

Only released reports. No raw verbatims, no rater names, ever.

> ⛔ No screen. ⚠️ **And the default scope is `all`, which requires score access — so an `hr_admin` calling it without `?scope=completion` gets a 403.** See D7.

### D-8. Retention / purge ⚙️ API only
`/api/assessments/retention` — retention window lives in `assessment_cycles.client_context`. No screen.

---

## Who can see what, once released

| Role | Reaches |
|---|---|
| participant | their own report, **released only**, nothing else |
| line_manager | their direct report's report, released only, and only if the per-cycle switch is on |
| hr_admin | completion tracking and the aggregate. **Not** individual reports, **not** verbatims |
| executive_view | the aggregate summary only |
| super_admin | everything, and every view is logged |

I verified all five against the live database. They hold.

---

# JOURNEY 2 — Onboard an organisation and run a performance appraisal

## Phase A — Onboarding ✅
Identical to Journey 1, steps A1–A3. This part works.

Step 1 of onboarding also sets the appraisal weights, which are written to `appraisal_cycles.weights`:
`goal_achievement 35, report_consistency 20, kpi_performance 25, manager_assessment 10, peer_feedback 10`.

## Phase B — Everything after onboarding 🎭

**This is the honest answer: the appraisal journey does not exist as a working product.**

The database tables are all there — `appraisal_cycles`, `appraisals`, `goals`, `goal_tasks`, `kpis`, `reports`, `peer_feedback`.

A complete data layer is also there, `src/lib/api/appraisal.ts`, with `getActiveCycle`, `getMyAppraisal`, `submitSelfAssessment`, `submitManagerAssessment`, `getTeamAppraisals`, `getAppraisalHistory`.

**Nothing imports it.** Zero consumers, anywhere in the app.

And the screens a user would actually touch read from a fixture file:

| Screen | Reality |
|---|---|
| `/appraisal` | 🎭 imports `@/data/mockData` and iterates a hard-coded employee list. No fetch, no Supabase. |
| `/goals` | 🎭 same — goals are generated from the mock employee array. |
| `/dashboard/team`, `/dashboard/reports`, `/dashboard/ai-wellbeing` | 🎭 mock |
| `/dashboard/hr` | mixed — fetches some real data, falls back to mock |

So if you log in as a real HR admin of a real organisation and open `/appraisal`, **you will see fictional people from a demo company**, not your staff. Nothing you do there is written to your organisation's data.

### What a working appraisal cycle would need

1. Open an appraisal cycle for the period ⛔ *(no screen; onboarding writes one row and nothing manages it thereafter)*
2. Employees set goals and KPIs ⛔ *(`/goals` is mock)*
3. Employees submit periodic check-in reports ✅ *(`/reports/submit` is real)*
4. Employee submits a self-assessment ⛔ *(`submitSelfAssessment` exists, unused)*
5. Manager submits their assessment ⛔ *(`submitManagerAssessment` exists, unused)*
6. Peer feedback collected ⛔ *(table exists, no path)*
7. Weighted score computed from the five components ⛔
8. AI recommendation ⚙️ *(`/api/ai/appraisal-recommendation` exists, no screen wired to real data)*
9. Manager agrees or overrides ⛔
10. HR confirms ⛔
11. Employee sees the outcome ⛔

**Realistically: 12–18 developer-days** to connect the existing data layer to real screens. The foundation is there; the wiring is not.

---

# Where we are — the blockers, ranked

| # | Blocker | Impact | Fix |
|---|---|---|---|
| **D1** | `POST /api/assessments/subjects` never sets `employee_id`, so no participant is linked to a user. **A participant can never open their own report**, even after release. | Breaks the headline promise of the 360 | ~0.5 d |
| **D2** | Cycle status cannot be changed — no `PATCH` on `/api/assessments/cycles`. A cycle can never be moved to `collecting` or `closed`. | Cycle lifecycle is date-only | ~0.5 d |
| **D3** | No bulk launch. 568 assignments = 568 individual invite clicks. | Makes the real cohort impractical | ~1 d |
| **D4** | Every invitation email contains a tokenless `/review/queue` link that 404s. | Visible to every rater | ~0.25 d |
| **D5** | Reminders have no cycle/org filter — they chase every unsubmitted rater in the database. | Dangerous with two live cycles | ~1 d |
| **D6** | No screen generates, reviews or releases a report; no screen runs the AI synthesis or the export. The whole back half is curl-only. | Consultant cannot work in the product | ~4–5 d |
| **D7** | Export default scope denies `hr_admin` with a 403. | HR cannot export at all without knowing the query string | ~0.25 d |
| **D8** | Appraisal journey is mock end to end. | Journey 2 does not exist | ~12–18 d |
| **D9** | AI synthesis and email delivery have never been exercised live. | Unknown-unknowns on first real use | ~0.75 d |

## What actually works today, end to end

Collect → score → suppress → gate → PDF. That spine is real and I have verified it against live data: the rater journey on a phone, draft and resume, token reuse and expiry refused, submission after close refused, suppression at n<3 holding in scoring, the report payload, the aggregate, the export and now the PDF, and all five access tiers enforced in both the route handler and the database.

## What to fix before you test with a real cohort

**D1, D2, D4, D7** — about a day and a half together, and they are the ones that will embarrass you in front of a client.
Then **D3 and D6** — roughly a week — to make it operable without a developer at the keyboard.

## Suggested order for your own testing

1. Create an org at `/admin` with your own email as HR admin.
2. Accept the invite, complete `/onboarding`, import 3–4 employees with a real CSV.
3. Create a cycle, build an 8-competency instrument at `/assessments/instrument`.
4. Add 2 participants and 8 raters via `/assessments/reviewers/bulk`.
5. Issue one invite to an address you control. Check the email — note the broken queue link (D4).
6. Complete the assessment on your phone. Save a draft, close the tab, reopen, resume, submit.
7. Try the link again — it should refuse.
8. Generate the PDFs at `/assessments/reports/pdf` and check the competency names are yours.
9. Try to open a report as the participant. **It will not work** — that is D1, and it is the thing to fix first.
