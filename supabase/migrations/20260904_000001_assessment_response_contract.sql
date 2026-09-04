-- ═══════════════════════════════════════════════════════════════════════════
-- 360 RESPONSE CONTRACT
-- Applies on top of 20260903_000001_assessment_schema.sql.
--
-- Fixes the response contract before any data is collected:
--   1. assessment_items            — behavioural statements under a competency,
--                                    plus standalone open-text items on the cycle
--   2. responses repointed         — one response per item, not per competency
--   3. unable to observe           — rating nullable + not_observed flag
--   4. comments optional           — (already nullable in SQL; enforced in TS)
--   5. drafts                      — writable while in_progress, frozen on submit
--   6. framework provenance        — framework_id + version snapshot
--   7. rater group semantics       — self / line_manager / colleague /
--                                    direct_report / customer
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. RATER GROUP SEMANTICS  (done first: later sections depend on the vocabulary)
--
-- The old vocabulary meant:
--     direct_report = the subject's LINE MANAGER          (reads backwards)
--     subordinate   = a person who reports TO the subject
--
-- The new vocabulary says what it means:
--     self, line_manager, colleague, direct_report, customer
--     where direct_report = a person who reports TO the subject.
--
-- `direct_report` is REUSED with the opposite meaning, so the two UPDATEs
-- below MUST run in this order — old direct_report rows move out to
-- line_manager first, and only then does subordinate move in. Reversing them
-- would collapse both groups into one.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assessment_reviewers
  drop constraint if exists assessment_reviewers_reviewer_group_check;
alter table public.assessment_nominations
  drop constraint if exists assessment_nominations_reviewer_group_check;

-- Order-critical: line_manager first, then direct_report.
update public.assessment_reviewers set reviewer_group = 'line_manager'  where reviewer_group = 'direct_report';
update public.assessment_reviewers set reviewer_group = 'direct_report' where reviewer_group = 'subordinate';

update public.assessment_nominations set reviewer_group = 'line_manager'  where reviewer_group = 'direct_report';
update public.assessment_nominations set reviewer_group = 'direct_report' where reviewer_group = 'subordinate';

alter table public.assessment_reviewers
  add constraint assessment_reviewers_reviewer_group_check
  check (reviewer_group in ('self', 'line_manager', 'colleague', 'direct_report', 'customer'));

alter table public.assessment_nominations
  add constraint assessment_nominations_reviewer_group_check
  check (reviewer_group in ('self', 'line_manager', 'colleague', 'direct_report', 'customer'));

-- Remap stored reviewer weights. Gated on the presence of 'subordinate', which
-- exists only in the old vocabulary, so this cannot double-apply.
-- Self is weighted 0: self-assessment flows through the responses pipeline for
-- gap analysis, but must not pull the others-weighted score toward itself.
update public.assessment_cycles
set reviewer_weights = jsonb_build_object(
      'self',          coalesce(reviewer_weights -> 'self',          '0'::jsonb),
      'line_manager',  coalesce(reviewer_weights -> 'direct_report', '30'::jsonb),
      'colleague',     coalesce(reviewer_weights -> 'colleague',     '25'::jsonb),
      'direct_report', coalesce(reviewer_weights -> 'subordinate',   '25'::jsonb),
      'customer',      coalesce(reviewer_weights -> 'customer',      '20'::jsonb)
    )
where reviewer_weights ? 'subordinate';

update public.assessment_frameworks
set default_groups = array['self', 'line_manager', 'colleague', 'direct_report', 'customer']
where 'subordinate' = any(default_groups);

alter table public.assessment_cycles
  alter column reviewer_weights
  set default '{"self":0,"line_manager":30,"colleague":25,"direct_report":25,"customer":20}'::jsonb;

alter table public.assessment_frameworks
  alter column default_groups
  set default array['self', 'line_manager', 'colleague', 'direct_report', 'customer'];

-- ───────────────────────────────────────────────────────────────────────────
-- 6. FRAMEWORK PROVENANCE
-- Records which framework, at which version, a cycle's competencies came from.
-- Without this, year-on-year comparison cannot show that the instrument was
-- unchanged between cycles.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assessment_frameworks
  add column if not exists framework_version integer not null default 1;

alter table public.assessment_competencies
  add column if not exists framework_id uuid references public.assessment_frameworks(id) on delete set null,
  add column if not exists framework_version integer;

comment on column public.assessment_competencies.framework_version is
  'Snapshot of assessment_frameworks.framework_version at the time this cycle competency was created. Immutable once set.';

create or replace function public.assessment_frameworks_bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.name                    is distinct from old.name
     or new.levels               is distinct from old.levels
     or new.business_functions   is distinct from old.business_functions
     or new.default_groups       is distinct from old.default_groups
     or new.competencies         is distinct from old.competencies
     or new.self_assessment_enabled is distinct from old.self_assessment_enabled
  then
    new.framework_version := old.framework_version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_frameworks_bump_version_trg on public.assessment_frameworks;
create trigger assessment_frameworks_bump_version_trg
  before update on public.assessment_frameworks
  for each row execute function public.assessment_frameworks_bump_version();

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ITEMS
-- ~4 behavioural statements per competency (item_type = 'scale'), plus a small
-- number of standalone open-text items that hang off the cycle (item_type =
-- 'text', competency_id null).
--
-- The composite FK below guarantees an item's competency belongs to the item's
-- own cycle. It relies on a unique (id, cycle_id) key on assessment_competencies
-- and on MATCH SIMPLE semantics, under which a null competency_id skips the
-- check entirely — which is exactly what standalone text items need.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assessment_competencies
  drop constraint if exists assessment_competencies_id_cycle_key;
alter table public.assessment_competencies
  add constraint assessment_competencies_id_cycle_key unique (id, cycle_id);

create table if not exists public.assessment_items (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  competency_id uuid,
  item_type text not null check (item_type in ('scale', 'text')),
  body text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A scale item must roll up to a competency; a text item may stand alone.
  constraint assessment_items_scale_needs_competency
    check (item_type <> 'scale' or competency_id is not null),
  constraint assessment_items_competency_same_cycle
    foreign key (competency_id, cycle_id)
    references public.assessment_competencies(id, cycle_id)
    on delete cascade
);

alter table public.assessment_items enable row level security;

create index if not exists assessment_items_cycle_id_idx on public.assessment_items(cycle_id);
create index if not exists assessment_items_competency_id_idx on public.assessment_items(competency_id);
create index if not exists assessment_items_active_order_idx
  on public.assessment_items(cycle_id, display_order) where is_active;

drop policy if exists "org members can read assessment items" on public.assessment_items;
create policy "org members can read assessment items"
  on public.assessment_items
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_items.cycle_id
        and e.user_id = auth.uid()
    )
  );

drop policy if exists "hr can manage assessment items" on public.assessment_items;
create policy "hr can manage assessment items"
  on public.assessment_items
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_items.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_items.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2 + 3. RESPONSES REPOINTED, AND UNABLE TO OBSERVE
--
-- item_type is denormalised alongside competency_id because a CHECK constraint
-- cannot join to assessment_items, and the rating/not_observed contract differs
-- between scale and text items. Both columns are maintained by trigger from
-- item_id, so neither can drift.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assessment_responses
  add column if not exists item_id uuid references public.assessment_items(id) on delete cascade,
  add column if not exists item_type text,
  add column if not exists not_observed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: any response written under the old one-rating-per-competency shape
-- gets a synthetic inactive item so no historic row is orphaned. Expected to be
-- a no-op — this migration is intended to land before collection begins.
insert into public.assessment_items (cycle_id, competency_id, item_type, body, display_order, is_active)
select distinct c.cycle_id, c.id, 'scale', 'Legacy migrated item — ' || c.name, 0, false
from public.assessment_competencies c
where exists (select 1 from public.assessment_responses r where r.competency_id = c.id)
  and not exists (
    select 1 from public.assessment_items i
    where i.competency_id = c.id and i.body = 'Legacy migrated item — ' || c.name
  );

-- The items table is created by this migration, so the only rows in it at this
-- point are the legacy ones inserted above; is_active = false identifies them.
update public.assessment_responses r
set item_id = i.id
from public.assessment_items i
where r.item_id is null
  and i.competency_id = r.competency_id
  and i.is_active = false;

update public.assessment_responses set item_type = 'scale' where item_type is null;

-- The old `check (rating >= 1 and rating <= 5)` passed on NULL, so legacy rows
-- may carry no rating at all. Under the new contract a scale row must be either
-- rated or explicitly not observed, so an absent rating becomes not_observed —
-- which is the honest reading of it, and keeps the ADD CONSTRAINT below from
-- failing validation against existing data.
update public.assessment_responses
set not_observed = true
where item_type = 'scale' and rating is null and not_observed = false;

alter table public.assessment_responses alter column item_id set not null;
alter table public.assessment_responses alter column item_type set not null;

-- Text-item responses carry no competency, so this can no longer be NOT NULL.
alter table public.assessment_responses alter column competency_id drop not null;

-- One response per item, replacing one response per competency.
alter table public.assessment_responses
  drop constraint if exists assessment_responses_reviewer_id_competency_id_key;
alter table public.assessment_responses
  drop constraint if exists assessment_responses_reviewer_item_key;
alter table public.assessment_responses
  add constraint assessment_responses_reviewer_item_key unique (reviewer_id, item_id);

-- rating was already nullable; only the 1..5 range check is replaced, by a
-- contract that also covers not_observed and text items.
alter table public.assessment_responses
  drop constraint if exists assessment_responses_rating_check;
alter table public.assessment_responses
  drop constraint if exists assessment_responses_rating_contract;
alter table public.assessment_responses
  add constraint assessment_responses_rating_contract check (
    case item_type
      when 'scale' then
           (not_observed = false and rating is not null and rating >= 1 and rating <= 5)
        or (not_observed = true  and rating is null)
      when 'text' then
        rating is null and not_observed = false
      else false
    end
  );

create index if not exists assessment_responses_item_id_idx on public.assessment_responses(item_id);
create index if not exists assessment_responses_competency_id_idx
  on public.assessment_responses(competency_id) where competency_id is not null;
-- Scoring reads: per subject, scored rows only (not_observed excluded at source).
create index if not exists assessment_responses_scoring_idx
  on public.assessment_responses(subject_id, competency_id) where not_observed = false and rating is not null;

-- Keep competency_id, item_type and cycle_id true to the item at all times.
create or replace function public.assessment_responses_sync_item()
returns trigger
language plpgsql
as $$
declare
  v_competency_id uuid;
  v_item_type text;
  v_cycle_id uuid;
  v_found boolean;
begin
  select i.competency_id, i.item_type, i.cycle_id, true
    into v_competency_id, v_item_type, v_cycle_id, v_found
  from public.assessment_items i
  where i.id = new.item_id;

  if not coalesce(v_found, false) then
    raise exception 'assessment_responses.item_id % does not exist', new.item_id
      using errcode = 'foreign_key_violation';
  end if;

  new.competency_id := v_competency_id;
  new.item_type     := v_item_type;
  new.cycle_id      := v_cycle_id;
  new.updated_at    := now();
  return new;
end;
$$;

drop trigger if exists assessment_responses_sync_item_trg on public.assessment_responses;
create trigger assessment_responses_sync_item_trg
  before insert or update on public.assessment_responses
  for each row execute function public.assessment_responses_sync_item();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. DRAFTS
-- Responses stay writable and rewritable while the reviewer is not_started or
-- in_progress, and freeze the moment the reviewer is marked submitted.
-- The existing submissions route writes responses and only then flips status,
-- so that path is unaffected; a second submission is refused at the database.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.assessment_reviewers
  add column if not exists last_saved_at timestamptz;

create or replace function public.assessment_responses_block_when_submitted()
returns trigger
language plpgsql
as $$
declare
  v_reviewer_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_reviewer_id := old.reviewer_id;
  else
    v_reviewer_id := new.reviewer_id;
  end if;

  select status into v_status
  from public.assessment_reviewers
  where id = v_reviewer_id;

  if v_status = 'submitted' then
    raise exception 'reviewer % has already submitted; responses are frozen', v_reviewer_id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_responses_freeze_trg on public.assessment_responses;
create trigger assessment_responses_freeze_trg
  before insert or update or delete on public.assessment_responses
  for each row execute function public.assessment_responses_block_when_submitted();

-- Saving any response advances not_started -> in_progress and stamps the draft,
-- which is what finally puts the previously unused 'in_progress' status to work.
create or replace function public.assessment_reviewers_touch_draft()
returns trigger
language plpgsql
as $$
begin
  update public.assessment_reviewers
     set last_saved_at = now(),
         status = case when status = 'not_started' then 'in_progress' else status end
   where id = new.reviewer_id
     and status <> 'submitted';
  return null;
end;
$$;

drop trigger if exists assessment_responses_touch_draft_trg on public.assessment_responses;
create trigger assessment_responses_touch_draft_trg
  after insert or update on public.assessment_responses
  for each row execute function public.assessment_reviewers_touch_draft();

commit;
