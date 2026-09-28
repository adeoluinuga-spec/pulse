-- CLEARING TEST RESPONSES
--
-- Answers cannot be edited or deleted once sent, and that stays true: it is
-- what stops anybody quietly removing the one answer they did not like. But a
-- survey is usually tested before it is sent, and those rehearsal answers would
-- otherwise sit in the results for ever.
--
-- So there is exactly one way to remove answers, and it is deliberate:
--
--   * It clears EVERY response for a survey, never a chosen one. You cannot use
--     it to drop an inconvenient reply, only to reset the survey.
--   * It records that it happened, and how many went, on the survey itself.
--     A report that once had answers cleared says so, so nobody later reads the
--     numbers as if they covered everything.
--   * It is closed to browsers, like everything else about surveys.

alter table public.surveys
  add column if not exists responses_cleared integer not null default 0,
  add column if not exists responses_cleared_at timestamptz;

-- The guard now allows a delete only inside the clearing function, which
-- announces itself by setting this flag for the duration of its transaction.
create or replace function public.survey_answers_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('pulse.survey_clearing', true), '') = 'on' then
    return old;
  end if;
  raise exception 'A survey answer cannot be changed or removed once it is in. To reset a survey, clear all of its responses.' using errcode = '42501';
end $$;

create or replace function public.survey_clear_responses(p_survey uuid) returns integer
language plpgsql
set search_path = public
as $$
declare
  survey_row public.surveys%rowtype;
  removed integer;
begin
  select * into survey_row from public.surveys where id = p_survey for update;
  if not found then
    raise exception 'Survey not found.' using errcode = 'P0002';
  end if;

  perform set_config('pulse.survey_clearing', 'on', true);
  delete from public.survey_responses where survey_id = p_survey;
  get diagnostics removed = row_count;
  perform set_config('pulse.survey_clearing', '', true);

  update public.surveys
  set responses_cleared = responses_cleared + removed,
      responses_cleared_at = case when removed > 0 then now() else responses_cleared_at end,
      updated_at = now()
  where id = p_survey;

  return removed;
end $$;

revoke all on function public.survey_clear_responses(uuid) from public, anon, authenticated;
grant execute on function public.survey_clear_responses(uuid) to service_role;
