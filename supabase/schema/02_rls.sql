-- ═══════════════════════════════════════════════════════════════
-- PULSE DATABASE — CHUNK 2 OF 4: ROW LEVEL SECURITY
-- Run after 01_tables.sql
-- ═══════════════════════════════════════════════════════════════

-- Helper: get current user's org_id
create or replace function auth_org_id()
returns uuid language sql stable security definer as $$
  select org_id from employees where user_id = auth.uid() limit 1;
$$;

-- Helper: get current user's employee id
create or replace function auth_employee_id()
returns uuid language sql stable security definer as $$
  select id from employees where user_id = auth.uid() limit 1;
$$;

-- Helper: check if current user is hr_admin or super_admin
create or replace function auth_is_hr()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from employees
    where user_id = auth.uid()
    and platform_role in ('hr_admin', 'super_admin')
  );
$$;

-- Helper: check if current user is a manager of a given employee
create or replace function auth_manages(p_employee_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from employees
    where id = p_employee_id
    and line_manager_id = auth_employee_id()
  );
$$;

-- ── ORGANISATIONS ────────────────────────────────────────────────
alter table organisations enable row level security;

create policy "org_members_read" on organisations
  for select using (id = auth_org_id());

create policy "super_admin_all" on organisations
  for all using (
    exists (select 1 from employees where user_id = auth.uid() and platform_role = 'super_admin')
  );

-- ── EMPLOYEES ───────────────────────────────────────────────────
alter table employees enable row level security;

create policy "employees_read_same_org" on employees
  for select using (org_id = auth_org_id());

create policy "employees_update_own" on employees
  for update using (user_id = auth.uid());

create policy "hr_update_any" on employees
  for update using (auth_is_hr() and org_id = auth_org_id());

create policy "hr_insert" on employees
  for insert with check (auth_is_hr() and org_id = auth_org_id());

create policy "hr_delete" on employees
  for delete using (auth_is_hr() and org_id = auth_org_id());

-- ── GOALS ───────────────────────────────────────────────────────
alter table goals enable row level security;

create policy "goals_read_same_org" on goals
  for select using (org_id = auth_org_id());

create policy "goals_insert_authenticated" on goals
  for insert with check (org_id = auth_org_id());

create policy "goals_update_owner_or_manager" on goals
  for update using (
    owner_id = auth_employee_id()
    or auth_manages(owner_id)
    or auth_is_hr()
  );

create policy "goals_delete_hr" on goals
  for delete using (auth_is_hr());

-- ── GOAL TASKS ──────────────────────────────────────────────────
alter table goal_tasks enable row level security;

create policy "goal_tasks_read" on goal_tasks
  for select using (
    exists (select 1 from goals where id = goal_id and org_id = auth_org_id())
  );

create policy "goal_tasks_insert" on goal_tasks
  for insert with check (
    exists (select 1 from goals where id = goal_id and org_id = auth_org_id())
  );

create policy "goal_tasks_update" on goal_tasks
  for update using (
    assignee_id = auth_employee_id() or auth_is_hr()
  );

create policy "goal_tasks_delete" on goal_tasks
  for delete using (auth_is_hr());

-- ── GOAL PROGRESS ───────────────────────────────────────────────
alter table goal_progress enable row level security;

create policy "goal_progress_read" on goal_progress
  for select using (
    exists (select 1 from goals where id = goal_id and org_id = auth_org_id())
  );

create policy "goal_progress_insert" on goal_progress
  for insert with check (
    updated_by = auth_employee_id()
    and exists (select 1 from goals where id = goal_id and org_id = auth_org_id())
  );

-- ── KPIS ────────────────────────────────────────────────────────
alter table kpis enable row level security;

create policy "kpis_read_same_org" on kpis
  for select using (org_id = auth_org_id());

create policy "kpis_insert_hr" on kpis
  for insert with check (auth_is_hr() and org_id = auth_org_id());

create policy "kpis_update_owner_or_hr" on kpis
  for update using (
    employee_id = auth_employee_id() or auth_is_hr()
  );

create policy "kpis_delete_hr" on kpis
  for delete using (auth_is_hr());

-- ── REPORTS ─────────────────────────────────────────────────────
alter table reports enable row level security;

create policy "reports_read_own" on reports
  for select using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "reports_insert_own" on reports
  for insert with check (
    employee_id = auth_employee_id()
    and org_id = auth_org_id()
  );

create policy "reports_update_own_or_manager" on reports
  for update using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "reports_delete_hr" on reports
  for delete using (auth_is_hr());

-- ── APPRAISAL CYCLES ────────────────────────────────────────────
alter table appraisal_cycles enable row level security;

create policy "cycles_read_same_org" on appraisal_cycles
  for select using (org_id = auth_org_id());

create policy "cycles_manage_hr" on appraisal_cycles
  for all using (auth_is_hr() and org_id = auth_org_id());

-- ── APPRAISALS ──────────────────────────────────────────────────
alter table appraisals enable row level security;

create policy "appraisals_read_own_or_manager" on appraisals
  for select using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "appraisals_insert_hr" on appraisals
  for insert with check (auth_is_hr() and org_id = auth_org_id());

create policy "appraisals_update_hr_or_manager" on appraisals
  for update using (
    auth_manages(employee_id) or auth_is_hr()
  );

create policy "appraisals_delete_hr" on appraisals
  for delete using (auth_is_hr());

-- ── PEER FEEDBACK ───────────────────────────────────────────────
alter table peer_feedback enable row level security;

create policy "peer_feedback_read_own_or_hr" on peer_feedback
  for select using (
    reviewer_id = auth_employee_id()
    or reviewee_id = auth_employee_id()
    or auth_is_hr()
  );

create policy "peer_feedback_insert_authenticated" on peer_feedback
  for insert with check (reviewer_id = auth_employee_id());

create policy "peer_feedback_update_own" on peer_feedback
  for update using (reviewer_id = auth_employee_id());

create policy "peer_feedback_delete_hr" on peer_feedback
  for delete using (auth_is_hr());

-- ── WELLBEING SURVEYS ───────────────────────────────────────────
alter table wellbeing_surveys enable row level security;

create policy "wellbeing_read_own_or_hr" on wellbeing_surveys
  for select using (
    employee_id = auth_employee_id() or auth_is_hr()
  );

create policy "wellbeing_insert_own" on wellbeing_surveys
  for insert with check (employee_id = auth_employee_id());

create policy "wellbeing_update_own" on wellbeing_surveys
  for update using (employee_id = auth_employee_id());

create policy "wellbeing_delete_hr" on wellbeing_surveys
  for delete using (auth_is_hr());

-- ── NOTIFICATIONS ───────────────────────────────────────────────
alter table notifications enable row level security;

create policy "notifications_read_own" on notifications
  for select using (employee_id = auth_employee_id());

create policy "notifications_update_own" on notifications
  for update using (employee_id = auth_employee_id());

create policy "notifications_insert_hr" on notifications
  for insert with check (auth_is_hr() or auth_manages(employee_id));

create policy "notifications_delete_hr" on notifications
  for delete using (auth_is_hr());

-- ── DOCUMENTS ───────────────────────────────────────────────────
alter table documents enable row level security;

create policy "documents_read_own_or_hr" on documents
  for select using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "documents_insert_own_or_hr" on documents
  for insert with check (
    employee_id = auth_employee_id() or auth_is_hr()
  );

create policy "documents_update_hr" on documents
  for update using (auth_is_hr());

create policy "documents_delete_hr" on documents
  for delete using (auth_is_hr());

-- ── LEAVE REQUESTS ──────────────────────────────────────────────
alter table leave_requests enable row level security;

create policy "leave_read_own_or_manager" on leave_requests
  for select using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "leave_insert_own" on leave_requests
  for insert with check (employee_id = auth_employee_id() and org_id = auth_org_id());

create policy "leave_update_own_or_approver" on leave_requests
  for update using (
    employee_id = auth_employee_id()
    or auth_manages(employee_id)
    or auth_is_hr()
  );

create policy "leave_delete_hr" on leave_requests
  for delete using (auth_is_hr());

-- ── TASKS ───────────────────────────────────────────────────────
alter table tasks enable row level security;

create policy "tasks_read_own_or_manager" on tasks
  for select using (
    assignee_id = auth_employee_id()
    or auth_manages(assignee_id)
    or auth_is_hr()
  );

create policy "tasks_insert_authenticated" on tasks
  for insert with check (org_id = auth_org_id());

create policy "tasks_update_own_or_manager" on tasks
  for update using (
    assignee_id = auth_employee_id()
    or created_by = auth_employee_id()
    or auth_manages(assignee_id)
    or auth_is_hr()
  );

create policy "tasks_delete_own_or_hr" on tasks
  for delete using (
    created_by = auth_employee_id() or auth_is_hr()
  );

-- ── ESCALATIONS ─────────────────────────────────────────────────
alter table escalations enable row level security;

create policy "escalations_read_own_or_hr" on escalations
  for select using (
    (raised_by = auth_employee_id() and not is_anonymous)
    or assigned_to = auth_employee_id()
    or auth_is_hr()
  );

create policy "escalations_insert_authenticated" on escalations
  for insert with check (
    (raised_by = auth_employee_id() or is_anonymous)
    and org_id = auth_org_id()
  );

create policy "escalations_update_assigned_or_hr" on escalations
  for update using (
    assigned_to = auth_employee_id() or auth_is_hr()
  );

create policy "escalations_delete_hr" on escalations
  for delete using (auth_is_hr());
