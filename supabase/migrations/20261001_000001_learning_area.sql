-- Learning is tenant-owned. It has no foreign keys or reads linking to anonymous surveys.
begin;
create table public.learning_cohorts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (length(name) between 2 and 200),
  client_name text not null check (length(client_name) between 2 and 200),
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index learning_cohorts_org on public.learning_cohorts(org_id);
create table public.learning_trainees (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.learning_cohorts(id) on delete cascade,
  display_name text not null,
  email text,
  token_hash text not null unique,
  token_ciphertext text not null,
  expires_at timestamptz not null default now() + interval '180 days',
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id, cohort_id)
);
create unique index learning_trainee_email on public.learning_trainees(cohort_id, lower(email)) where email is not null;
create index learning_trainees_cohort on public.learning_trainees(cohort_id);
create table public.learning_activities (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.learning_cohorts(id) on delete cascade,
  position integer not null default 0,
  type text not null check (type in ('content','form','roleplay')),
  title text not null,
  summary text,
  config jsonb not null,
  released boolean not null default false,
  created_at timestamptz not null default now(),
  unique(id, cohort_id)
);
create index learning_activity_order on public.learning_activities(cohort_id, position, id);
create table public.learning_submissions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  trainee_id uuid not null,
  activity_id uuid not null,
  payload jsonb not null default '{}',
  status text not null check (status in ('draft','submitted')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key(trainee_id,cohort_id) references public.learning_trainees(id,cohort_id) on delete cascade,
  foreign key(activity_id,cohort_id) references public.learning_activities(id,cohort_id) on delete cascade,
  unique(trainee_id,activity_id)
);
create index learning_submissions_activity on public.learning_submissions(activity_id);
create table public.learning_rooms (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  activity_id uuid not null,
  name text not null,
  status text not null default 'active' check (status in ('active','completed')),
  turn_number integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key(activity_id,cohort_id) references public.learning_activities(id,cohort_id) on delete cascade,
  unique(id,activity_id,cohort_id)
);
create table public.learning_room_members (
  room_id uuid not null,
  activity_id uuid not null,
  cohort_id uuid not null,
  trainee_id uuid not null,
  role_name text not null,
  seat integer not null check (seat >= -1), -- -1 is an observer, not a player turn
  foreign key(room_id,activity_id,cohort_id) references public.learning_rooms(id,activity_id,cohort_id) on delete cascade,
  foreign key(trainee_id,cohort_id) references public.learning_trainees(id,cohort_id) on delete cascade,
  primary key(room_id,trainee_id),
  unique(activity_id,trainee_id)
);
create table public.learning_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  trainee_id uuid not null,
  body text not null check (length(body) between 1 and 4000),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(room_id,trainee_id) references public.learning_room_members(room_id,trainee_id) on delete cascade,
  unique(trainee_id,request_id)
);
create index learning_messages_room on public.learning_messages(room_id,created_at,id);
-- Only a short-lived keyed digest is retained, never an IP address.
create table public.learning_request_limits (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);

do $$ declare t text; begin
  foreach t in array array['learning_cohorts','learning_trainees','learning_activities','learning_submissions','learning_rooms','learning_room_members','learning_messages','learning_request_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create function public.learning_rate_limit(p_key text,p_max integer default 90) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from learning_request_limits where expires_at < now();
  insert into learning_request_limits(key,hits,expires_at) values(p_key,1,now()+interval '1 minute')
  on conflict(key) do update set hits=learning_request_limits.hits+1 returning hits into n;
  return n <= least(greatest(p_max,1),3000);
end $$;

-- Revalidate link, release and cohort state in the same transaction as the write.
create function public.learning_save(p_hash text,p_activity uuid,p_payload jsonb,p_draft boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t learning_trainees; a learning_activities; c learning_cohorts; s learning_submissions;
begin
  select * into t from learning_trainees where token_hash=p_hash and revoked_at is null and expires_at>now() for share;
  if t.id is null then raise exception 'This link is no longer active.'; end if;
  select * into c from learning_cohorts where id=t.cohort_id and status='active' for share;
  select * into a from learning_activities where id=p_activity and cohort_id=t.cohort_id and released for share;
  if c.id is null or a.id is null or a.type='roleplay' then raise exception 'This activity is not open.'; end if;
  insert into learning_submissions(cohort_id,trainee_id,activity_id,payload,status,submitted_at)
  values(t.cohort_id,t.id,a.id,p_payload,case when p_draft then 'draft' else 'submitted' end,case when p_draft then null else now() end)
  on conflict(trainee_id,activity_id) do update set payload=excluded.payload,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now()
  returning * into s;
  return to_jsonb(s);
end $$;

create function public.learning_create_room(p_cohort uuid,p_activity uuid,p_name text,p_members jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a learning_activities; rid uuid; roles integer; players integer; m jsonb;
begin
  select * into a from learning_activities where id=p_activity and cohort_id=p_cohort and type='roleplay' for share;
  if a.id is null then raise exception 'Choose a role-play activity.'; end if;
  roles := jsonb_array_length(a.config->'roles');
  if jsonb_typeof(p_members)<>'array' or jsonb_array_length(p_members) not between roles and roles+1 then raise exception 'Assign every role and at most one observer.'; end if;
  select count(distinct (x->>'seat')::integer) into players from jsonb_array_elements(p_members) x where (x->>'seat')::integer between 0 and roles-1;
  if players<>roles then raise exception 'Assign every role once.'; end if;
  insert into learning_rooms(cohort_id,activity_id,name) values(p_cohort,p_activity,p_name) returning id into rid;
  for m in select * from jsonb_array_elements(p_members) loop
    if (m->>'seat')::integer not between -1 and roles-1 then raise exception 'Invalid role.'; end if;
    insert into learning_room_members(room_id,activity_id,cohort_id,trainee_id,seat,role_name)
    values(rid,p_activity,p_cohort,(m->>'traineeId')::uuid,(m->>'seat')::integer,
      case when (m->>'seat')::integer=-1 then 'Observer' else a.config->'roles'->>((m->>'seat')::integer) end);
  end loop;
  return rid;
end $$;

create function public.learning_speak(p_hash text,p_room uuid,p_body text,p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t learning_trainees; r learning_rooms; m learning_room_members; a learning_activities; c learning_cohorts; total integer; existing uuid;
begin
  select * into t from learning_trainees where token_hash=p_hash and revoked_at is null and expires_at>now() for share;
  if t.id is null then raise exception 'This link is no longer active.'; end if;
  select * into c from learning_cohorts where id=t.cohort_id and status='active' for share;
  select * into r from learning_rooms where id=p_room and cohort_id=t.cohort_id for update;
  if c.id is null or r.id is null then raise exception 'This group is not available.'; end if;
  select * into a from learning_activities where id=r.activity_id and released for share;
  select * into m from learning_room_members where room_id=r.id and trainee_id=t.id;
  if a.id is null or m.trainee_id is null then raise exception 'This role-play is not available.'; end if;
  select id into existing from learning_messages where trainee_id=t.id and request_id=p_request;
  if existing is not null then return jsonb_build_object('saved',true); end if;
  if r.status<>'active' and m.seat>=0 then raise exception 'This role-play has finished.'; end if;
  total := jsonb_array_length(a.config->'roles');
  if m.seat>=0 and m.seat<>r.turn_number % total then raise exception 'Wait for your turn.'; end if;
  if length(trim(p_body)) not between 1 and 4000 then raise exception 'Write a response of up to 4,000 characters.'; end if;
  insert into learning_messages(room_id,trainee_id,body,request_id) values(r.id,t.id,trim(p_body),p_request);
  if m.seat>=0 then
    update learning_rooms set turn_number=turn_number+1,
      status=case when turn_number+1>=total*(a.config->>'rounds')::integer then 'completed' else 'active' end where id=r.id;
  end if;
  return jsonb_build_object('saved',true);
end $$;

create function public.learning_reorder(p_cohort uuid,p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform id from learning_cohorts where id=p_cohort for update;
  select count(*) into n from learning_activities where cohort_id=p_cohort;
  if cardinality(p_ids)<>n or (select count(distinct x) from unnest(p_ids) x)<>n
     or exists(select 1 from unnest(p_ids) x where not exists(select 1 from learning_activities where id=x and cohort_id=p_cohort)) then
    raise exception 'Activity list changed.';
  end if;
  update learning_activities a set position=o.ordinality::integer
  from unnest(p_ids) with ordinality o(id,ordinality) where a.id=o.id and a.cohort_id=p_cohort;
end $$;

create function public.learning_protect_activity() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op='DELETE' and not exists(select 1 from learning_cohorts where id=old.cohort_id) then return old; end if;
  if tg_op='UPDATE' and new.config is not distinct from old.config and new.type=old.type then return new; end if;
  if exists(select 1 from learning_submissions where activity_id=old.id) or exists(select 1 from learning_rooms where activity_id=old.id) then
    raise exception 'An activity with work attached cannot be changed or deleted.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger learning_protect_activity before update or delete on public.learning_activities for each row execute function public.learning_protect_activity();
revoke all on function public.learning_rate_limit(text,integer),public.learning_save(text,uuid,jsonb,boolean),public.learning_create_room(uuid,uuid,text,jsonb),public.learning_speak(text,uuid,text,uuid),public.learning_reorder(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.learning_rate_limit(text,integer),public.learning_save(text,uuid,jsonb,boolean),public.learning_create_room(uuid,uuid,text,jsonb),public.learning_speak(text,uuid,text,uuid),public.learning_reorder(uuid,uuid[]) to service_role;
commit;
