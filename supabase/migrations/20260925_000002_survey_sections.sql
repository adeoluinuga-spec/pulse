-- SURVEY SECTIONS
--
-- A seventeen-question survey reads better in parts: "Clarity of expectations",
-- "My line manager", "Working relationships". The heading is shown above the
-- first question that carries it, on the answering page and in the report.
--
-- It is presentation only: nothing is aggregated by section, because a section
-- average mixes questions that were never meant to be averaged together.

alter table public.survey_questions add column if not exists section text;
