-- ═══════════════════════════════════════════════════════════════
-- PULSE — SECURITY FIXES (run after 02_rls.sql, safe to re-run)
--
-- Fixes a privilege-escalation hole: the "employees_update_own"
-- RLS policy lets an employee UPDATE any column of their own row —
-- including platform_role (→ self-promote to hr_admin),
-- compensation, and performance scores.
--
-- This trigger blocks non-HR users from changing protected columns
-- while still allowing:
--   • service-role / server-side operations (no auth.uid())
--   • HR admins managing employees
--   • employees editing their own contact/profile basics
-- ═══════════════════════════════════════════════════════════════

create or replace function enforce_employee_update_guard()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Server-side (service role) requests carry no authenticated user — allow.
  if auth.uid() is null then
    return new;
  end if;

  -- HR admins may manage any employee field.
  if auth_is_hr() then
    return new;
  end if;

  -- Everyone else: block changes to role/pay/score/org-structure columns.
  if new.platform_role          is distinct from old.platform_role
     or new.compensation        is distinct from old.compensation
     or new.performance_score   is distinct from old.performance_score
     or new.consistency_index   is distinct from old.consistency_index
     or new.peer_rating         is distinct from old.peer_rating
     or new.week_streak         is distinct from old.week_streak
     or new.badge               is distinct from old.badge
     or new.ai_rec              is distinct from old.ai_rec
     or new.cadre               is distinct from old.cadre
     or new.people_responsibility is distinct from old.people_responsibility
     or new.band_current        is distinct from old.band_current
     or new.band_next           is distinct from old.band_next
     or new.band_requirements   is distinct from old.band_requirements
     or new.line_manager_id     is distinct from old.line_manager_id
     or new.org_id              is distinct from old.org_id
     or new.user_id             is distinct from old.user_id
     or new.email               is distinct from old.email
     or new.staff_id            is distinct from old.staff_id
     or new.department          is distinct from old.department
     or new.team                is distinct from old.team
     or new.role                is distinct from old.role
     or new.employment_type     is distinct from old.employment_type
     or new.join_date           is distinct from old.join_date
  then
    raise exception 'You are not allowed to modify protected employee fields';
  end if;

  return new;
end;
$$;

drop trigger if exists employees_update_guard on employees;

create trigger employees_update_guard
  before update on employees
  for each row
  execute function enforce_employee_update_guard();
