-- ═══════════════════════════════════════════════════════════════
-- PULSE DATABASE — CHUNK 1 OF 4: TABLES
-- Run this first in the Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════

-- ORGANISATIONS
create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  currency text default 'NGN',
  appraisal_cadence text default 'quarterly',
  current_cycle text,
  cycle_start_date date,
  cycle_end_date date,
  created_at timestamptz default now()
);

-- EMPLOYEES
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organisations(id) on delete cascade,
  name text not null,
  initials text,
  email text not null,
  phone text,
  home_address text,
  emergency_contact jsonb,
  next_of_kin jsonb,
  avatar_url text,
  onboarding_completed boolean default false,
  onboarding_completed_at timestamptz,
  avatar_color text default '#e8440a',
  staff_id text,
  department text,
  team text,
  role text,
  line_manager_id uuid references employees(id),
  cadre text default 'entry',
  people_responsibility text default 'none',
  platform_role text default 'standard',
  employment_type text default 'full_time',
  work_location text,
  join_date date,
  band_current text,
  band_next text,
  band_requirements jsonb,
  compensation jsonb,
  performance_score integer default 0,
  consistency_index integer default 0,
  peer_rating numeric(3,1) default 0,
  week_streak integer default 0,
  badge text default 'Good Standing',
  ai_rec jsonb,
  created_at timestamptz default now()
);

-- GOALS
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  owner_id uuid references employees(id) on delete cascade,
  created_by uuid references employees(id),
  title text not null,
  description text,
  goal_type text not null,
  department text,
  team text,
  target_metric text,
  weight integer default 0,
  percent_complete integer default 0,
  status text default 'active',
  due_date date,
  start_date date default current_date,
  cycle text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- GOAL TASKS
create table if not exists goal_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  assignee_id uuid references employees(id),
  title text not null,
  is_complete boolean default false,
  due_date date,
  created_at timestamptz default now()
);

-- GOAL PROGRESS HISTORY
create table if not exists goal_progress (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  updated_by uuid references employees(id),
  old_percent integer,
  new_percent integer,
  note text,
  created_at timestamptz default now()
);

-- KPIS
create table if not exists kpis (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  name text not null,
  description text,
  target_value numeric,
  current_value numeric default 0,
  unit text,
  weight integer default 0,
  trend text default 'flat',
  cycle text,
  created_at timestamptz default now()
);

-- REPORTS
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  report_type text not null,
  period_start date,
  period_end date,
  accomplishments text,
  blockers text,
  support_needed text,
  goal_tracking text,
  mood text,
  quantitative_data jsonb,
  file_urls text[],
  ai_digest jsonb,
  status text default 'submitted',
  manager_comment text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

-- APPRAISAL CYCLES
create table if not exists appraisal_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  status text default 'active',
  weights jsonb,
  created_at timestamptz default now()
);

-- APPRAISAL RECORDS
create table if not exists appraisals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  cycle_id uuid references appraisal_cycles(id) on delete cascade,
  goal_achievement_score numeric,
  report_consistency_score numeric,
  kpi_performance_score numeric,
  manager_assessment_score numeric,
  peer_feedback_score numeric,
  total_score numeric,
  self_assessment jsonb,
  manager_assessment jsonb,
  ai_recommendation text,
  ai_confidence integer,
  ai_evidence text[],
  manager_agreed boolean,
  manager_override_reason text,
  hr_confirmed boolean,
  hr_override text,
  status text default 'in_progress',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PEER FEEDBACK
create table if not exists peer_feedback (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid references appraisal_cycles(id) on delete cascade,
  reviewer_id uuid references employees(id) on delete cascade,
  reviewee_id uuid references employees(id) on delete cascade,
  rating integer,
  comment text,
  is_anonymous boolean default false,
  submitted_at timestamptz default now()
);

-- WELLBEING SURVEYS
create table if not exists wellbeing_surveys (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  overall_mood text,
  workload text,
  support_level text,
  free_text text,
  ai_response text,
  escalation_level integer default 0,
  week_of date default current_date,
  submitted_at timestamptz default now()
);

-- NOTIFICATIONS
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  title text not null,
  body text,
  type text,
  is_read boolean default false,
  action_url text,
  created_at timestamptz default now()
);

-- DOCUMENTS
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  org_id uuid references organisations(id) on delete cascade,
  name text not null,
  doc_type text,
  file_url text,
  status text default 'pending',
  rejection_reason text,
  uploaded_by text default 'employee',
  is_sensitive boolean default false,
  uploaded_at timestamptz default now()
);

-- LEAVE REQUESTS
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  org_id uuid references organisations(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days_taken integer,
  note text,
  status text default 'pending',
  approved_by uuid references employees(id),
  decline_reason text,
  handover jsonb,
  submitted_at timestamptz default now()
);

-- TASKS
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  assignee_id uuid references employees(id) on delete cascade,
  created_by uuid references employees(id),
  title text not null,
  due_date date,
  is_complete boolean default false,
  source text default 'manual',
  linked_goal_id uuid references goals(id),
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ESCALATIONS
create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  raised_by uuid references employees(id) on delete cascade,
  title text not null,
  description text,
  escalation_type text,
  urgency text default 'medium',
  is_anonymous boolean default false,
  status text default 'raised',
  assigned_to uuid references employees(id),
  resolution_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
