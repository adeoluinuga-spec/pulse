# The 360 Response Contract

**Status:** applied. `supabase/migrations/20260904_000001_assessment_response_contract.sql`
**Frozen after first submission.** Once a real rater submits, changing any of this means discarding client data. Raise it now or not at all.

This is what a 360 response *is* in Pulse, in plain English. Code against this, not against the old shape.

---

## The instrument

A **cycle** holds **competencies**. Each competency holds about four **items** — behavioural statements a rater actually rates. A cycle also holds a few **standalone open-text items** that belong to the cycle rather than to any one competency; these carry the narrative feedback.

```
cycle
├── competency "Sets Direction"
│   ├── item (scale) "Communicates a clear plan for the year."
│   ├── item (scale) "Explains how our work connects to the strategy."
│   └── …about four
├── competency "Develops People"
│   └── …
└── item (text) "What should this leader start doing?"   ← no competency
```

An item is `scale` or `text`. A scale item must belong to a competency. A text item may stand alone.

## One response per item

Previously there was one rating per **competency**. Now there is one response per **item**: `unique (reviewer_id, item_id)`.

Each response also carries `competency_id` and `item_type`, copied from the item **by a database trigger**. Do not set them yourself — they are maintained for you so per-competency queries stay cheap and cannot drift from the item. `competency_id` is null on a standalone text item, so per-competency queries need `where competency_id is not null`.

## What a rater may record

**On a scale item — exactly one of:**

- a rating of **1 to 5**, with `not_observed = false`; or
- **nothing observed**: `rating = null`, `not_observed = true`.

Never both. Never neither. The database enforces this, and so does `getReviewPayloadErrors` in `src/lib/reviewSubmission.ts`.

"Unable to Observe" exists because forcing a rater to invent a score for behaviour they have never seen contaminates every mean built on it. **A not-observed response leaves the denominator as well as the numerator** — it is not a zero, and it is not a three.

**On a text item:** a comment, and neither a rating nor a not-observed flag.

**Comments are optional everywhere.** They used to be mandatory on every response. Across 568 assessments that produces fatigue and junk text, so the narrative now lives in the standalone text items instead.

## Who is rating whom

Five rater groups. The first two used to be named the wrong way round, so read carefully:

| Group | Means |
|---|---|
| `self` | The participant rating themselves |
| `line_manager` | The participant's **own manager** |
| `colleague` | A peer |
| `direct_report` | Someone who **reports to** the participant |
| `customer` | An external stakeholder — may not be an employee at all |

Before this migration, `direct_report` meant the line manager and `subordinate` meant the direct report. Both old values are gone. Anything still writing `subordinate` will be rejected by a check constraint.

**Self-assessment now flows through the same pipeline** as every other rater — a reviewer row with `reviewer_group = 'self'` and ordinary responses. This is what makes self-versus-others gap analysis possible. `assessment_self_assessments` still exists but is unused; do not write to it. Self carries **weight 0**: it is scored, but never pulls the others-weighted result toward the participant's own view.

`src/lib/raterRelationship.ts` cross-checks a declared `line_manager` or `direct_report` against `employees.line_manager_id` and **warns** — it never blocks. Org charts go stale, and a contradiction is a prompt for a human to look, not grounds to refuse an assignment.

## Drafts

A rater may save a partial assessment and come back to it. Responses stay writable while the reviewer is `not_started` or `in_progress`, and **freeze the moment the reviewer is `submitted`** — enforced by a trigger, so a late edit fails at the database rather than silently landing.

Saving any response advances the reviewer from `not_started` to `in_progress` and stamps `last_saved_at`, automatically. `POST /api/assessments/submissions` takes `mode: "draft" | "submit"`; a draft may be partial, a submit may not.

## Which instrument was used

`assessment_frameworks` carries `framework_version`, which **increments automatically** whenever the framework is edited. Each cycle competency records the `framework_id` and the `framework_version` it was drawn from.

Without this, a second cycle cannot show that the instrument was unchanged, and year-on-year movement is indefensible.

## Scoring rules

The scoring service is `src/lib/assessmentScoring.ts` — **interface only in Stage 1**. Four rules bind anything that computes a score:

1. **Not-observed is excluded, not zeroed.**
2. **Average within a rater group first, then weight across groups.** Four colleagues make one colleague mean. (The existing `assessmentReporting.ts` gets this wrong — it keeps only the last rater in each group. Do not copy it.)
3. **Suppress thin cells.** Fewer than **three** scored responses in a (competency, rater group) cell and it is merged or withheld — reported as `mean: null`, never as a number. A group of one is attributable, and attributable feedback breaks the anonymity raters were promised.
4. **Self is scored but never weighted.**

## What has not changed

Tokens are still one per **(subject, rater, relationship type)**, hashed, single-use, and expiring — the subject is derived from the token server-side, never declared by the rater. That was already right.

**`/review/[token]` still does not exist.** The contract below is correct and enforced, but nothing can write through it yet.
