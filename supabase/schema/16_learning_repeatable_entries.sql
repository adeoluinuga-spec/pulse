-- Preserve legacy one-response forms; repeatable forms use independent entry IDs.
begin;
alter table public.learning_submissions add column entry_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.learning_submissions drop constraint learning_submissions_trainee_id_activity_id_key;
alter table public.learning_submissions add constraint learning_submission_entry unique(trainee_id, activity_id, entry_id);

create function public.learning_save_entry(p_hash text, p_activity uuid, p_payload jsonb, p_draft boolean, p_entry uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t learning_trainees;
  a learning_activities;
  c learning_cohorts;
  s learning_submissions;
  live boolean;
  repeatable boolean;
begin
  select * into t from learning_trainees where token_hash = p_hash and revoked_at is null and expires_at > now() for share;
  if t.id is null then raise exception 'This link is no longer active.'; end if;
  select * into c from learning_cohorts where id = t.cohort_id and status = 'active' for share;
  select * into a from learning_activities where id = p_activity and cohort_id = t.cohort_id and released for share;
  if c.id is null or a.id is null then raise exception 'This activity is not open.'; end if;
  live := a.type = 'roleplay' and a.config->>'mode' = 'live';
  if a.type = 'roleplay' and not live then raise exception 'This activity is not open.'; end if;
  if live and not exists (
    select 1 from learning_room_members m join learning_rooms r on r.id = m.room_id
    where m.trainee_id = t.id and r.activity_id = a.id
  ) then raise exception 'You are not in a group for this role-play.'; end if;
  repeatable := a.type = 'form' and coalesce(a.config->>'repeatable', 'false') = 'true';
  if p_entry is null or (repeatable and p_entry = '00000000-0000-0000-0000-000000000000')
    or (not repeatable and p_entry <> '00000000-0000-0000-0000-000000000000') then
    raise exception 'Choose a valid entry for this activity.';
  end if;
  insert into learning_submissions(cohort_id, trainee_id, activity_id, entry_id, payload, status, submitted_at)
  values (t.cohort_id, t.id, a.id, p_entry, p_payload, case when p_draft then 'draft' else 'submitted' end, case when p_draft then null else now() end)
  on conflict (trainee_id, activity_id, entry_id) do update
    set payload = excluded.payload, status = excluded.status, submitted_at = excluded.submitted_at, updated_at = now()
    -- Submitted journal entries are immutable. A retry returns the original below.
    where not repeatable or learning_submissions.status = 'draft'
  returning * into s;
  if s.id is null then
    select * into s from learning_submissions where trainee_id = t.id and activity_id = a.id and entry_id = p_entry;
  end if;
  return to_jsonb(s);
end $$;
revoke all on function public.learning_save_entry(text, uuid, jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function public.learning_save_entry(text, uuid, jsonb, boolean, uuid) to service_role;

-- Retain the original signature for existing callers during rollout.
create or replace function public.learning_save(p_hash text, p_activity uuid, p_payload jsonb, p_draft boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public.learning_save_entry(p_hash, p_activity, p_payload, p_draft, '00000000-0000-0000-0000-000000000000'::uuid);
$$;
revoke all on function public.learning_save(text, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.learning_save(text, uuid, jsonb, boolean) to service_role;
commit;
