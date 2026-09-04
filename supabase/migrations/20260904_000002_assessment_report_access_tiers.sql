-- 360 REPORT ACCESS TIERS
--
-- This migration intentionally does not edit supabase/schema/08_360_assessments.sql.
-- It hardens report and response access as a second line of defence. The API
-- routes still enforce the same rules in application code because they use a
-- service-role client after authenticating the caller.

alter table public.assessment_cycles
  add column if not exists line_manager_report_access_enabled boolean not null default false;

alter table public.assessment_reports
  add column if not exists report_status text not null default 'draft';

alter table public.assessment_reports
  drop constraint if exists assessment_reports_report_status_check;

alter table public.assessment_reports
  add constraint assessment_reports_report_status_check
  check (report_status in ('draft', 'in_review', 'released'));

update public.assessment_reports
set report_status = case when released_at is not null then 'released' else report_status end;

create or replace view public.assessment_response_verbatims_pseudonymized
with (security_invoker = true)
as
select
  r.cycle_id,
  r.subject_id,
  r.competency_id,
  r.item_id,
  ar.reviewer_group,
  concat(
    case ar.reviewer_group
      when 'self' then 'Self'
      when 'line_manager' then 'Line Manager'
      when 'colleague' then 'Colleague'
      when 'direct_report' then 'Direct Report'
      when 'customer' then 'Customer'
      else 'Rater'
    end,
    ' ',
    dense_rank() over (
      partition by r.cycle_id, r.subject_id, ar.reviewer_group
      order by md5(ar.id::text)
    )
  ) as rater_label,
  md5(ar.id::text) as rater_key,
  r.comment
from public.assessment_responses r
join public.assessment_reviewers ar on ar.id = r.reviewer_id
where ar.status = 'submitted'
  and r.comment is not null
  and btrim(r.comment) <> '';

revoke all on public.assessment_response_verbatims_pseudonymized from public;
grant select on public.assessment_response_verbatims_pseudonymized to authenticated;

drop policy if exists "hr can read assessment responses" on public.assessment_responses;
drop policy if exists "super admin can read assessment responses" on public.assessment_responses;

create policy "super admin can read assessment responses"
  on public.assessment_responses
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_responses.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role = 'super_admin'
    )
  );

drop policy if exists "hr can read assessment reports" on public.assessment_reports;
drop policy if exists "hr can manage assessment reports" on public.assessment_reports;
drop policy if exists "participant can read own released assessment report" on public.assessment_reports;
drop policy if exists "line manager can read released direct report assessment report" on public.assessment_reports;
drop policy if exists "super admin can read assessment reports" on public.assessment_reports;
drop policy if exists "super admin can manage assessment reports" on public.assessment_reports;

create policy "participant can read own released assessment report"
  on public.assessment_reports
  for select
  using (
    report_status = 'released'
    and released_at is not null
    and exists (
      select 1
      from public.assessment_subjects s
      join public.employees e on e.id = s.employee_id
      where s.id = assessment_reports.subject_id
        and e.user_id = auth.uid()
    )
  );

create policy "line manager can read released direct report assessment report"
  on public.assessment_reports
  for select
  using (
    report_status = 'released'
    and released_at is not null
    and exists (
      select 1
      from public.assessment_subjects s
      join public.employees subject_employee on subject_employee.id = s.employee_id
      join public.employees manager_employee on manager_employee.id = subject_employee.line_manager_id
      join public.assessment_cycles c on c.id = assessment_reports.cycle_id
      where s.id = assessment_reports.subject_id
        and manager_employee.user_id = auth.uid()
        and c.line_manager_report_access_enabled = true
    )
  );

create policy "super admin can read assessment reports"
  on public.assessment_reports
  for select
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role = 'super_admin'
    )
  );

create policy "super admin can manage assessment reports"
  on public.assessment_reports
  for all
  using (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_cycles c
      join public.employees e on e.org_id = c.org_id
      where c.id = assessment_reports.cycle_id
        and e.user_id = auth.uid()
        and e.platform_role = 'super_admin'
    )
  );

create index if not exists assessment_reports_released_idx
  on public.assessment_reports(cycle_id, released_at)
  where released_at is not null;

create index if not exists assessment_audit_events_report_access_idx
  on public.assessment_audit_events(cycle_id, subject_id, action, created_at)
  where action in ('report_viewed', 'report_released', 'report_exported');
