-- Organisation structure editor schema.
--
-- DOCUMENTATION / SQL-EDITOR COPY. The applied migration is:
--   supabase/migrations/20260909_000001_organisation_structure.sql
--   supabase/migrations/20260909_000002_vacant_position_reporting.sql
--
-- This file mirrors that migration for operators who need to run it directly
-- in the Supabase SQL Editor. Future changes must be new migrations first.

BEGIN;
-- Visual organisation editor. Publishing is one transaction, including the
-- live employee fields consumed by dashboards, 360 and report access checks.
create table public.organisation_structures (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  draft jsonb not null,
  roster_baseline jsonb not null default '[]',
  revision bigint not null default 0,
  published jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.organisation_structure_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  revision bigint not null,
  document jsonb not null,
  previous_roster jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique(org_id, revision)
);
alter table public.organisation_structures enable row level security;
alter table public.organisation_structure_versions enable row level security;
create policy organisation_structure_hr_read on public.organisation_structures for select to authenticated
using (exists (select 1 from public.employees e where e.user_id = auth.uid()
  and e.org_id = organisation_structures.org_id and e.platform_role in ('hr_admin', 'super_admin')));
create policy organisation_structure_history_hr_read on public.organisation_structure_versions for select to authenticated
using (exists (select 1 from public.employees e where e.user_id = auth.uid()
  and e.org_id = organisation_structure_versions.org_id and e.platform_role in ('hr_admin', 'super_admin')));
-- No browser writes. The service-only transaction below is the write boundary.
revoke all on public.organisation_structures, public.organisation_structure_versions from anon, authenticated;
grant select on public.organisation_structures, public.organisation_structure_versions to authenticated;
grant all on public.organisation_structures, public.organisation_structure_versions to service_role;

create function public.organisation_structure_roster(p_org uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'email', email, 'role', role,
    'department', department, 'team', team,
    'line_manager_id', line_manager_id, 'people_responsibility', people_responsibility
  ) order by id), '[]'::jsonb) from public.employees where org_id = p_org;
$$;
revoke all on function public.organisation_structure_roster(uuid) from public, anon, authenticated;
grant execute on function public.organisation_structure_roster(uuid) to service_role;

-- An employee beneath a vacant position operationally reports to the first
-- occupied ancestor. With one vacancy, this is their grandparent.
create function public.organisation_structure_effective_manager(
  p_positions jsonb,
  p_parent_id text
) returns uuid
language sql stable set search_path = public as $$
  with recursive ancestors as (
    select n->>'id' as id, n->>'parentId' as parent_id, nullif(n->>'employeeId', '') as employee_id, 1 as depth
    from jsonb_array_elements(p_positions) n
    where n->>'id' = p_parent_id
    union all
    select n->>'id', n->>'parentId', nullif(n->>'employeeId', ''), a.depth + 1
    from ancestors a
    join jsonb_array_elements(p_positions) n on n->>'id' = a.parent_id
    where a.parent_id is not null and a.depth < 1000
  )
  select employee_id::uuid from ancestors where employee_id is not null order by depth limit 1;
$$;
revoke all on function public.organisation_structure_effective_manager(jsonb, text) from public, anon, authenticated;
grant execute on function public.organisation_structure_effective_manager(jsonb, text) to service_role;

create function public.save_organisation_structure(
  p_org uuid, p_user uuid, p_revision bigint, p_document jsonb,
  p_roster_baseline jsonb, p_publish boolean default false
) returns jsonb
language plpgsql set search_path = public as $$
declare
  current_row public.organisation_structures%rowtype;
  current_roster jsonb;
  positions jsonb;
  next_revision bigint;
begin
  if not exists (select 1 from public.employees where user_id = p_user and org_id = p_org
    and platform_role in ('hr_admin', 'super_admin')) then
    raise exception 'Only this organisation''s HR administrators can edit its structure.' using errcode = '42501';
  end if;
  if p_document->>'schemaVersion' is distinct from '1'
    or coalesce(p_document->>'theme', '') not in ('cobalt','forest','slate')
    or coalesce(p_document->>'layout', '') not in ('vertical','horizontal')
    or jsonb_typeof(p_document->'positions') is distinct from 'array'
    or jsonb_typeof(p_roster_baseline) is distinct from 'array' then
    raise exception 'Invalid structure document.' using errcode = '22023';
  end if;
  positions := p_document->'positions';
  if jsonb_array_length(positions) > 1000 then
    raise exception 'Use at most 1000 positions.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(positions) n
    where coalesce(n->>'id','') !~ '^[a-zA-Z0-9_-]{1,100}$'
    or coalesce(trim(n->>'title'),'') = '' or length(n->>'title') > 160
    or length(n->>'department') > 120 or length(n->>'team') > 120
    or jsonb_typeof(n->'department') is distinct from 'string'
    or jsonb_typeof(n->'team') is distinct from 'string'
    or not (n ? 'parentId') or not (n ? 'employeeId')
    or coalesce(n->>'responsibility','') not in ('none','team_lead','manager','senior_manager','director')) then
    raise exception 'Invalid position settings.' using errcode = '22023';
  end if;
  if exists (select n->>'id' from jsonb_array_elements(positions) n group by 1 having count(*) > 1)
    or exists (select n->>'employeeId' from jsonb_array_elements(positions) n
      where n->>'employeeId' is not null group by 1 having count(*) > 1) then
    raise exception 'Each position and employee can appear only once.' using errcode = '22023';
  end if;

  -- Serialise initial saves as well as subsequent edits with optimistic revision checks.
  insert into public.organisation_structures(org_id, draft, roster_baseline)
    values(p_org, p_document, p_roster_baseline) on conflict (org_id) do nothing;
  select * into current_row from public.organisation_structures where org_id = p_org for update;
  if current_row.revision is distinct from p_revision then
    raise exception 'Another HR user saved this structure. Reload before making further changes.' using errcode = '40001';
  end if;

  -- Brief table lock prevents roster edits/imports racing the atomic publish.
  -- Draft saves never take this lock or update employees.
  if p_publish then lock table public.employees in share row exclusive mode; end if;
  current_roster := public.organisation_structure_roster(p_org);
  if p_publish and current_roster is distinct from p_roster_baseline then
    raise exception 'Staff records changed since this draft began. Reload and use the live structure before publishing.' using errcode = '40001';
  end if;
  if exists (select 1 from jsonb_array_elements(positions) n where n->>'employeeId' is not null
    and not exists (select 1 from public.employees e where e.id::text = n->>'employeeId' and e.org_id = p_org)) then
    raise exception 'An assigned employee does not belong to this organisation.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(positions) n where n->>'parentId' is not null
    and not exists (select 1 from jsonb_array_elements(positions) parent where parent->>'id' = n->>'parentId')) then
    raise exception 'A reporting position does not exist.' using errcode = '22023';
  end if;
  if exists (
    with recursive graph as (
      select n->>'id' as id, n->>'parentId' as parent_id from jsonb_array_elements(positions) n
    ), walk as (
      select id, parent_id, array[id] as path, false as cycle from graph
      union all
      select g.id, g.parent_id, w.path || g.id, g.id = any(w.path)
      from walk w join graph g on g.id = w.parent_id where not w.cycle
    ) select 1 from walk where cycle
  ) then raise exception 'Reporting lines contain a loop.' using errcode = '22023'; end if;

  next_revision := current_row.revision + 1;
  if p_publish then
    if jsonb_array_length(current_roster) = 0 or exists (
      select 1 from public.employees e where e.org_id = p_org and not exists (
        select 1 from jsonb_array_elements(positions) n where n->>'employeeId' = e.id::text
      )
    ) then raise exception 'Place all existing staff before publishing.' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(positions) n where n->>'employeeId' is not null and
      (trim(n->>'department') = '' or (n->>'parentId' is not null and
        public.organisation_structure_effective_manager(positions, n->>'parentId') is null))) then
      raise exception 'Every assigned position needs a department and an occupied reporting position above it, or must be a top-level position.' using errcode = '22023';
    end if;
    update public.employees e set
      role = n->>'title', department = nullif(n->>'department',''), team = nullif(n->>'team',''),
      line_manager_id = public.organisation_structure_effective_manager(positions, n->>'parentId'),
      people_responsibility = case when n->>'responsibility' = 'none' and exists (
        select 1 from jsonb_array_elements(positions) child where child->>'parentId' = n->>'id' and child->>'employeeId' is not null
      ) then 'manager' else n->>'responsibility' end
    from jsonb_array_elements(positions) n where e.id::text = n->>'employeeId' and e.org_id = p_org;
    insert into public.organisation_structure_versions(org_id, revision, document, previous_roster, published_by)
      values(p_org, next_revision, p_document, current_roster, p_user);
    update public.organisation_structures set published = p_document, published_at = now(), published_by = p_user where org_id = p_org;
    p_roster_baseline := public.organisation_structure_roster(p_org);
  end if;
  update public.organisation_structures set draft = p_document, roster_baseline = p_roster_baseline,
    revision = next_revision, updated_at = now() where org_id = p_org;
  return jsonb_build_object('revision', next_revision, 'published', p_publish);
end;
$$;
revoke all on function public.save_organisation_structure(uuid,uuid,bigint,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_organisation_structure(uuid,uuid,bigint,jsonb,jsonb,boolean) to service_role;
COMMIT;
