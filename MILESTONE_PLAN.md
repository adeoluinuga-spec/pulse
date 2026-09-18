> **Superseded.** This document is out of date. For the current state of Pulse, see [PULSE_BIBLE.md](PULSE_BIBLE.md). It is kept for history.

# Pulse Milestone Plan

## Objective
Build Pulse as a configurable assessment and capability platform for organisation-level 360 assessment, with a clear path to performance appraisal and development planning, while allowing parallel engineering work without blocking each other.

This plan keeps the work split by responsibility and by system boundary so both engineers can move at speed.

---

## Strategic direction

Pulse is not a survey tool. It is a structured assessment platform for:
- confidential 360 feedback
- leader capability diagnostics
- self-assessment
- rater nomination and approval
- capability reporting
- development planning
- future performance appraisal integration

The product should initially be sold and built as:
- a managed 360 assessment platform
- with a clear pathway to performance appraisal and development support

---

## Product principles

1. The assessment model must be configurable per organisation.
2. The competency framework is organisationally owned, not hardcoded by one founder or one client.
3. 360 feedback is behavioural and developmental; it must be clearly distinguished from formal performance appraisal unless explicitly integrated.
4. Scoring and release rules must be enforced on the server, not only in the UI.
5. Reporting and capability insight must be treated as first-class product output, not an afterthought.
6. Parallel engineering must be possible through clear ownership and API boundaries.

---

## Workstream split

### Workstream A: Senior engineer / Pulse architecture ownership
This stream owns the system rules, data integrity, and backend behaviour.

Focus areas:
- organisation competency library model
- cycle template and assessment framework configuration
- custom competency sets by organisation, level and function
- self-assessment model and API rules
- rater nomination and approval logic
- minimum response and anonymity rules
- weighted scoring and server-side release gates
- report generation service and database persistence
- audit trail and security boundaries
- data contracts and schema evolution

Primary deliverables:
- org-level competency framework schema
- assessment template configuration APIs
- self-assessment participation model
- reviewer nomination approval workflow logic
- server-side scoring, release and readiness enforcement
- final report generation and export layer

### Workstream B: Codex / product workflow and experience ownership
This stream owns client-facing operational workflows and product UX that sits on top of the architecture.

Focus areas:
- assessment cycle launch screens
- competency and framework configuration UI
- self-assessment experience screens
- rater nomination and approval workflow UI
- dashboard cards, readiness views, status tracking
- admin controls for cycle setup and participant management
- report summary UI and presentation layers
- UX polish, edge cases, real-world flow testing
- QA, seed data, and workflow validation

Primary deliverables:
- assessment setup screens
- competency library management interface
- self-assessment UI
- nomination and approval pages
- dashboard and status views for clients and HR
- report summary and presentation screens

---

## Shared responsibilities

These are shared tasks that both engineers should coordinate on at design checkpoints:
- assessment lifecycle definition
- naming and data fields for competency and rater objects
- final API payload contracts
- security rules for role-based access
- release gate business rules
- testing strategy and edge-case validation

Shared rule: no one changes the core schema or business logic without checking the other workstream.

---

## Dependencies and boundaries

### A depends on B only on UI contracts
Senior engineer should define the API and payload contracts first, then Codex builds UI around them.

### B depends on A for backend rules
Codex can build flows against mocked or staged data, but production rules must come from the backend model that A owns.

### Neither should block the other on minor product design questions
The rule is: if the question affects the user flow only, Codex decides. If it affects data integrity, scoring, security, or release logic, the senior engineer decides.

---

## Milestone roadmap

### Milestone 1: assessment foundation and organisation configuration
Target: first sprint

Goal:
Define configurable assessment architecture for each organisation.

Deliverables:
- org competency library model
- cycle-level framework selection
- level and function mapping
- role-based cycle admin controls
- initial API contract for assessment config

Owner split:
- A: schema, rules, API
- B: UI for framework setup and cycle management

---

### Milestone 2: self-assessment and rater workflow
Target: second sprint

Goal:
Support a complete assessment participation model.

Deliverables:
- self-assessment model and form flow
- participant nomination workflow
- manager/HR approval screen
- rater coverage checks
- minimum response rules
- data-quality handling for “unable to observe”

Owner split:
- A: business logic, validation, security, API
- B: onboarding flow, nomination UX, approval screens, dashboard statuses

---

### Milestone 3: reporting, scoring and release readiness
Target: third sprint

Goal:
Turn assessment data into actionable organisational insight.

Deliverables:
- server-side weighted score calculation
- report generation summary
- blind-spot and hidden-strength logic
- aggregated leadership capability views
- release gate enforcement
- export-ready reports

Owner split:
- A: scoring, weighting, backend report generation, release rules
- B: report UI, heat-map presentation, drill-down views, export workflows

---

### Milestone 4: development action and future performance appraisal
Target: fourth sprint and beyond

Goal:
Convert assessment results into actionable development plans and extend to performance review use cases.

Deliverables:
- development priorities per assessed person
- development plan templates
- follow-up action tracking
- KPI/results layer for performance appraisal
- optional combined review model

Owner split:
- A: architecture and logic for performance-review integration
- B: user-facing development plan UX and review flows

---

## Definition of done

A milestone is done only when:
- backend rules and schema are in place
- UI flow works end-to-end
- validations are enforced server-side
- role-based access is respected
- report outputs are accurate
- the feature is testable independently by both engineers

---

## Guardrails

We should not do the following yet:
- build a general-purpose HRIS or full people platform
- build a broad survey product with no assessment logic
- hardcode competency frameworks for one client only
- rely on client-side score calculation as the source of truth
- merge performance appraisal and 360 behaviour assessment without explicit design and governance

---

## Recommended working pattern

### Daily rhythm
- A handles backend design and schema changes before B builds UI against them.
- B builds against the agreed payloads and reports gaps quickly.
- both engineers sync twice a week on API contracts, naming, and edge cases.

### Documentation rhythm
- A owns service contracts and model changes
- B owns user stories and UX flow documentation
- both update the handover ledger for any feature that crosses the shared boundary

---

## Final recommendation

Yes, split work across parallel tracks is advisable, provided the system boundary is clearly respected.

Pulse is already at a point where this is the correct next move:
- one engineer owns the trusted rules and data layer
- the other owns the operational experience layer
- both move in parallel without waiting for each other to finish everything first

This is the cleanest way to accelerate without creating a fragile product.
