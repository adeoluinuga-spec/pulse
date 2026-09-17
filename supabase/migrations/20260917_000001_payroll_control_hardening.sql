-- PAYROLL CONTROL HARDENING
--
-- Closes four gaps found in audit (APP_AUDIT_2026-09-17.md), all in payroll's
-- controls rather than its arithmetic.
--
-- 1. Payment destinations are frozen with the calculation.
--    The bank file used to read account details as they were at download, so a
--    preparer could change an account number after approval and redirect an
--    approved salary. Each line now stores the bank, pension and NHF details it
--    was calculated with, and the export reads only that copy. The application
--    also fingerprints those details, so a change before approval makes the
--    calculation stale and blocks submission or approval until recalculated.
--
-- 2. Workflow changes and their audit events commit together.
--    "Nobody who worked on a run may approve it" was checked against an event
--    log whose writes were not checked, so a failed write could erase someone's
--    involvement. Calculation, submission, return, approval, voiding, bonus
--    import and adjustment removal now write their event inside the same
--    transaction as the change. Approval and return re-check involvement in the
--    database, against events, adjustment authors, and the run's own calculator
--    and submitter — so the rule holds even if the application is wrong.
--
-- 3. A performance bonus is imported at most once per appraisal.
--    The import read existing adjustments and then inserted, so two concurrent
--    imports could both pass. It is now one transaction under a per-organisation
--    lock, and an appraisal already paid in any live (non-voided) run is refused.
--    A per-run unique index backs this up.
--
-- 4. (Application side) errors on control data now abort instead of defaulting.
--
-- No payroll run had been approved when this was written.

alter table public.payroll_run_lines add column if not exists payment_snapshot jsonb;

create unique index if not exists payroll_adjustments_one_bonus_per_appraisal
  on public.payroll_adjustments (run_id, (source->>'appraisalId'))
  where source->>'type' = 'appraisal';

-- Everyone who has worked on a run. Used by approval and return.
create or replace function public.payroll_contributors(p_run uuid) returns uuid[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct actor), '{}'::uuid[])
  from (
    select actor_id as actor from public.payroll_events
      where run_id = p_run
        and action in ('calculated', 'adjustment_added', 'adjustment_removed', 'submitted', 'performance_bonuses_imported')
    union select created_by from public.payroll_adjustments where run_id = p_run
    union select calculated_by from public.payroll_runs where id = p_run
    union select submitted_by from public.payroll_runs where id = p_run
  ) involved
  where actor is not null;
$$;

-- ── calculation: lines, payment snapshot and event in one transaction ────────

create or replace function public.payroll_store_calculation(
  p_run uuid,
  p_expected_revision integer,
  p_actor uuid,
  p_lines jsonb,
  p_totals jsonb,
  p_rule_set_id text,
  p_rule_set jsonb,
  p_fingerprint text
) returns integer
language plpgsql
set search_path = public
as $$
declare
  run_row public.payroll_runs%rowtype;
  foreign_count integer;
begin
  select * into run_row from public.payroll_runs where id = p_run for update;
  if not found then
    raise exception 'Payroll run not found.' using errcode = 'P0002';
  end if;
  if run_row.status <> 'draft' then
    raise exception 'Only a draft payroll run can be calculated. This one is %.', run_row.status using errcode = '42501';
  end if;
  if run_row.revision <> p_expected_revision then
    raise exception 'This payroll run changed while you were working on it. Reload and calculate again.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lines must be an array.' using errcode = '22023';
  end if;
  if p_actor is null then
    raise exception 'A calculation must record who ran it.' using errcode = '22023';
  end if;

  select count(*) into foreign_count
  from jsonb_array_elements(p_lines) line
  where not exists (
    select 1 from public.employees e
    where e.id = (line->>'employeeId')::uuid and e.org_id = run_row.org_id
  );
  if foreign_count > 0 then
    raise exception 'A payroll line belongs to an employee outside this organisation.' using errcode = '42501';
  end if;

  delete from public.payroll_run_lines where run_id = p_run;

  insert into public.payroll_run_lines (
    run_id, org_id, employee_id, employee_name, days_paid, days_in_period,
    earnings, deductions, employer,
    gross_kobo, basic_kobo, paye_kobo, pension_employee_kobo, pension_employer_kobo,
    nhf_kobo, nhis_kobo, nsitf_kobo, itf_kobo, other_deductions_kobo, net_kobo, employer_cost_kobo,
    tax_state, tax_working, blockers, warnings, payment_snapshot
  )
  select
    p_run, run_row.org_id, (line->>'employeeId')::uuid, line->>'name',
    (line->>'daysPaid')::smallint, (line->>'daysInPeriod')::smallint,
    coalesce(line->'earnings', '[]'::jsonb), coalesce(line->'deductions', '[]'::jsonb), coalesce(line->'employer', '[]'::jsonb),
    (line->>'grossKobo')::bigint, (line->>'basicKobo')::bigint, (line->>'payeKobo')::bigint,
    (line->>'pensionEmployeeKobo')::bigint, (line->>'pensionEmployerKobo')::bigint,
    (line->>'nhfKobo')::bigint, (line->>'nhisKobo')::bigint, (line->>'nsitfKobo')::bigint, (line->>'itfKobo')::bigint,
    (line->>'otherDeductionsKobo')::bigint, (line->>'netKobo')::bigint, (line->>'employerCostKobo')::bigint,
    line->>'taxState', line->'taxWorking',
    coalesce(line->'blockers', '[]'::jsonb), coalesce(line->'warnings', '[]'::jsonb),
    line->'paymentSnapshot'
  from jsonb_array_elements(p_lines) line;

  update public.payroll_runs
  set totals = p_totals,
      rule_set_id = p_rule_set_id,
      rule_set = p_rule_set,
      input_fingerprint = p_fingerprint,
      calculated_at = now(),
      calculated_by = p_actor,
      returned_reason = null,
      revision = revision + 1
  where id = p_run;

  insert into public.payroll_events (org_id, run_id, actor_id, action, payload)
  values (
    run_row.org_id, p_run, p_actor, 'calculated',
    jsonb_build_object('headcount', p_totals->'headcount', 'netKobo', p_totals->'netKobo', 'blockers', p_totals->'blockerCount', 'ruleSetId', p_rule_set_id)
  );

  return run_row.revision + 1;
end $$;

-- ── status changes: change, maker-checker and event in one transaction ───────

create or replace function public.payroll_transition(
  p_run uuid,
  p_expected_revision integer,
  p_actor uuid,
  p_action text,
  p_reason text default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  run_row public.payroll_runs%rowtype;
  blocker_count integer;
  event_name text;
  reason_text text := left(trim(coalesce(p_reason, '')), 1000);
begin
  if p_action not in ('submit', 'return', 'approve', 'void') then
    raise exception 'Unknown payroll action.' using errcode = '22023';
  end if;
  if p_actor is null then
    raise exception 'A payroll action must record who took it.' using errcode = '22023';
  end if;

  select * into run_row from public.payroll_runs where id = p_run for update;
  if not found then
    raise exception 'Payroll run not found.' using errcode = 'P0002';
  end if;
  if run_row.revision <> p_expected_revision then
    raise exception 'This payroll run changed while you were working on it. Reload and try again.' using errcode = '40001';
  end if;

  if p_action in ('approve', 'return') and p_actor = any(public.payroll_contributors(p_run)) then
    raise exception 'You worked on this run, so you cannot also approve or return it.' using errcode = '42501';
  end if;

  if p_action in ('submit', 'approve') then
    select count(*) into blocker_count
    from public.payroll_run_lines
    where run_id = p_run and jsonb_array_length(blockers) > 0;
    if blocker_count > 0 then
      raise exception 'This run still has problems that block it.' using errcode = '22023';
    end if;
    if run_row.calculated_at is null then
      raise exception 'Calculate the run first.' using errcode = '22023';
    end if;
  end if;

  if p_action = 'return' and reason_text = '' then
    raise exception 'Say why the run is being returned.' using errcode = '22023';
  end if;

  -- Status edges themselves are enforced by payroll_run_guard.
  if p_action = 'submit' then
    update public.payroll_runs
      set status = 'submitted', submitted_by = p_actor, submitted_at = now(), returned_reason = null, revision = revision + 1
      where id = p_run;
    event_name := 'submitted';
  elsif p_action = 'return' then
    update public.payroll_runs
      set status = 'draft', submitted_by = null, submitted_at = null, returned_reason = reason_text, revision = revision + 1
      where id = p_run;
    event_name := 'returned';
  elsif p_action = 'approve' then
    update public.payroll_runs
      set status = 'approved', approved_by = p_actor, approved_at = now(), revision = revision + 1
      where id = p_run;
    event_name := 'approved';
  else
    update public.payroll_runs set status = 'void', revision = revision + 1 where id = p_run;
    event_name := 'voided';
  end if;

  insert into public.payroll_events (org_id, run_id, actor_id, action, payload)
  values (
    run_row.org_id, p_run, p_actor, event_name,
    case when p_action = 'return' then jsonb_build_object('reason', reason_text) else '{}'::jsonb end
  );

  return run_row.revision + 1;
end $$;

-- ── bonus import: once per appraisal, atomically ─────────────────────────────

create or replace function public.payroll_import_bonuses(
  p_run uuid,
  p_actor uuid,
  p_appraisal_cycle uuid,
  p_rows jsonb
) returns integer
language plpgsql
set search_path = public
as $$
declare
  run_row public.payroll_runs%rowtype;
  duplicate_name text;
  foreign_count integer;
  inserted integer;
  total bigint;
begin
  if p_actor is null then
    raise exception 'An import must record who ran it.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'There are no bonuses to import.' using errcode = '22023';
  end if;

  select * into run_row from public.payroll_runs where id = p_run for update;
  if not found then
    raise exception 'Payroll run not found.' using errcode = 'P0002';
  end if;
  if run_row.status <> 'draft' then
    raise exception 'Bonuses can only be imported into a draft run.' using errcode = '42501';
  end if;

  -- Serialises imports across every run in the organisation, so two runs
  -- importing the same appraisal at the same moment cannot both succeed.
  perform pg_advisory_xact_lock(hashtextextended('payroll_bonus:' || run_row.org_id::text, 0));

  select count(*) into foreign_count
  from jsonb_array_elements(p_rows) row_data
  where not exists (
    select 1 from public.employees e where e.id = (row_data->>'employeeId')::uuid and e.org_id = run_row.org_id
  );
  if foreign_count > 0 then
    raise exception 'A bonus names an employee outside this organisation.' using errcode = '42501';
  end if;

  select e.name into duplicate_name
  from jsonb_array_elements(p_rows) row_data
  join public.payroll_adjustments a on a.source->>'type' = 'appraisal' and a.source->>'appraisalId' = row_data->>'appraisalId'
  join public.payroll_runs r on r.id = a.run_id and r.org_id = run_row.org_id and r.status <> 'void'
  join public.employees e on e.id = a.employee_id
  limit 1;
  if duplicate_name is not null then
    raise exception 'A performance bonus for % from this appraisal is already in a payroll run. An appraisal pays out once.', duplicate_name using errcode = '23505';
  end if;

  insert into public.payroll_adjustments (run_id, org_id, employee_id, label, kind, amount_kobo, taxable, pensionable, note, source, created_by)
  select
    p_run, run_row.org_id, (row_data->>'employeeId')::uuid, row_data->>'label', 'earning',
    (row_data->>'amountKobo')::bigint, true, false, row_data->>'note',
    jsonb_build_object('type', 'appraisal', 'appraisalCycleId', p_appraisal_cycle, 'appraisalId', row_data->>'appraisalId'),
    p_actor
  from jsonb_array_elements(p_rows) row_data;
  get diagnostics inserted = row_count;

  select coalesce(sum((row_data->>'amountKobo')::bigint), 0) into total from jsonb_array_elements(p_rows) row_data;

  insert into public.payroll_events (org_id, run_id, actor_id, action, payload)
  values (run_row.org_id, p_run, p_actor, 'performance_bonuses_imported',
          jsonb_build_object('appraisalCycleId', p_appraisal_cycle, 'count', inserted, 'totalKobo', total));

  return inserted;
end $$;

-- ── removing an adjustment: the removal is recorded or it does not happen ────

create or replace function public.payroll_remove_adjustment(
  p_run uuid,
  p_adjustment uuid,
  p_actor uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  run_row public.payroll_runs%rowtype;
  removed public.payroll_adjustments%rowtype;
begin
  if p_actor is null then
    raise exception 'A removal must record who made it.' using errcode = '22023';
  end if;

  select * into run_row from public.payroll_runs where id = p_run for update;
  if not found then
    raise exception 'Payroll run not found.' using errcode = 'P0002';
  end if;

  delete from public.payroll_adjustments
  where id = p_adjustment and run_id = p_run
  returning * into removed;
  if not found then
    raise exception 'That adjustment was not found.' using errcode = 'P0002';
  end if;

  insert into public.payroll_events (org_id, run_id, actor_id, action, payload)
  values (run_row.org_id, p_run, p_actor, 'adjustment_removed',
          jsonb_build_object('employeeId', removed.employee_id, 'label', removed.label, 'amountKobo', removed.amount_kobo));
end $$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.payroll_contributors(uuid)',
    'public.payroll_store_calculation(uuid, integer, uuid, jsonb, jsonb, text, jsonb, text)',
    'public.payroll_transition(uuid, integer, uuid, text, text)',
    'public.payroll_import_bonuses(uuid, uuid, uuid, jsonb)',
    'public.payroll_remove_adjustment(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;
