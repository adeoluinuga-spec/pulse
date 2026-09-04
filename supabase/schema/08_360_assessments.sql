-- 360 assessment schema for multi-rater leadership assessments.
--
-- DOCUMENTATION ONLY. This file records the current shape of the schema; it is
-- not the thing that gets applied. Schema changes go in a new timestamped file
-- under supabase/migrations/ and are reflected here afterwards.
--
-- Reflects, as applied:
--   20260903_000001_assessment_schema.sql
--   20260904_000001_assessment_response_contract.sql

create table if not exists public.assessment_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  client_context text,
  assessment_type text not null default '360',
  status text not null default 'setup' check (status in ('setup', 'collecting', 'calibration', 'closed')),
  levels text[] not null default array['director', 'assistant_director'],
  starts_on date,
  closes_on date,
  reviewer_weights jsonb not null default '{"self":0,"line_manager":30,"colleague":25,"direct_report":25,"customer":20}'::jsonb,
  competency_model jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_frameworks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  levels text[] not null default array['director', 'assistant_director'],
  business_functions text[] not null default array['all'],
  default_groups text[] not null default array['self', 'line_manager', 'colleague', 'direct_report', 'customer'],
  competencies jsonb not null default '[]'::jsonb,
  self_assessment_enabled boolean not null default false,
  framework_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_competencies (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  framework_id uuid references public.assessment_frameworks(id) on delete set null,
  framework_version integer,
  name text not null,
  description text,
  weight numeric(5,2) not null default 0,
  sort_order integer not null default 0,
  telco_signals text[] not null default '{}',
  created_at timestamptz not null default now(),
  -- Referenced by the composite FK on assessment_items, which pins an item's
  -- competency to the item's own cycle.
  constraint assessment_competencies_id_cycle_key unique (id, cycle_id)
);

-- ~4 behavioural statements per competency (item_type = 'scale'), plus a small
-- number of standalone open-text items on the cycle (item_type = 'text',
-- competency_id null).
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
  constraint assessment_items_scale_needs_competency
    check (item_type <> 'scale' or competency_id is not null),
  constraint assessment_items_competency_same_cycle
    foreign key (competency_id, cycle_id)
    references public.assessment_competencies(id, cycle_id)
    on delete cascade
);

create table if not exists public.assessment_subjects (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  name text not null,
  email text,
  level text not null check (level in ('director', 'assistant_director')),
  function_name text,
  region text,
  portfolio text,
  created_at timestamptz not null default now(),
  unique (cycle_id, email)
);

create table if not exists public.assessment_reviewers (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  reviewer_employee_id uuid references public.employees(id) on delete set null,
  reviewer_name text not null,
  reviewer_email text not null,
  -- direct_report = a person who reports TO the subject.
  -- line_manager  = the subject's own manager. (These two were named the wrong
  -- way round before 20260904_000001.)
  reviewer_group text not null check (reviewer_group in ('self', 'line_manager', 'colleague', 'direct_report', 'customer')),
  organisation text,
  token_hash text,
  token_expires_at timestamptz,
  invite_status text not null default 'draft' check (invite_status in ('draft', 'sent', 'opened', 'submitted', 'expired')),
  invite_channel text not null default 'email' check (invite_channel in ('email', 'sms', 'whatsapp', 'portal')),
  assessment_scope text not null default 'individual' check (assessment_scope in ('individual', 'team', 'functional', 'customer_experience')),
  opened_at timestamptz,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted')),
  submitted_at timestamptz,
  last_saved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subject_id, reviewer_email, reviewer_group)
);

-- One row per (reviewer, item). competency_id and item_type are denormalised
-- from the item by trigger — item_type because the CHECK below cannot join to
-- assessment_items, competency_id so per-competency rollups stay cheap.
create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  reviewer_id uuid not null references public.assessment_reviewers(id) on delete cascade,
  item_id uuid not null references public.assessment_items(id) on delete cascade,
  competency_id uuid references public.assessment_competencies(id) on delete cascade,
  item_type text not null,
  rating numeric(3,1),
  not_observed boolean not null default false,
  comment text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_responses_reviewer_item_key unique (reviewer_id, item_id),
  -- A scale item is either rated 1..5, or explicitly not observed — never both,
  -- never neither. A text item carries neither.
  constraint assessment_responses_rating_contract check (
    case item_type
      when 'scale' then
           (not_observed = false and rating is not null and rating >= 1 and rating <= 5)
        or (not_observed = true  and rating is null)
      when 'text' then
        rating is null and not_observed = false
      else false
    end
  )
);

create table if not exists public.assessment_self_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  assignee_id uuid references public.employees(id) on delete set null,
  responses jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cycle_id, subject_id)
);

create table if not exists public.assessment_nominations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  assignee_id uuid references public.employees(id) on delete set null,
  reviewer_employee_id uuid references public.employees(id) on delete set null,
  reviewer_name text not null,
  reviewer_email text not null,
  reviewer_group text not null check (reviewer_group in ('self', 'line_manager', 'colleague', 'direct_report', 'customer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, subject_id, reviewer_email, reviewer_group)
);

create table if not exists public.assessment_reports (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  weighted_score numeric(5,2),
  group_scores jsonb not null default '{}'::jsonb,
  competency_scores jsonb not null default '[]'::jsonb,
  strengths text[] not null default '{}',
  development_areas text[] not null default '{}',
  risk_notes text[] not null default '{}',
  released_at timestamptz,
  generated_at timestamptz not null default now(),
  unique (cycle_id, subject_id)
);

create table if not exists public.assessment_audit_events (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid references public.assessment_subjects(id) on delete set null,
  reviewer_id uuid references public.assessment_reviewers(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- assessment_self_assessments predates 20260904_000001. Self-assessment now
-- flows through assessment_reviewers/assessment_responses with
-- reviewer_group = 'self'; the table is retained but unused.

alter table public.assessment_cycles enable row level security;
alter table public.assessment_frameworks enable row level security;
alter table public.assessment_competencies enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_subjects enable row level security;
alter table public.assessment_reviewers enable row level security;
alter table public.assessment_self_assessments enable row level security;
alter table public.assessment_nominations enable row level security;
alter table public.assessment_responses enable row level security;
alter table public.assessment_reports enable row level security;
alter table public.assessment_audit_events enable row level security;

create index if not exists assessment_cycles_org_id_idx on public.assessment_cycles(org_id);
create index if not exists assessment_frameworks_org_id_idx on public.assessment_frameworks(org_id);
create index if not exists assessment_subjects_cycle_id_idx on public.assessment_subjects(cycle_id);
create index if not exists assessment_reviewers_cycle_id_idx on public.assessment_reviewers(cycle_id);
create index if not exists assessment_reviewers_subject_id_idx on public.assessment_reviewers(subject_id);
create index if not exists assessment_self_assessments_cycle_id_idx on public.assessment_self_assessments(cycle_id);
create index if not exists assessment_self_assessments_subject_id_idx on public.assessment_self_assessments(subject_id);
create index if not exists assessment_nominations_cycle_id_idx on public.assessment_nominations(cycle_id);
create index if not exists assessment_nominations_subject_id_idx on public.assessment_nominations(subject_id);
create unique index if not exists assessment_reviewers_token_hash_idx on public.assessment_reviewers(token_hash) where token_hash is not null;
create index if not exists assessment_items_cycle_id_idx on public.assessment_items(cycle_id);
create index if not exists assessment_items_competency_id_idx on public.assessment_items(competency_id);
create index if not exists assessment_items_active_order_idx
  on public.assessment_items(cycle_id, display_order) where is_active;
create index if not exists assessment_responses_reviewer_id_idx on public.assessment_responses(reviewer_id);
create index if not exists assessment_responses_item_id_idx on public.assessment_responses(item_id);
create index if not exists assessment_responses_competency_id_idx
  on public.assessment_responses(competency_id) where competency_id is not null;
create index if not exists assessment_responses_scoring_idx
  on public.assessment_responses(subject_id, competency_id) where not_observed = false and rating is not null;
create index if not exists assessment_reports_cycle_id_idx on public.assessment_reports(cycle_id);
create index if not exists assessment_audit_events_cycle_id_idx on public.assessment_audit_events(cycle_id);

create policy "org members can read assessment cycles"
  on public.assessment_cycles
  for select
  using (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_cycles.org_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage assessment cycles"
  on public.assessment_cycles
  for all
  using (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_cycles.org_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_cycles.org_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "org members can read assessment frameworks"
  on public.assessment_frameworks
  for select
  using (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_frameworks.org_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage assessment frameworks"
  on public.assessment_frameworks
  for all
  using (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_frameworks.org_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.employees e
      where e.org_id = assessment_frameworks.org_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "org members can read assessment competencies"
  on public.assessment_competencies
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_competencies.cycle_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage assessment competencies"
  on public.assessment_competencies
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_competencies.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_competencies.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

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

create policy "org members can read assessment subjects"
  on public.assessment_subjects
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_subjects.cycle_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage assessment subjects"
  on public.assessment_subjects
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_subjects.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_subjects.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "org members can read assessment reviewers"
  on public.assessment_reviewers
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reviewers.cycle_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage assessment reviewers"
  on public.assessment_reviewers
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reviewers.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reviewers.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "org members can read self assessments"
  on public.assessment_self_assessments
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_self_assessments.cycle_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage self assessments"
  on public.assessment_self_assessments
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_self_assessments.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_self_assessments.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "org members can read nominations"
  on public.assessment_nominations
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_nominations.cycle_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can manage nominations"
  on public.assessment_nominations
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_nominations.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_nominations.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "reviewers can manage own responses"
  on public.assessment_responses
  for all
  using (
    exists (
      select 1
      from public.assessment_reviewers r
      join public.employees e on e.id = r.reviewer_employee_id
      where r.id = assessment_responses.reviewer_id
        and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_reviewers r
      join public.employees e on e.id = r.reviewer_employee_id
      where r.id = assessment_responses.reviewer_id
        and e.user_id = auth.uid()
    )
  );

create policy "hr can read assessment responses"
  on public.assessment_responses
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_responses.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "hr can read assessment reports"
  on public.assessment_reports
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin', 'executive_view')
    )
  );

create policy "hr can manage assessment reports"
  on public.assessment_reports
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

create policy "hr can read assessment audit events"
  on public.assessment_audit_events
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_audit_events.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role in ('hr_admin', 'super_admin')
    )
  );

-- ── Triggers ───────────────────────────────────────────────────────────────

-- Bump the framework version whenever the instrument is edited, so a cycle's
-- competencies can record which version they were drawn from.
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

-- Drafts stay writable while not_started/in_progress and freeze on submit.
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

create or replace view public.assessment_cycle_dashboard as
select
  c.id as cycle_id,
  c.org_id,
  c.name,
  c.status,
  count(distinct s.id) as subject_count,
  count(distinct r.id) as reviewer_count,
  count(distinct r.id) filter (where r.status = 'submitted') as submitted_count,
  round(
    coalesce(
      count(distinct r.id) filter (where r.status = 'submitted')::numeric
      / nullif(count(distinct r.id), 0)::numeric,
      0
    ) * 100,
    0
  ) as completion_percent
from public.assessment_cycles c
left join public.assessment_subjects s on s.cycle_id = c.id
left join public.assessment_reviewers r on r.cycle_id = c.id
group by c.id;
