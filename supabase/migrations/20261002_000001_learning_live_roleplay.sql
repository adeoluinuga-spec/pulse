-- LIVE ROLE-PLAY, AND MATERIAL FILES
--
-- 1. A role-play can now be acted out rather than typed.
--
--    The written mode stays: people take ordered turns in the browser, which
--    works when they cannot meet. A live role-play is the facilitated version —
--    two people act the scenario out in the room or on a call, an observer
--    watches, and then each of them writes their own account of it afterwards.
--    Comparing those accounts is the point: one person believing they listened
--    while the other felt interrupted is the coaching material.
--
--    So `learning_save` now accepts a role-play activity when it is live and the
--    person saving is in one of its groups. It still refuses a written
--    role-play, where answers belong in the turn-by-turn conversation.
--
-- 2. Material files: a tenant-scoped record of what was uploaded for an
--    activity. The file itself lives in private storage; only the server hands
--    out short-lived links, and only to a trainee whose own link is still good.

create table if not exists public.learning_files (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null,
  activity_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 300),
  -- Where the bytes are in the private bucket. Never shown to a trainee.
  path text not null unique,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  uploaded_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (activity_id, cohort_id) references public.learning_activities(id, cohort_id) on delete cascade
);

create index if not exists learning_files_activity on public.learning_files(activity_id, created_at);

alter table public.learning_files enable row level security;
revoke all on public.learning_files from anon, authenticated;
grant all on public.learning_files to service_role;

create or replace function public.learning_save(p_hash text, p_activity uuid, p_payload jsonb, p_draft boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t learning_trainees;
  a learning_activities;
  c learning_cohorts;
  s learning_submissions;
  live boolean;
begin
  select * into t from learning_trainees where token_hash = p_hash and revoked_at is null and expires_at > now() for share;
  if t.id is null then raise exception 'This link is no longer active.'; end if;
  select * into c from learning_cohorts where id = t.cohort_id and status = 'active' for share;
  select * into a from learning_activities where id = p_activity and cohort_id = t.cohort_id and released for share;
  if c.id is null or a.id is null then raise exception 'This activity is not open.'; end if;

  live := a.type = 'roleplay' and a.config->>'mode' = 'live';

  -- A written role-play is answered by taking turns, not by saving a form.
  if a.type = 'roleplay' and not live then raise exception 'This activity is not open.'; end if;

  -- Feedback on a live role-play belongs to the people who were in it.
  if live and not exists (
    select 1 from learning_room_members m
    join learning_rooms r on r.id = m.room_id
    where m.trainee_id = t.id and r.activity_id = a.id
  ) then
    raise exception 'You are not in a group for this role-play.';
  end if;

  insert into learning_submissions(cohort_id, trainee_id, activity_id, payload, status, submitted_at)
  values (t.cohort_id, t.id, a.id, p_payload, case when p_draft then 'draft' else 'submitted' end, case when p_draft then null else now() end)
  on conflict (trainee_id, activity_id) do update
    set payload = excluded.payload, status = excluded.status, submitted_at = excluded.submitted_at, updated_at = now()
  returning * into s;
  return to_jsonb(s);
end $$;

revoke all on function public.learning_save(text, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.learning_save(text, uuid, jsonb, boolean) to service_role;
