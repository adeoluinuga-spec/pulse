-- STORE A PAYROLL CALCULATION ATOMICALLY
--
-- Recalculating a run replaces every line in it and updates the run's totals,
-- rules and fingerprint. Done as separate calls from the application — delete
-- the lines, insert the new ones, update the run — a failure part-way leaves a
-- run with no lines, or new lines under old totals. For payroll that is not an
-- acceptable intermediate state, so the whole replacement is one transaction.
--
-- The function also re-checks, under a row lock, the things the application
-- already checked: the run is still a draft, nobody else changed it since it
-- was read, and every line belongs to an employee of the run's organisation.
-- Two preparers pressing Calculate at once get one success and one clear
-- conflict, never interleaved lines.

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
    tax_state, tax_working, blockers, warnings
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
    coalesce(line->'blockers', '[]'::jsonb), coalesce(line->'warnings', '[]'::jsonb)
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

  return run_row.revision + 1;
end $$;

revoke all on function public.payroll_store_calculation(uuid, integer, uuid, jsonb, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.payroll_store_calculation(uuid, integer, uuid, jsonb, jsonb, text, jsonb, text) to service_role;
