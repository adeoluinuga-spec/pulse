-- RATER RULES PER CYCLE
--
-- The minimum-raters rule and the pooling behaviour were a constant in the
-- scorer and a per-request option nothing set. That is workable for one large
-- client and wrong for a product: a ten-person organisation cannot produce three
-- colleagues per category, so every non-exempt group came back blank and the
-- report looked broken rather than small.
--
-- Three settings now live on the cycle.
--
--   rater_quota            how many raters auto-assignment aims for per group.
--   suppression_mode       'merge' pools thin groups into a combined "Others"
--                          bucket carrying their summed weight; 'suppress'
--                          hides them, which was the old behaviour. New cycles
--                          default to merge, because a small organisation should
--                          get a real number rather than an empty section.
--   min_responses_per_group the confidentiality floor. Two is the lowest value
--                          allowed: at one, the group IS the person and there is
--                          no anonymity left to promise.
--
-- rater_rules_locked_at is the important one. These settings decide a promise
-- made in the invitation email — that an individual response stays confidential.
-- Changing them after invitations have gone out would retroactively break a
-- promise people relied on when deciding how frankly to write, so the rules are
-- frozen when the first invite is sent.
--
-- Additive only. Existing cycles keep today's behaviour except where a default
-- applies, and no column is dropped or retyped.

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

-- PARTICIPANT LEVELS FROM THE ORGANISATION CHART
--
-- assessment_subjects.level allowed only 'director' and 'assistant_director',
-- which predates the org chart. Selecting participants by their published tier
-- needs those tiers to be storable, or every manager and team lead is filed
-- under a label that is not theirs.
--
-- The constraint is widened, never narrowed: both original values remain valid,
-- so no existing row is affected.

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
