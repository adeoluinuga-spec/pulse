# Baseline Comparison Schema Request

This workstream needs the contract branch to add one schema field before annual baseline comparison can run against Supabase:

- `assessment_cycles.prior_cycle_id uuid null references public.assessment_cycles(id) on delete set null`

Rationale:

- cycle cloning records the source completed cycle on the newly created cycle
- report/PDF generation uses that pointer to load prior-cycle scores
- annual movement sections must flag framework changes using the already-existing `assessment_competencies.framework_id` and `assessment_competencies.framework_version`

No migration was added in this branch, per the task rule.
