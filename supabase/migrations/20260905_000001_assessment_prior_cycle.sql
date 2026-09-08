-- PRIOR CYCLE POINTER
--
-- Requested in BASELINE_SCHEMA_REQUEST.md and deferred: the comparison branch
-- shipped code against this column without it existing, and the PDF loader hid
-- the resulting error by matching on the message text. Both are corrected now;
-- this is the column they needed.
--
-- Purely additive: a new nullable self-referencing FK. Nothing is dropped or
-- retyped, and no existing row changes.

alter table public.assessment_cycles
  add column if not exists prior_cycle_id uuid
  references public.assessment_cycles(id) on delete set null;

comment on column public.assessment_cycles.prior_cycle_id is
  'The completed cycle this one was cloned from. Year-on-year comparison loads prior scores through it; framework changes are flagged via assessment_competencies.framework_id / framework_version.';

-- Year-on-year lookups walk this pointer per cycle.
create index if not exists assessment_cycles_prior_cycle_id_idx
  on public.assessment_cycles(prior_cycle_id)
  where prior_cycle_id is not null;
