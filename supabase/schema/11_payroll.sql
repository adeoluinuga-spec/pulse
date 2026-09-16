-- DOCUMENTATION ONLY. Applied via supabase/migrations/20260916_000001_restrict_salary_visibility.sql
-- and supabase/migrations/20260916_000002_payroll.sql. Do not run this file; change the schema
-- with a new migration and update this file to match.

-- SALARIES ARE NOT PUBLIC WITHIN AN ORGANISATION
--
-- `employees_read_same_org` lets every signed-in employee read every colleague's
-- row, and the row carries `compensation`: basic, housing, transport, medical,
-- total gross and bonus structure. 07_security_fixes stopped people *editing*
-- their own pay; nothing stopped them *reading* everyone else's, straight from
-- the browser with the public anon key.
--
-- Row-level security cannot hide one column, so the fix is a column grant:
-- the browser roles lose table-wide SELECT and get it back on every column
-- except `compensation`. Salary is then reachable only through the server,
-- where the payroll routes decide who may see whose.
--
-- APPLY ORDER MATTERS. Deploy the application first: the profile loader used to
-- `select("*")` on the signed-in user's own row, and `*` includes the revoked
-- column, so running this against the old code fails every login. The new code
-- selects named columns and fetches its own pay from /api/payroll/me.
--
-- MAINTENANCE NOTE. A column added to `employees` after this migration is NOT
-- readable from the browser until it is granted. That is deliberate — new
-- columns on a table holding pay data should be private until someone decides
-- otherwise — but it will look like a bug the first time it happens:
--
--     grant select (new_column) on public.employees to authenticated;
--
-- Nothing is dropped or retyped. The data stays where it is.

do $$
declare
  readable text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into readable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'employees'
    and column_name <> 'compensation';

  if readable is null then
    raise exception 'public.employees has no columns to grant; refusing to revoke access.';
  end if;

  revoke select on public.employees from anon, authenticated;
  execute format('grant select (%s) on public.employees to authenticated', readable);
end $$;

-- The server still reads everything.
grant select on public.employees to service_role;


-- PAYROLL
--
-- Calculates, approves and documents pay. It does not move money and it does
-- not file with any tax authority: an approved run produces a bank schedule to
-- upload and remittance schedules to send. That boundary is deliberate — paying
-- people needs a banking partner and carries the real liability.
--
-- Money is bigint kobo throughout. Floating-point naira is how a payroll ends up
-- a kobo out on one payslip with no way to find why.
--
-- The controls live here as well as in the application, because the application
-- writes with the service-role client and a bug there should not be able to:
--   * change an approved run, or any line or adjustment inside one
--   * let the person who submitted a run also approve it
--   * rewrite a compensation record that a paid month already relied on
--   * create two live runs for the same month
--
-- No browser role can read or write any of these tables. Every access goes
-- through /api/payroll, which decides who sees whose pay.
--
-- Depends on 20260916_000001 (salary visibility). Apply that one first.

-- ── settings ─────────────────────────────────────────────────────────────────

create table if not exists public.payroll_settings (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  pension_enabled boolean not null default true,
  nhf_enabled boolean not null default true,
  nsitf_enabled boolean not null default true,
  itf_enabled boolean not null default true,
  default_tax_state text,
  pay_day smallint check (pay_day between 1 and 31),
  updated_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Approval is granted to a named person, never implied by a role, so an
-- organisation has to decide deliberately who its second pair of eyes is.
create table if not exists public.payroll_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  can_prepare boolean not null default false,
  can_approve boolean not null default false,
  can_view_all boolean not null default false,
  granted_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, employee_id)
);

-- ── people ───────────────────────────────────────────────────────────────────

-- Kept apart from `employees` so none of it can ever be reached through the
-- staff directory: bank accounts, tax numbers and pension PINs.
create table if not exists public.employee_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  tax_state text,
  tin text,
  pfa_name text,
  rsa_pin text,
  nhf_number text,
  bank_name text,
  bank_code text,
  account_number text check (account_number is null or account_number ~ '^[0-9]{10}$'),
  account_name text,
  annual_rent_kobo bigint not null default 0 check (annual_rent_kobo >= 0),
  nhis_monthly_kobo bigint not null default 0 check (nhis_monthly_kobo >= 0),
  life_assurance_annual_kobo bigint not null default 0 check (life_assurance_annual_kobo >= 0),
  pension_exempt boolean not null default false,
  nhf_exempt boolean not null default false,
  exit_date date,
  updated_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Effective-dated and append-only. A pay rise is a new row from a date, never
-- an edit, so any past month can still be recalculated from what was true then.
-- `components` is [{ code, label, amountKobo, taxable, pensionable, isBasic }],
-- each a full-month amount.
create table if not exists public.employee_compensation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_from date not null,
  components jsonb not null check (jsonb_typeof(components) = 'array' and jsonb_array_length(components) > 0),
  grade text,
  reason text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create index if not exists employee_compensation_lookup on public.employee_compensation(employee_id, effective_from desc);

-- ── runs ─────────────────────────────────────────────────────────────────────

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  period_year smallint not null check (period_year between 2020 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'void')),
  -- A full copy of the statutory rules used. Editing the rules in code later
  -- never changes a run that has already been paid.
  rule_set_id text,
  rule_set jsonb,
  totals jsonb not null default '{}'::jsonb,
  input_fingerprint text,
  calculated_at timestamptz,
  calculated_by uuid references public.employees(id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.employees(id) on delete set null,
  returned_reason text,
  revision integer not null default 0,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_approval_is_complete check (
    status <> 'approved' or (approved_by is not null and approved_at is not null and submitted_by is not null)
  ),
  -- The minimum maker-checker rule, as a backstop the application cannot skip.
  -- The application enforces the stronger rule: nobody who touched the run.
  constraint payroll_runs_approver_is_not_submitter check (approved_by is null or approved_by <> submitted_by),
  constraint payroll_runs_approver_is_not_calculator check (approved_by is null or calculated_by is null or approved_by <> calculated_by)
);

-- One live run per month. A voided run does not count, so a mistake can be
-- voided and the month started again.
create unique index if not exists payroll_runs_one_live_per_period
  on public.payroll_runs(org_id, period_year, period_month) where status <> 'void';

create table if not exists public.payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_name text not null,
  days_paid smallint not null,
  days_in_period smallint not null,
  earnings jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb,
  employer jsonb not null default '[]'::jsonb,
  gross_kobo bigint not null default 0,
  basic_kobo bigint not null default 0,
  paye_kobo bigint not null default 0,
  pension_employee_kobo bigint not null default 0,
  pension_employer_kobo bigint not null default 0,
  nhf_kobo bigint not null default 0,
  nhis_kobo bigint not null default 0,
  nsitf_kobo bigint not null default 0,
  itf_kobo bigint not null default 0,
  other_deductions_kobo bigint not null default 0,
  net_kobo bigint not null default 0,
  employer_cost_kobo bigint not null default 0,
  tax_state text,
  tax_working jsonb,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, employee_id)
);

create index if not exists payroll_run_lines_employee on public.payroll_run_lines(employee_id, run_id);

-- One-off earnings and deductions for one person in one run.
create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  label text not null check (length(trim(label)) between 2 and 120),
  kind text not null check (kind in ('earning', 'deduction')),
  amount_kobo bigint not null check (amount_kobo > 0),
  taxable boolean not null default true,
  pensionable boolean not null default false,
  note text,
  -- Where an automated adjustment came from, e.g. a released appraisal, so the
  -- same bonus is never imported twice.
  source jsonb,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_adjustments_run on public.payroll_adjustments(run_id, employee_id);

create table if not exists public.payroll_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  run_id uuid references public.payroll_runs(id) on delete cascade,
  actor_id uuid references public.employees(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_events_run on public.payroll_events(run_id, created_at);

-- ── guards ───────────────────────────────────────────────────────────────────

-- A run moves only along the permitted edges, and an approved or voided run
-- never moves again.
create or replace function public.payroll_run_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('submitted', 'approved') then
      raise exception 'A submitted or approved payroll run cannot be deleted. Void a draft instead.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status in ('approved', 'void') then
    raise exception 'This payroll run is % and can no longer change.', old.status using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status in ('submitted', 'void'))
    or (old.status = 'submitted' and new.status in ('draft', 'approved'))
  ) then
    raise exception 'A payroll run cannot move from % to %.', old.status, new.status using errcode = '22023';
  end if;

  if old.org_id <> new.org_id or old.period_year <> new.period_year or old.period_month <> new.period_month then
    raise exception 'A payroll run cannot be moved to another organisation or period.' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists payroll_runs_guard on public.payroll_runs;
create trigger payroll_runs_guard before update or delete on public.payroll_runs
for each row execute function public.payroll_run_guard();

-- Lines and adjustments change only while their run is a draft.
create or replace function public.payroll_child_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  parent_status text;
  parent_id uuid := coalesce(new.run_id, old.run_id);
begin
  select status into parent_status from public.payroll_runs where id = parent_id;
  if parent_status is null then
    -- The run itself is being deleted; the cascade is permitted by the run guard.
    return coalesce(new, old);
  end if;
  if parent_status <> 'draft' then
    raise exception 'Payroll run is %; its lines and adjustments are locked.', parent_status using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists payroll_run_lines_guard on public.payroll_run_lines;
create trigger payroll_run_lines_guard before insert or update or delete on public.payroll_run_lines
for each row execute function public.payroll_child_guard();

drop trigger if exists payroll_adjustments_guard on public.payroll_adjustments;
create trigger payroll_adjustments_guard before insert or update or delete on public.payroll_adjustments
for each row execute function public.payroll_child_guard();

-- Compensation is append-only. A record may be withdrawn only if no approved
-- run has paid a month on or after the date it took effect.
create or replace function public.employee_compensation_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Compensation records are never edited. Add a new record from the date the change takes effect.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.payroll_runs r
    where r.org_id = old.org_id
      and r.status = 'approved'
      and make_date(r.period_year, r.period_month, 1) + interval '1 month' - interval '1 day' >= old.effective_from
  ) then
    raise exception 'This compensation record has already been paid in an approved run and cannot be removed.' using errcode = '42501';
  end if;

  return old;
end $$;

drop trigger if exists employee_compensation_guard on public.employee_compensation;
create trigger employee_compensation_guard before update or delete on public.employee_compensation
for each row execute function public.employee_compensation_guard();

-- ── access ───────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'payroll_settings', 'payroll_permissions', 'employee_payroll_profiles', 'employee_compensation',
    'payroll_runs', 'payroll_run_lines', 'payroll_adjustments', 'payroll_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ── carry existing pay across ────────────────────────────────────────────────

-- Copies whatever `employees.compensation` already holds into the dated table,
-- effective from the employee's join date (or the start of 2026). Nothing is
-- removed from `employees`. Rows already migrated are skipped, so this is safe
-- to run twice.
insert into public.employee_compensation (org_id, employee_id, effective_from, components, reason)
select
  e.org_id,
  e.id,
  coalesce(e.join_date, date '2026-01-01'),
  jsonb_path_query_array(
    jsonb_build_array(
      jsonb_build_object('code', 'basic', 'label', 'Basic salary', 'amountKobo', round(coalesce((e.compensation->>'basic')::numeric, 0) * 100)::bigint, 'taxable', true, 'pensionable', true, 'isBasic', true),
      jsonb_build_object('code', 'housing', 'label', 'Housing allowance', 'amountKobo', round(coalesce((e.compensation->>'housing')::numeric, 0) * 100)::bigint, 'taxable', true, 'pensionable', true, 'isBasic', false),
      jsonb_build_object('code', 'transport', 'label', 'Transport allowance', 'amountKobo', round(coalesce((e.compensation->>'transport')::numeric, 0) * 100)::bigint, 'taxable', true, 'pensionable', true, 'isBasic', false),
      jsonb_build_object('code', 'medical', 'label', 'Medical allowance', 'amountKobo', round(coalesce((e.compensation->>'medical')::numeric, 0) * 100)::bigint, 'taxable', true, 'pensionable', false, 'isBasic', false)
    ),
    '$[*] ? (@.amountKobo > 0)'
  ),
  'Carried over from the employee record when payroll was introduced'
from public.employees e
where e.compensation is not null
  and coalesce((e.compensation->>'basic')::numeric, 0) > 0
  and not exists (select 1 from public.employee_compensation c where c.employee_id = e.id);
