-- FULLY LABELLED SCALES
--
-- A rated question could show only 1 to 5 with the two ends named. That is one
-- legitimate instrument, but it is not the same instrument as five named points
-- ("Strongly disagree" … "Strongly agree"), and a baseline measured on one
-- cannot be compared with a re-run measured on the other.
--
-- Five labels are stored here so the wording travels with the question and the
-- January re-run can be checked against it. The answer is still a number from 1
-- to 5, so every average, comparison and export is unchanged.

alter table public.survey_questions add column if not exists scale_labels jsonb;

alter table public.survey_questions
  drop constraint if exists survey_questions_scale_labels_shape;

alter table public.survey_questions
  add constraint survey_questions_scale_labels_shape check (
    scale_labels is null
    or (jsonb_typeof(scale_labels) = 'array' and jsonb_array_length(scale_labels) = 5)
  );
