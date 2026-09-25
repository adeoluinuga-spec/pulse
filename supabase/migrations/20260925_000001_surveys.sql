-- ANONYMOUS STAFF SURVEYS
--
-- A baseline survey is a different shape from a 360. A 360 knows who rates
-- whom — that is what its reports are built on. A survey must not: one link,
-- no accounts, no tokens, and no way back from an answer to a person.
--
-- What is deliberately NOT stored:
--   * no employee_id, email, name, token, IP address or user agent
--   * no session or device identifier
--   * no per-response identifier that means anything outside this table
--
-- `submitted_at` is truncated to the hour on the way in. An exact timestamp is
-- a fingerprint in a small organisation ("who was at their desk at 10:42?"),
-- and nothing in the report needs the minute.
--
-- WHAT THIS DOES NOT PROTECT AGAINST. A response row carries the groups the
-- respondent chose — department and level, say — because per-group averages
-- cannot be worked out otherwise. The application reports one group at a time
-- and hides groups below the minimum, so a cross-tab is never shown. Whoever
-- holds direct database access could still combine them. That is a matter of
-- who you give database credentials to, not of what the product displays.
--
-- Everything here is closed to the browser roles. Public answering goes through
-- the server, which checks the survey is open and the answers belong to it.

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 200),
  intro text,
  -- The public link. It identifies the survey, never a respondent, so a single
  -- link can be sent to everybody at once.
  slug text not null unique check (slug ~ '^[a-z0-9]{16,40}$'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  -- Groups smaller than this are never reported. Three is the floor.
  minimum_group smallint not null default 3 check (minimum_group between 3 and 10),
  -- [{ key, label, options[], required }] — what a respondent says about themselves.
  group_fields jsonb not null default '[]'::jsonb,
  closing_note text,
  created_by uuid references public.employees(id) on delete set null,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveys_org on public.surveys (org_id, created_at desc);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  position smallint not null,
  question_type text not null check (question_type in ('scale', 'text')),
  prompt text not null check (length(trim(prompt)) between 3 and 300),
  low_label text,
  high_label text,
  required boolean not null default true,
  unique (survey_id, position)
);

-- One submission. It has no owner, and nothing here points at one.
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  groups jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default date_trunc('hour', now())
);

create index if not exists survey_responses_survey on public.survey_responses (survey_id);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  answer_text text check (length(answer_text) <= 4000),
  unique (response_id, question_id),
  -- A rated question carries a rating; a comment carries words. Never both.
  constraint survey_answers_one_kind check (
    (rating is not null and answer_text is null)
    or (rating is null and answer_text is not null and length(trim(answer_text)) > 0)
  )
);

create index if not exists survey_answers_question on public.survey_answers (question_id);

-- A survey's questions cannot change once people have answered: a report whose
-- questions moved underneath it means nothing.
create or replace function public.survey_questions_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  survey_status text;
  answered integer;
begin
  select s.status into survey_status from public.surveys s where s.id = coalesce(new.survey_id, old.survey_id);
  if survey_status is null then
    return coalesce(new, old);  -- the survey itself is being deleted
  end if;

  select count(*) into answered
  from public.survey_responses r
  where r.survey_id = coalesce(new.survey_id, old.survey_id);

  if answered > 0 then
    raise exception 'People have already answered this survey, so its questions cannot change.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists survey_questions_guard on public.survey_questions;
create trigger survey_questions_guard before insert or update or delete on public.survey_questions
for each row execute function public.survey_questions_guard();

-- Answers are never edited or deleted one by one: an anonymous submission
-- cannot be corrected by the person who made it, and nobody else should.
create or replace function public.survey_answers_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'A survey answer cannot be changed or removed once it is in.' using errcode = '42501';
end $$;

drop trigger if exists survey_answers_guard on public.survey_answers;
create trigger survey_answers_guard before update or delete on public.survey_answers
for each row execute function public.survey_answers_guard();

alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

revoke all on public.surveys, public.survey_questions, public.survey_responses, public.survey_answers from anon, authenticated;
grant all on public.surveys, public.survey_questions, public.survey_responses, public.survey_answers to service_role;
