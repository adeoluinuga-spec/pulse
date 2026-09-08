# Pulse — Where We Are, and What's Left

**Date:** 2026-09-08 · **Against:** `main` @ `24accbc` · **Live tenant:** Stuart Davidson, cycle "369 Assessment"
Every line below is checked against the running code and the production database, not against the earlier reports.

---

## 1. Your live cycle, right now

This is the actual state of "369 Assessment" in production:

| | |
|---|---|
| Status | `collecting` — it was launched successfully |
| Participants | **5**, and **all 5 linked to a login** ✅ |
| Competencies | **0** |
| Items | **0** |
| Raters | **2** total. Three of the five participants have **zero** raters |
| Submitted | **0** |
| Rater invite status | both `draft` — **the invitation emails did not send** |
| Reports generated | **0** |

**The cycle cannot collect anything.** There is no instrument — zero competencies, zero items. If a rater opened their link today they would see an empty form. That is the single thing standing between you and a working cycle, and it is not a code defect: the instrument has to be built at `/assessments/instrument`.

Two other live facts worth knowing:

- **Assessment email is not being delivered.** Resend's log shows only Supabase Auth mail ("Your sign-in link", "Confirm your email address") going out from `noreply@pulse.stuartdavidson.org`. No assessment invitations at all. Both raters sit at `invite_status: 'draft'`, which is exactly what the code writes when Resend rejects a send — it reverts to `draft` rather than lying about delivery. If those two raters were added *before* you set `FROM_EMAIL` and redeployed, this is stale and re-issuing an invite will now work. **Test that first**, because everything downstream depends on it.
- **In-app notifications are working.** `assessment_cycle_launched` ×10 and `assessment_participant` ×1 rows are in the database. That half of the new notification system is live and functioning.

---

## 2. Against the study pack — what moved

| # | Defect (study pack) | Then | Now | Evidence |
|---|---|---|---|---|
| **D1** | Participants can't open their own report | ⛔ | ✅ **FIXED** | `subjects/route.ts` links `employee_id`; all 5 live subjects linked; verified 8/8 against RLS |
| **D2** | Cycle status can never change | ⛔ | 🟡 **PARTIAL** | Launch now moves `setup → collecting`. Still **no manual close** — only the retention purge sets `closed` |
| **D3** | No bulk launch — 568 clicks | ⛔ | ✅ **FIXED** | New `/api/assessments/cycles/[cycleId]/launch` + UI button |
| **D4** | Invitation queue link 404s | ⛔ | ✅ **FIXED** | Built from the assignment's own token at both send sites |
| **D5** | Reminders hit every rater in the database | ⛔ | 🟡 **PARTIAL** | New cycle-scoped `/api/assessments/reminders` + UI. **But the global weekly cron is still active and still unscoped** |
| **D6** | No UI to generate, review, release, synthesise or export | ⛔ | ⛔ **UNCHANGED** | Zero UI callers for reports POST, AI synthesis, exports, retention, clone |
| **D7** | `hr_admin` gets 403 on any export | ⛔ | ✅ **FIXED** | Scope defaults to the caller's tier |
| **D8** | Appraisal journey is mock end to end | ⛔ | ⛔ **UNCHANGED** | `appraisal/page.tsx` and `goals/page.tsx` still import `mockData`; the real API layer still has zero importers |
| **D9** | AI synthesis and email never exercised live | ⛔ | 🟡 **PARTIAL** | Auth email delivers. **Assessment email is failing.** AI synthesis has **never run** — zero audit events |

**Net: three fixed outright, two partial, three unchanged.** Plus a genuinely new capability the study pack didn't anticipate — participant notification, in-app and email.

### New since the study pack

- **Launch a cycle in one action**, which also issues invites and writes notifications.
- **Assessee notification** — in-app row plus email when someone is added to a cycle.
- **Per-tenant Reply-To** — falls back to the org's HR admin, so no per-org setup at signup.
- **A cross-tenant hole closed** — subject creation now verifies the cycle belongs to the caller's org.
- **HTML escaping** on tenant-supplied values in email templates.

---

## 3. The checklist

### Blocking your live cycle — do these first

- [ ] **B1. Build the instrument.** 0 competencies and 0 items means nothing can be collected. Go to `/assessments/instrument`, create competencies, then ~4 scale items under each, plus 2–3 standalone open-text items. *(30–60 min of data entry, no code)*
- [ ] **B2. Prove one assessment email delivers.** Re-issue an invite to an address you control and watch Resend. If it still fails, the deployed `FROM_EMAIL` is missing or differs from `.env.local` — check the hosting env vars, not the local file. *(15 min)*
- [ ] **B3. Assign raters to the three participants who have none.** Adeolu Osinuga, Funmilayo Kareem and Taiwo Ogba have zero. Use `/assessments/reviewers/bulk`. *(15 min)*
- [ ] **B4. Disarm or scope the weekly cron.** `weekly-report-reminder` is `active`, fires Fridays 08:00 UTC, and reminds **every unsubmitted rater in the database** with no cycle or org filter. With a live cycle this will mail your real raters on a schedule nobody chose. Either pause the job or add the filter. *(1 h)*

### Section D — the remaining defects

- [ ] **D2. Let HR close a cycle.** `/api/assessments/cycles` still has only `GET` and `POST`. Add `PATCH` for the status transition, and a control in the console. Submissions already stop at `closes_on`, so this is about state, not enforcement. *(0.5 d)*
- [ ] **D5. Scope the cron reminder.** The new on-demand route is correct; the scheduled one still isn't. Give `send-reminders` a cycle filter, or retire it in favour of a per-cycle schedule. *(1 d)*
- [ ] **D6a. A screen to generate and release reports.** Nothing in the UI POSTs to `/api/assessments/reports`. Today a consultant needs curl. This gates the participant tier — no release, no participant report. **The highest-value remaining item.** *(2 d)*
- [ ] **D6b. A screen for AI synthesis and consultant review.** `/api/ai/assessment-synthesis` and its `review` endpoint have no UI. This is the "AI-generated, consultant-reviewed" promise. *(2 d)*
- [ ] **D6c. An export button.** `/api/assessments/exports` works and has no screen. *(0.5 d)*
- [ ] **D6d. Retention and clone screens.** Both API-only. Lower priority — neither is needed for cycle one. *(1 d)*
- [ ] **D9a. Run AI synthesis once, live.** Zero audit events: it has never been called. Request shapes are typed and unit-tested but never sent. Costs cents. **Do this before you promise it to a client.** *(0.5 d)*
- [ ] **D9b. Confirm the edge function.** `send-notification` now requires `FROM_EMAIL` with no fallback and 500s without it. Set the secret and deploy. Nothing in the 360 flow uses it yet, so no live impact — but don't let it rot. *(0.5 h)*
- [ ] **D8. Wire the appraisal journey.** `src/lib/api/appraisal.ts` is complete and has zero importers; `/appraisal` and `/goals` render fixture people. Real tables, real queries, no connection. *(12–18 d)*

### Hygiene

- [ ] **H1. Rater invitation emails still have no Reply-To.** The assessee email has one; the rater email doesn't — and raters are the ones most likely to reply "this link won't open". Point `reviewers/route.ts` at `sendPulseEmail`. *(0.5 h)*
- [ ] **H2. Rotate the database password.** It has been in plaintext in a chat transcript for several days.
- [ ] **H3. Delete `buildlog.txt`** from the repo root. Stray build output, untracked.
- [ ] **H4. Zenith Corp demo org** is still in production alongside Stuart Davidson. Decide whether it stays.
- [ ] **H5. `assessmentReportRls.test.ts`** asserts migration file *text*, not behaviour. It passed green while none of those policies were applied. Replace or delete.

---

## 4. The honest summary

**The 360 collection spine is real and works.** Create a cycle, build the instrument, add participants and raters, launch, rater completes on a phone with draft and resume, scoring computes with unable-to-observe excluded and n<3 suppressed, access tiers hold in both the route handler and the database, PDFs render real numbers. I have verified every link in that chain against live data.

**What is missing is the back half and the operator surface.** Once feedback is in, generating, reviewing, releasing, synthesising and exporting are all curl-only. A consultant cannot do their job in the product. That is D6, and it is roughly a week.

**And the appraisal product does not exist.** Journey 2 from the operator roadmap is a set of screens showing fictional people from a demo company. The data layer beneath it is written and correct and connected to nothing.

**Right now, though, none of that is what's stopping you.** Your live cycle has no instrument and no working invitation email. Those two, plus raters for three participants, are an afternoon — and they are the difference between a cycle that can collect data and one that cannot.
