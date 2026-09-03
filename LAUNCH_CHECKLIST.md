# Pulse Launch Checklist

This is the working checklist for taking Pulse from the current prototype into a premium HR platform with a Telco-ready 360-degree assessment product.

## 0. Foundation Already Completed

- [x] Inspect current repo structure, stack, build health, and launch blockers.
- [x] Confirm platform can be adapted for 360-degree assessment instead of starting from scratch.
- [x] Add local development auth bypass for immediate testing.
- [x] Default local development user to HR admin.
- [x] Add protected 360 assessment route.
- [x] Add 360 assessment navigation to desktop and mobile shells.
- [x] Add Telco-specific 360 assessment domain model.
- [x] Add demo assessees, reviewer groups, competencies, scoring helpers, and report signals.
- [x] Add first 360 assessment workbench UI.
- [x] Add Supabase schema draft for 360 assessment cycles, subjects, reviewers, responses, and reports.
- [x] Run successful lint and production build after the 360 slice.
- [x] Begin Harvesters Finance-style UI direction with Inter, white surfaces, cobalt accent, and compact shell.

## 1. Design System And UI Rework

- [x] Finalize Pulse visual direction using Harvesters Finance as the reference system.
- [x] Replace all warm/orange legacy UI tokens with the white, neutral, cobalt system.
- [x] Normalize typography across the app to Inter.
- [x] Create shared Button, Card, Badge, Tabs, Table, EmptyState, Drawer, Modal, and Form components.
- [x] Refactor AppShell, WorkSidebar, TopBar, BottomNav into the final enterprise layout.
- [x] Rework `/assessments` as the new design reference page.
- [x] Rework `/dashboard/hr` into a dense operational HR console.
- [x] Rework `/dashboard/executive` into board-ready executive reporting.
- [x] Rework `/goals`, `/appraisal`, `/dashboard/reports`, `/dashboard/team`, `/settings`.
- [x] Remove old decorative gradients, oversized radii, and warm palette remnants.
- [x] Verify mobile and desktop layouts for no overlap, overflow, or awkward wrapping.

## 2. 360 Assessment Product

- [ ] Replace demo-only assessment data with Supabase-backed CRUD.
- [x] Create HR assessment cycle setup flow.
- [x] Add participant import for Directors and Assistant Directors.
- [x] Add reviewer assignment matrix for direct reports, subordinates, colleagues, and customers.
- [x] Allow the assessment scope to be selected for individual, team, functional, and customer-experience reviews.
- [x] Support external review channels including WhatsApp for customer-facing assessment routes.
- [x] Add self-assessment completion UX.
- [x] Add rater nomination and HR approval UX.
- [x] Add real review submission endpoint with token validation, response persistence, and audit event recording.
- [ ] Add reviewer invitation workflow.
- [ ] Add secure external customer review links.
- [ ] Add reviewer anonymity thresholds before reports can be released.
- [x] Add competency/question-bank builder.
- [x] Add weighting controls by reviewer group and competency.
- [x] Add live completion dashboard by leader, reviewer group, department, and region.
- [ ] Add reviewer reminder scheduling.
- [ ] Add calibration workflow for HR before report release.
- [ ] Add individual 360 report generation.
- [ ] Add cohort/portfolio reporting for HR and executives.
- [x] Add 360 report presentation layer for leader summaries, scorecards, blind spots, and cohort views.
- [ ] Add PDF export.
- [ ] Add CSV/XLSX export.
- [ ] Add audit trail for report release and reviewer access.

## 3. AI And Insights

- [ ] Define AI report schema for 360 summaries.
- [ ] Generate strengths, development areas, blind spots, and risk notes from reviewer responses.
- [ ] Add executive briefing for the assessment cycle.
- [ ] Add leader-specific coaching plan.
- [ ] Add HR calibration assistant.
- [ ] Add bias/anomaly checks for extreme reviewer scoring patterns.
- [ ] Add privacy guardrails so AI outputs do not reveal anonymous reviewers.
- [ ] Add prompt/version tracking for generated reports.

## 4. Core HR Platform Readiness

- [ ] Replace remaining mock-heavy pages with live Supabase data.
- [ ] Fix mobile nav routes that still point to legacy placeholder routes.
- [ ] Harden employee import and invite flows.
- [ ] Add role-based access enforcement for HR, executive, manager, employee, and reviewer personas.
- [ ] Add organisation setup completeness checks.
- [ ] Add real settings for appraisal cadence, scoring rules, departments, teams, and bands.
- [ ] Add file/document storage rules.
- [ ] Add notification preferences and delivery logs.
- [ ] Add proper empty, loading, error, and permission states across all major pages.

## 5. Security, Privacy, And Compliance

- [ ] Remove or clearly gate local auth bypass before production deployment.
- [ ] Rotate any secrets that were ever committed, shared, or exposed locally.
- [ ] Add `.env.example` with safe placeholder values.
- [ ] Ensure `.env.local` and Supabase temp files are ignored.
- [ ] Review all API routes for authentication and authorization checks.
- [ ] Fix admin invite route so HR users cannot invite into arbitrary org IDs.
- [ ] Lock down service-role usage to server-only contexts.
- [ ] Review RLS policies across all tables.
- [ ] Add rate limiting to invite, AI, auth-adjacent, and public reviewer-link routes.
- [ ] Add audit logs for sensitive admin actions.
- [ ] Review PWA service worker caching so private data is not cached unsafely.
- [ ] Add data retention and deletion policy for assessment responses.

## 6. Database And Infrastructure

- [ ] Add Supabase migration ordering and documentation.
- [ ] Add `supabase/config.toml` or document the deployment flow if intentionally omitted.
- [ ] Apply and test `07_security_fixes.sql`.
- [ ] Apply and test `08_360_assessments.sql`.
- [ ] Generate TypeScript DB types from Supabase.
- [ ] Add seed data for the 360 demo cycle.
- [ ] Add staging environment.
- [ ] Add production environment.
- [ ] Add backup and restore procedure.
- [ ] Add deployment checklist for Vercel and Supabase.

## 7. Quality, Testing, And CI

- [ ] Add CI workflow for lint, build, and tests.
- [ ] Add unit tests for scoring, readiness, permissions, and assessment helpers.
- [ ] Add route handler tests for invites, assessment CRUD, reports, and AI endpoints.
- [ ] Add Playwright smoke tests for login bypass, HR dashboard, and 360 assessment flow.
- [ ] Add visual regression snapshots for the redesigned shell and assessment pages.
- [ ] Add accessibility checks for keyboard navigation, focus states, contrast, labels, and dialogs.
- [ ] Add test data factories.
- [x] Add 360 workflow validation tests for setup, nominations, self-assessment, reviews, and reports.
- [x] Document manual QA scenarios.

## 8. Client Demo Readiness

- [ ] Create a Telco-branded demo cycle.
- [ ] Add realistic Director and Assistant Director participant examples.
- [ ] Add realistic customer, peer, subordinate, and line-manager reviewer examples.
- [ ] Prepare a demo script for HR admin, reviewer, executive, and assessed leader views.
- [ ] Prepare sample exported PDF report.
- [ ] Prepare implementation timeline for the Telco client.
- [ ] Prepare pricing/scope assumptions.
- [ ] Prepare risk and dependency list.

## 9. Production Launch Readiness

- [ ] Remove demo-only data from production paths.
- [ ] Disable dev auth bypass in production and verify it cannot be enabled accidentally.
- [ ] Complete full security review.
- [ ] Complete full mobile QA.
- [ ] Complete full browser QA.
- [ ] Complete performance check for dashboard-heavy pages.
- [ ] Complete deployment rehearsal.
- [ ] Complete client acceptance testing.
- [ ] Tag first production release.
