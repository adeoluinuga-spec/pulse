-- Run once in Supabase SQL Editor after the core schema. Do not run again if the matching migration was applied.
BEGIN;
-- Evidence-led performance review using the existing appraisal, goal, KPI,
-- report and peer-feedback tables. No historical records are discarded.
alter table public.appraisal_cycles
  add column managed_review boolean not null default false,
  add column review_due_date date,
  add column report_frequency text not null default 'weekly' check (report_frequency in ('weekly','monthly','none')),
  add column revision bigint not null default 0;
alter table public.appraisals
  add column workflow_status text not null default 'self_review' check (workflow_status in ('self_review','manager_review','calibration','released','acknowledged')),
  add column reviewer_id uuid references public.employees(id),
  add column revision bigint not null default 0,
  add column self_submitted_at timestamptz,
  add column manager_submitted_at timestamptz,
  add column released_at timestamptz,
  add column acknowledged_at timestamptz,
  add column evidence_snapshot jsonb,
  add column development_plan jsonb not null default '[]',
  add column calibration jsonb,
  add column employee_response text;
-- Fail rather than silently delete any historical duplicate appraisal.
create unique index appraisals_cycle_employee_unique on public.appraisals(cycle_id, employee_id);
alter table public.goals add column appraisal_cycle_id uuid references public.appraisal_cycles(id);
alter table public.kpis add column appraisal_cycle_id uuid references public.appraisal_cycles(id),
  add column measure_direction text not null default 'higher' check(measure_direction in ('higher','lower'));
create index appraisal_goal_lookup on public.goals(appraisal_cycle_id, owner_id);
create index appraisal_kpi_lookup on public.kpis(appraisal_cycle_id, employee_id);
create table public.appraisal_peer_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  reviewer_id uuid not null references public.employees(id),
  submitted_at timestamptz,
  unique(appraisal_id,reviewer_id)
);
create table public.appraisal_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  cycle_id uuid not null references public.appraisal_cycles(id) on delete cascade,
  appraisal_id uuid references public.appraisals(id) on delete cascade,
  actor_id uuid references public.employees(id),
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index appraisal_events_lookup on public.appraisal_events(appraisal_id,created_at);
alter table public.appraisal_peer_assignments enable row level security;
alter table public.appraisal_events enable row level security;
-- Field-sensitive appraisal reads go through the authenticated API: a row-level
-- policy alone cannot hide draft manager notes from the subject of that row.
revoke all on public.appraisals, public.appraisal_peer_assignments, public.appraisal_events from anon, authenticated;
grant all on public.appraisals, public.appraisal_peer_assignments, public.appraisal_events to service_role;
-- Anonymous peer feedback is not exposed through direct browser table queries.
revoke all on public.peer_feedback from anon, authenticated;
grant all on public.peer_feedback to service_role;

create function public.guard_managed_appraisal_cycle() returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid() is not null and old.managed_review then
    raise exception 'Manage this appraisal cycle through the appraisal workspace.' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end; $$;
create trigger managed_appraisal_cycle_guard before update or delete on public.appraisal_cycles
for each row execute function public.guard_managed_appraisal_cycle();

create function public.appraisal_command(p_user uuid,p_action text,p_cycle uuid default null,p_appraisal uuid default null,
  p_revision bigint default 0,p_payload jsonb default '{}',p_snapshot jsonb default null)
returns jsonb language plpgsql set search_path=public as $$
declare
  actor public.employees%rowtype;
  cyc public.appraisal_cycles%rowtype;
  rec public.appraisals%rowtype;
  subject public.employees%rowtype;
  is_hr boolean;
  is_manager boolean;
  target uuid;
  assigned uuid;
  item jsonb;
  old_snapshot jsonb;
  new_id uuid;
begin
  select * into strict actor from public.employees where user_id=p_user;
  is_hr := actor.platform_role in ('hr_admin','super_admin');
  if p_action='create_cycle' then
    if not is_hr then raise exception 'HR access required.' using errcode='42501'; end if;
    if length(trim(p_payload->>'name')) < 3 or (p_payload->>'start_date')::date > (p_payload->>'end_date')::date
      or (p_payload->>'review_due_date')::date < (p_payload->>'end_date')::date then
      raise exception 'Check the cycle name and dates.' using errcode='22023'; end if;
    if exists(select 1 from public.appraisal_cycles where org_id=actor.org_id and lower(name)=lower(trim(p_payload->>'name'))) then
      raise exception 'Use a unique cycle name.' using errcode='22023'; end if;
    if (select sum(value::numeric) from jsonb_each_text(p_payload->'weights'))<>100
      or exists(select 1 from jsonb_each_text(p_payload->'weights') where value::numeric < 0 or value::numeric > 100)
      or not ((p_payload->'weights') ?& array['goal_achievement','report_consistency','kpi_performance','manager_assessment','peer_feedback']) then
      raise exception 'All five weights must be set and total 100.' using errcode='22023'; end if;
    insert into public.appraisal_cycles(org_id,name,start_date,end_date,status,weights,review_due_date,report_frequency,managed_review)
    values(actor.org_id,trim(p_payload->>'name'),(p_payload->>'start_date')::date,(p_payload->>'end_date')::date,'draft',p_payload->'weights',
      (p_payload->>'review_due_date')::date,p_payload->>'report_frequency',true) returning id into new_id;
    insert into public.appraisal_events(org_id,cycle_id,actor_id,action,payload) values(actor.org_id,new_id,actor.id,p_action,p_payload);
    return jsonb_build_object('cycleId',new_id);
  end if;
  select * into cyc from public.appraisal_cycles where id=p_cycle and org_id=actor.org_id for update;
  if not found then raise exception 'Cycle not found.' using errcode='42501'; end if;
  if p_action in ('enrol','activate','start_review','close_cycle') then
    if not is_hr then raise exception 'HR access required.' using errcode='42501'; end if;
    if cyc.revision<>p_revision then raise exception 'This cycle changed. Reload before continuing.' using errcode='40001'; end if;
    if p_action='enrol' then
      if cyc.status not in ('draft','active') then raise exception 'Enrol staff before the review period.' using errcode='22023'; end if;
      for item in select value from jsonb_array_elements(p_payload->'employees') loop
        target := (item->>'employeeId')::uuid;
        select * into subject from public.employees where id=target and org_id=actor.org_id;
        if not found then raise exception 'Employee belongs to another organisation.' using errcode='42501'; end if;
        assigned := coalesce(nullif(item->>'reviewerId','')::uuid,subject.line_manager_id);
        if assigned is null or assigned=target or not exists(select 1 from public.employees where id=assigned and org_id=actor.org_id) then
          raise exception 'Every participant needs a different reviewer in this organisation. Set reporting lines or choose a reviewer.' using errcode='22023'; end if;
        insert into public.appraisals(org_id,employee_id,cycle_id,reviewer_id) values(actor.org_id,target,cyc.id,assigned) on conflict(cycle_id,employee_id) do nothing;
      end loop;
    elsif p_action='activate' then
      if cyc.status<>'draft' or not exists(select 1 from public.appraisals where cycle_id=cyc.id) then raise exception 'Enrol participants in a draft cycle first.' using errcode='22023'; end if;
      update public.appraisal_cycles set status='active' where id=cyc.id;
    elsif p_action='start_review' then
      if cyc.status<>'active' or current_date<cyc.end_date then raise exception 'Start review after the performance period ends.' using errcode='22023'; end if;
      update public.appraisal_cycles set status='review' where id=cyc.id;
    else
      if cyc.status<>'review' or exists(select 1 from public.appraisals where cycle_id=cyc.id and workflow_status not in ('released','acknowledged')) then
        raise exception 'Release every appraisal before closing the cycle.' using errcode='22023'; end if;
      update public.appraisal_cycles set status='closed' where id=cyc.id;
    end if;
    update public.appraisal_cycles set managed_review=true,revision=revision+1 where id=cyc.id;
    insert into public.appraisal_events(org_id,cycle_id,actor_id,action,payload) values(actor.org_id,cyc.id,actor.id,p_action,p_payload);
    return jsonb_build_object('cycleId',cyc.id);
  end if;

  select * into rec from public.appraisals where id=p_appraisal and cycle_id=cyc.id and org_id=actor.org_id for update;
  if not found then raise exception 'Appraisal not found.' using errcode='42501'; end if;
  is_manager := rec.reviewer_id=actor.id and rec.employee_id<>actor.id;
  if p_action<>'peer_submit' and rec.revision<>p_revision then raise exception 'This review changed. Reload before continuing.' using errcode='40001'; end if;
  if p_action not in ('acknowledge','development') and cyc.status not in ('draft','active','review') then raise exception 'This cycle is closed.' using errcode='22023'; end if;
  old_snapshot := rec.evidence_snapshot;

  if p_action in ('self_save','self_submit') then
    if actor.id<>rec.employee_id or rec.workflow_status<>'self_review' or cyc.status not in ('active','review') then raise exception 'Self review is not open for this employee.' using errcode='42501'; end if;
    if p_action='self_submit' and (length(trim(p_payload->>'achievements'))<20 or length(trim(p_payload->>'challenges'))<10 or length(trim(p_payload->>'support'))<10) then
      raise exception 'Complete your achievements, challenges and support reflection.' using errcode='22023'; end if;
    update public.appraisals set self_assessment=p_payload,
      workflow_status=case when p_action='self_submit' then 'manager_review' else workflow_status end,
      self_submitted_at=case when p_action='self_submit' then now() else self_submitted_at end where id=rec.id;
  elsif p_action in ('manager_save','manager_submit') then
    if not is_manager or rec.workflow_status<>'manager_review' or cyc.status not in ('active','review') then raise exception 'Only the assigned reviewer can assess this employee after their self review.' using errcode='42501'; end if;
    if p_action='manager_submit' then
      if cyc.status<>'review' then raise exception 'HR must open the review period before manager sign-off.' using errcode='22023'; end if;
      if p_snapshot is null or coalesce((p_snapshot->>'ready')::boolean,false)=false or p_snapshot->>'cycleId'<>cyc.id::text
        or length(trim(p_payload->>'notes'))<20 or jsonb_array_length(p_payload->'ratings')<>5 or jsonb_array_length(p_payload->'development')<1 then
        raise exception 'Complete the manager rubric, evidence and development plan before sign-off.' using errcode='22023'; end if;
    end if;
    update public.appraisals set manager_assessment=p_payload,
      workflow_status=case when p_action='manager_submit' then 'calibration' else workflow_status end,
      manager_submitted_at=case when p_action='manager_submit' then now() else manager_submitted_at end,
      evidence_snapshot=case when p_action='manager_submit' then p_snapshot else evidence_snapshot end,
      development_plan=coalesce(p_payload->'development','[]'),
      total_score=case when p_action='manager_submit' then (p_snapshot->>'total')::numeric else total_score end,
      manager_agreed=case when p_action='manager_submit' then true else manager_agreed end where id=rec.id;
    if p_action='manager_submit' then
      update public.appraisals set
        goal_achievement_score=(select (v->>'score')::numeric from jsonb_array_elements(p_snapshot->'components') v where v->>'key'='goal_achievement'),
        report_consistency_score=(select (v->>'score')::numeric from jsonb_array_elements(p_snapshot->'components') v where v->>'key'='report_consistency'),
        kpi_performance_score=(select (v->>'score')::numeric from jsonb_array_elements(p_snapshot->'components') v where v->>'key'='kpi_performance'),
        manager_assessment_score=(select (v->>'score')::numeric from jsonb_array_elements(p_snapshot->'components') v where v->>'key'='manager_assessment'),
        peer_feedback_score=(select (v->>'score')::numeric from jsonb_array_elements(p_snapshot->'components') v where v->>'key'='peer_feedback') where id=rec.id;
    end if;
  elsif p_action='release' then
    if not is_hr or rec.employee_id=actor.id or rec.reviewer_id=actor.id or rec.workflow_status<>'calibration' or cyc.status<>'review' then raise exception 'An independent HR reviewer must release this appraisal.' using errcode='42501'; end if;
    if rec.evidence_snapshot is null or not (rec.evidence_snapshot->>'ready')::boolean or rec.total_score is null
      or coalesce((p_payload->>'rating')::integer,0) not between 1 and 5 or length(trim(p_payload->>'rationale'))<20 then
      raise exception 'Choose a final rating and record a calibration rationale.' using errcode='22023'; end if;
    update public.appraisals set calibration=p_payload,hr_confirmed=true,workflow_status='released',released_at=now(),status='completed' where id=rec.id;
  elsif p_action in ('return_to_employee','return_to_manager') then
    if length(trim(p_payload->>'reason'))<10 then raise exception 'Give a clear reason for returning this review.' using errcode='22023'; end if;
    if p_action='return_to_employee' then
      if not is_manager or rec.workflow_status<>'manager_review' then raise exception 'Only the reviewer can request a revised self review.' using errcode='42501'; end if;
      update public.appraisals set workflow_status='self_review',self_submitted_at=null,manager_assessment=null where id=rec.id;
    else
      if not is_hr or rec.employee_id=actor.id or rec.reviewer_id=actor.id or rec.workflow_status<>'calibration' then raise exception 'Only independent HR can return a calibration.' using errcode='42501'; end if;
      update public.appraisals set workflow_status='manager_review',manager_submitted_at=null,evidence_snapshot=null,total_score=null where id=rec.id;
    end if;
  elsif p_action='assign_reviewer' then
    assigned := (p_payload->>'reviewerId')::uuid;
    if not is_hr or rec.workflow_status not in ('self_review','manager_review') or assigned=rec.employee_id
      or not exists(select 1 from public.employees where id=assigned and org_id=actor.org_id) then raise exception 'Choose an eligible reviewer before manager sign-off.' using errcode='42501'; end if;
    update public.appraisals set reviewer_id=assigned,manager_assessment=null where id=rec.id;
  elsif p_action='assign_peers' then
    if not (is_hr or is_manager) or rec.employee_id=actor.id or rec.workflow_status not in ('self_review','manager_review') then raise exception 'Peer assignments are locked or not permitted.' using errcode='42501'; end if;
    for item in select value from jsonb_array_elements(p_payload->'reviewerIds') loop
      assigned := (item #>> '{}')::uuid;
      if assigned in (rec.employee_id,rec.reviewer_id) or not exists(select 1 from public.employees where id=assigned and org_id=actor.org_id) then raise exception 'Peers must be other employees in this organisation.' using errcode='22023'; end if;
      insert into public.appraisal_peer_assignments(org_id,appraisal_id,reviewer_id) values(actor.org_id,rec.id,assigned) on conflict do nothing;
    end loop;
  elsif p_action='peer_submit' then
    if rec.workflow_status not in ('self_review','manager_review') or cyc.status not in ('active','review')
      or actor.id in (rec.employee_id,rec.reviewer_id) then raise exception 'Peer feedback is closed.' using errcode='42501'; end if;
    if not exists(select 1 from public.appraisal_peer_assignments where appraisal_id=rec.id and reviewer_id=actor.id and submitted_at is null for update) then raise exception 'No open peer assignment.' using errcode='42501'; end if;
    if coalesce((p_payload->>'rating')::integer,0) not between 1 and 5 then raise exception 'Choose a rating from 1 to 5.' using errcode='22023'; end if;
    insert into public.peer_feedback(cycle_id,reviewer_id,reviewee_id,rating,comment,is_anonymous)
      values(cyc.id,actor.id,rec.employee_id,(p_payload->>'rating')::integer,nullif(p_payload->>'comment',''),true);
    update public.appraisal_peer_assignments set submitted_at=now() where appraisal_id=rec.id and reviewer_id=actor.id;
  elsif p_action='acknowledge' then
    if actor.id<>rec.employee_id or rec.workflow_status<>'released' then raise exception 'Only the employee can acknowledge a released review.' using errcode='42501'; end if;
    update public.appraisals set workflow_status='acknowledged',employee_response=p_payload->>'response',acknowledged_at=now() where id=rec.id;
  elsif p_action='development' then
    if not (is_manager or actor.id=rec.employee_id) or rec.workflow_status not in ('released','acknowledged') then raise exception 'Development actions open after release.' using errcode='42501'; end if;
    if coalesce((p_payload->>'index')::integer,-1)<0 or (p_payload->>'index')::integer>=jsonb_array_length(rec.development_plan)
      or p_payload->>'status' not in ('planned','in_progress','complete') then raise exception 'Invalid development action.' using errcode='22023'; end if;
    update public.appraisals set development_plan=jsonb_set(development_plan,array[p_payload->>'index','status'],to_jsonb(p_payload->>'status')) where id=rec.id;
  elsif p_action in ('add_goal','add_kpi','link_goal','link_kpi','update_kpi') then
    if not (is_hr or is_manager) or rec.employee_id=actor.id or rec.workflow_status not in ('self_review','manager_review') then raise exception 'Evidence changes require the reviewer or HR before sign-off.' using errcode='42501'; end if;
    if p_action='add_goal' then
      insert into public.goals(org_id,owner_id,created_by,title,goal_type,weight,percent_complete,due_date,start_date,cycle,appraisal_cycle_id)
      values(actor.org_id,rec.employee_id,actor.id,p_payload->>'title','individual',(p_payload->>'weight')::integer,(p_payload->>'progress')::integer,cyc.end_date,cyc.start_date,cyc.name,cyc.id);
    elsif p_action='add_kpi' then
      insert into public.kpis(org_id,employee_id,name,target_value,current_value,unit,weight,cycle,appraisal_cycle_id,measure_direction)
      values(actor.org_id,rec.employee_id,p_payload->>'title',(p_payload->>'target')::numeric,(p_payload->>'actual')::numeric,p_payload->>'unit',(p_payload->>'weight')::integer,cyc.name,cyc.id,p_payload->>'direction');
    elsif p_action='link_goal' then
      update public.goals set appraisal_cycle_id=cyc.id where id=(p_payload->>'id')::uuid and org_id=actor.org_id and owner_id=rec.employee_id and appraisal_cycle_id is null;
      if not found then raise exception 'Goal not available for this employee.' using errcode='42501'; end if;
    elsif p_action='link_kpi' then
      update public.kpis set appraisal_cycle_id=cyc.id where id=(p_payload->>'id')::uuid and org_id=actor.org_id and employee_id=rec.employee_id and appraisal_cycle_id is null;
      if not found then raise exception 'KPI not available for this employee.' using errcode='42501'; end if;
    else
      if length(trim(p_payload->>'reason'))<10 then raise exception 'Record the evidence for this KPI update.' using errcode='22023'; end if;
      update public.kpis set current_value=(p_payload->>'actual')::numeric where id=(p_payload->>'id')::uuid and org_id=actor.org_id and employee_id=rec.employee_id and appraisal_cycle_id=cyc.id;
      if not found then raise exception 'KPI not linked to this review.' using errcode='42501'; end if;
    end if;
  else raise exception 'Unknown appraisal action.' using errcode='22023';
  end if;
  update public.appraisals set revision=revision+1,updated_at=now() where id=rec.id;
  insert into public.appraisal_events(org_id,cycle_id,appraisal_id,actor_id,action,payload)
    values(actor.org_id,cyc.id,rec.id,actor.id,p_action,
      case when p_action='peer_submit' then '{}'::jsonb else p_payload end ||
      case when p_action='return_to_manager' then jsonb_build_object('previousSnapshot',old_snapshot) else '{}'::jsonb end);
  return jsonb_build_object('appraisalId',rec.id,'revision',rec.revision+1);
end; $$;
revoke all on function public.appraisal_command(uuid,text,uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.appraisal_command(uuid,text,uuid,uuid,bigint,jsonb,jsonb) to service_role;
-- The legacy security-definer calculator ignored manager/peer evidence. It is
-- no longer a public scoring endpoint; the new API owns score generation.
do $$ begin
  if to_regprocedure('public.calculate_appraisal_score(uuid,uuid)') is not null then
    revoke all on function public.calculate_appraisal_score(uuid,uuid) from public,anon,authenticated;
  end if;
end $$;

COMMIT;
