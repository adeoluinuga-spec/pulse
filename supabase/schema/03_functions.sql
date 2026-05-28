-- ═══════════════════════════════════════════════════════════════
-- PULSE DATABASE — CHUNK 3 OF 4: HELPER FUNCTIONS
-- Run after 02_rls.sql
-- ═══════════════════════════════════════════════════════════════

-- Get the authenticated user's full employee profile
create or replace function get_my_profile()
returns json language sql security definer stable as $$
  select row_to_json(e.*)
  from employees e
  where e.user_id = auth.uid()
  limit 1;
$$;

-- Get all employees in the same org as the caller
create or replace function get_org_employees()
returns setof employees language sql security definer stable as $$
  select * from employees
  where org_id = auth_org_id()
  order by name;
$$;

-- Get direct reports for the calling user
create or replace function get_my_team()
returns setof employees language sql security definer stable as $$
  select * from employees
  where line_manager_id = auth_employee_id()
  order by name;
$$;

-- Live appraisal score calculation
create or replace function calculate_appraisal_score(
  p_employee_id uuid,
  p_cycle_id uuid
)
returns numeric language plpgsql security definer as $$
declare
  v_weights jsonb;
  v_goal_score numeric := 0;
  v_report_score numeric := 0;
  v_kpi_score numeric := 0;
  v_total numeric := 0;
  w_goals integer;
  w_reports integer;
  w_kpis integer;
  w_manager integer;
  w_peer integer;
begin
  select weights into v_weights
  from appraisal_cycles
  where id = p_cycle_id;

  w_goals   := coalesce((v_weights->>'goal_achievement')::integer, 35);
  w_reports := coalesce((v_weights->>'report_consistency')::integer, 20);
  w_kpis    := coalesce((v_weights->>'kpi_performance')::integer, 25);
  w_manager := coalesce((v_weights->>'manager_assessment')::integer, 10);
  w_peer    := coalesce((v_weights->>'peer_feedback')::integer, 10);

  -- Goal completion average
  select coalesce(avg(percent_complete), 0) into v_goal_score
  from goals
  where owner_id = p_employee_id
    and cycle = (select name from appraisal_cycles where id = p_cycle_id);

  -- Report consistency: % of weeks with a submitted report (last 13 weeks)
  select coalesce(
    (count(*)::numeric / 13) * 100, 0
  ) into v_report_score
  from reports
  where employee_id = p_employee_id
    and submitted_at >= now() - interval '91 days';

  -- KPI performance average: current/target * 100
  select coalesce(
    avg(
      case when target_value > 0
        then least((current_value / target_value) * 100, 100)
        else 0
      end
    ), 0
  ) into v_kpi_score
  from kpis
  where employee_id = p_employee_id
    and cycle = (select name from appraisal_cycles where id = p_cycle_id);

  v_total := (v_goal_score * w_goals / 100)
           + (v_report_score * w_reports / 100)
           + (v_kpi_score * w_kpis / 100);

  return round(v_total, 1);
end;
$$;

-- Mark all notifications read for current user
create or replace function mark_all_notifications_read()
returns void language sql security definer as $$
  update notifications
  set is_read = true
  where employee_id = auth_employee_id();
$$;

-- Get unread notification count for current user
create or replace function get_unread_notification_count()
returns integer language sql security definer stable as $$
  select count(*)::integer
  from notifications
  where employee_id = auth_employee_id()
    and is_read = false;
$$;

-- Upsert weekly report and trigger AI digest flag
create or replace function submit_report(
  p_org_id uuid,
  p_type text,
  p_accomplishments text,
  p_blockers text,
  p_mood text,
  p_goal_tracking text default null,
  p_support_needed text default null,
  p_quantitative_data jsonb default null
)
returns uuid language plpgsql security definer as $$
declare
  v_report_id uuid;
begin
  insert into reports (
    org_id, employee_id, report_type,
    accomplishments, blockers, mood,
    goal_tracking, support_needed, quantitative_data,
    period_start, period_end, status
  )
  values (
    p_org_id,
    auth_employee_id(),
    p_type,
    p_accomplishments,
    p_blockers,
    p_mood,
    p_goal_tracking,
    p_support_needed,
    p_quantitative_data,
    date_trunc('week', current_date)::date,
    (date_trunc('week', current_date) + interval '6 days')::date,
    'submitted'
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;
