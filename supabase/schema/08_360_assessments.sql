-- 360 assessment schema for multi-rater leadership assessments.

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
  reviewer_weights jsonb not null default '{"direct_report":30,"subordinate":25,"colleague":25,"customer":20}'::jsonb,
  competency_model jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assessment_competencies (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  name text not null,
  description text,
  weight numeric(5,2) not null default 0,
  sort_order integer not null default 0,
  telco_signals text[] not null default '{}',
  created_at timestamptz not null default now()
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
  reviewer_group text not null check (reviewer_group in ('direct_report', 'subordinate', 'colleague', 'customer')),
  organisation text,
  token_hash text,
  token_expires_at timestamptz,
  invite_status text not null default 'draft' check (invite_status in ('draft', 'sent', 'opened', 'submitted', 'expired')),
  invite_channel text not null default 'email' check (invite_channel in ('email', 'sms', 'whatsapp', 'portal')),
  assessment_scope text not null default 'individual' check (assessment_scope in ('individual', 'team', 'functional', 'customer_experience')),
  opened_at timestamptz,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subject_id, reviewer_email, reviewer_group)
);

create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.assessment_cycles(id) on delete cascade,
  subject_id uuid not null references public.assessment_subjects(id) on delete cascade,
  reviewer_id uuid not null references public.assessment_reviewers(id) on delete cascade,
  competency_id uuid not null references public.assessment_competencies(id) on delete cascade,
  rating numeric(3,1) check (rating >= 1 and rating <= 5),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reviewer_id, competency_id)
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

alter table public.assessment_cycles enable row level security;
alter table public.assessment_competencies enable row level security;
alter table public.assessment_subjects enable row level security;
alter table public.assessment_reviewers enable row level security;
alter table public.assessment_responses enable row level security;
alter table public.assessment_reports enable row level security;
alter table public.assessment_audit_events enable row level security;

create index if not exists assessment_cycles_org_id_idx on public.assessment_cycles(org_id);
create index if not exists assessment_subjects_cycle_id_idx on public.assessment_subjects(cycle_id);
create index if not exists assessment_reviewers_cycle_id_idx on public.assessment_reviewers(cycle_id);
create index if not exists assessment_reviewers_subject_id_idx on public.assessment_reviewers(subject_id);
create unique index if not exists assessment_reviewers_token_hash_idx on public.assessment_reviewers(token_hash) where token_hash is not null;
create index if not exists assessment_responses_reviewer_id_idx on public.assessment_responses(reviewer_id);
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
