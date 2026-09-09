-- Removing people from a running cycle.
--
-- Until now a participant or a rater could be added and never taken away. A
-- wrong email address, a duplicate, or somebody who left the company mid-cycle
-- stayed in the cohort permanently: counted in the headline participant number,
-- shown as blocked on the completion dashboard, dragging readiness down, and
-- present in every export.
--
-- Two different situations, deliberately kept apart:
--
--   Nothing collected yet  -> the row is deleted outright. No column needed;
--                             every reader is correct because the row is gone.
--
--   Feedback already given -> deleting would destroy what real people wrote
--                             about a real person. The participant is withdrawn
--                             instead: excluded from scoring, reports, exports
--                             and completion, with the responses retained.
--
-- Additive only. Nothing is dropped or retyped.

alter table public.assessment_subjects
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_reason text;

comment on column public.assessment_subjects.withdrawn_at is
  'Set when a participant is taken out of a cycle that already holds feedback about them. Withdrawn participants are excluded from scoring, reports, exports and completion; their responses are retained.';

-- Every cohort read filters on this, so it belongs in the index that serves them.
create index if not exists assessment_subjects_cycle_active_idx
  on public.assessment_subjects (cycle_id)
  where withdrawn_at is null;
