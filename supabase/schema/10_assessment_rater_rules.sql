-- ASSESSMENT RATER RULES
--
-- Documentation counterpart of:
--   supabase/migrations/20260909_000004_assessment_rater_rules.sql
--
-- This file records the final schema for cycle-level confidentiality and
-- auto-assignment settings. Apply the timestamped migration to a database;
-- do not run this documentation file after the migration has been applied.

alter table public.assessment_cycles
  add column if not exists min_responses_per_group smallint not null default 3,
  add column if not exists suppression_mode text not null default 'merge',
  add column if not exists rater_quota jsonb not null default '{"colleague": 3, "direct_report": 3}'::jsonb,
  add column if not exists rater_rules_locked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_cycles_min_responses_check'
  ) then
    alter table public.assessment_cycles
      add constraint assessment_cycles_min_responses_check
      check (min_responses_per_group between 2 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assessment_cycles_suppression_mode_check'
  ) then
    alter table public.assessment_cycles
      add constraint assessment_cycles_suppression_mode_check
      check (suppression_mode in ('merge', 'suppress'));
  end if;
end $$;

comment on column public.assessment_cycles.rater_rules_locked_at is
  'Frozen when the first rater invitation is sent. These settings back the confidentiality promise in that email, so they cannot change once somebody has relied on them.';

alter table public.assessment_subjects
  drop constraint if exists assessment_subjects_level_check;

alter table public.assessment_subjects
  add constraint assessment_subjects_level_check
  check (level in (
    'director',
    'assistant_director',
    'senior_manager',
    'manager',
    'team_lead',
    'individual_contributor'
 ));
