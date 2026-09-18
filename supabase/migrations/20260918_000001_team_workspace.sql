-- TEAM WORKSPACE: real chat, and escalations and tasks behind the server
--
-- The Team page used to show a demo company's people, messages and
-- escalations to every real user. It now reads and writes through
-- /api/team/*, which works out from the published org chart who is on whose
-- team, and this migration gives it somewhere to keep what it writes.
--
-- 1. team_messages: team, department and direct-message chat. Closed to the
--    browser roles entirely; the server decides channel membership from the
--    org chart on every read and write.
--
-- 2. escalations: closed to the browser roles. The old select policy let the
--    assigned manager read `raised_by` on an anonymous escalation straight
--    from the table, and the insert policy accepted an anonymous row naming
--    anybody as the raiser. Both are the kind of thing only the server can
--    get right, so only the server touches the table now. Adds resolved_at.
--
-- 3. tasks: browsers keep read access (own, managed, HR) but lose writes,
--    which now go through the server so that "you may only task somebody in
--    your reporting line" is enforced somewhere that cannot be skipped.
--
-- No existing rows are changed. There were no escalations or tasks when this
-- was written.

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  channel text not null check (channel ~ '^(team:[0-9a-f-]{36}|department:.+|dm:[0-9a-f-]{36}:[0-9a-f-]{36})$'),
  sender_id uuid not null references public.employees(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel on public.team_messages (org_id, channel, created_at desc);
create index if not exists team_messages_direct on public.team_messages (org_id, created_at desc) where channel like 'dm:%';

alter table public.team_messages enable row level security;
revoke all on public.team_messages from anon, authenticated;
grant all on public.team_messages to service_role;

alter table public.escalations add column if not exists resolved_at timestamptz;
revoke all on public.escalations from anon, authenticated;
grant all on public.escalations to service_role;

revoke insert, update, delete on public.tasks from anon, authenticated;
grant all on public.tasks to service_role;
