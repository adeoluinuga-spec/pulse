# Pulse 360 Assessment QA Checklist

Use this checklist for the current end-to-end product walkthrough until browser automation is added.

## Happy Path

- [ ] HR opens `/assessments` and sees the command dashboard.
- [ ] HR creates or reviews an assessment cycle for Directors and Assistant Directors.
- [ ] HR configures the framework name, function, competencies, self-assessment settings, reviewer weights, and competency weights.
- [ ] HR imports participants with CSV columns: `name`, `email`, `level`, `function_name`, `region`, `portfolio`.
- [ ] HR nominates raters for the selected leader.
- [ ] HR approves a complete rater set across direct report, subordinate, colleague, and customer groups.
- [ ] The selected leader completes self-assessment with scores and evidence comments.
- [ ] A reviewer submits ratings and evidence comments using a token.
- [ ] The command dashboard updates leader, reviewer-group, department, and region progress.
- [ ] The reports tab shows leader summary, scorecard, blind spots, release controls, and cohort table.

## Edge Cases

- [ ] Empty participant CSV shows a clear validation message.
- [ ] Duplicate rater nominations are rejected.
- [ ] Unknown reviewer groups are rejected.
- [ ] Self-assessment cannot submit without evidence comments.
- [ ] Review submission cannot submit without a token.
- [ ] Review submission cannot submit without competency IDs.
- [ ] Release controls stay blocked until all required reviewer groups are represented and submitted.
- [ ] Region and function progress cards do not overflow with long department or location names.
- [ ] Reports stay readable on mobile and desktop widths.

## Known Gaps

- [ ] Browser automation is not yet installed.
- [ ] Persisted end-to-end data hydration is still incomplete for the full assessment workbench.
- [ ] PDF and CSV/XLSX exports are presentation-only controls for now.
- [ ] Final scoring, anonymity thresholds, and report release must remain backend-enforced before production launch.
