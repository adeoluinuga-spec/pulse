-- Session is organisational metadata, separate from locked question configuration.
begin;
alter table public.learning_activities
  add column session_number integer check (session_number between 1 and 50);
comment on column public.learning_activities.session_number is
  'Optional programme session (1-50). Null means not assigned. Does not affect release or completion.';
commit;
