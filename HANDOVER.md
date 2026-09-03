# Pulse 360 Assessment Handover

## Status summary

Pulse is now at the point where the product is no longer just a workflow mock-up. The core 360 assessment lifecycle is in place, and the remaining work is now mostly a matter of layered implementation: system rules, configuration, reporting, and enterprise-grade guardrails.

This handover is structured to support parallel work. The work is split between:
- the senior engineer / architecture owner: system rules, data integrity, server-side enforcement, schema and scoring logic
- Codex: product workflow UI, operational UX, dashboard flows, and user-facing assessment experience

This is advisable because the product is large enough that both engineers can move in parallel without waiting on each other, provided we keep a strict boundary between product flow and trusted business logic.

---

## What is already built

### 1) Core assessment lifecycle
- assessment cycle creation and metadata
- assessment subject import and organisation-level person tracking
- reviewer assignment and coverage tracking
- reviewer group logic:
  - direct report
  - subordinate
  - colleague
  - customer
- basic release readiness logic
- dashboard visibility into workflow status and review completion

### 2) Scope and routing logic
The platform already supports different assessment modes and review channels:
- individual
- team
- functional
- customer experience

Supported channels:
- email
- SMS
- WhatsApp
- portal

This is important because customer-facing assessments are not operationally equivalent to internal-only peer review.

### 3) Reviewer workflow
- reviewer validation model
- secure invite token pattern
- assignment creation flow
- submission tracking and status display
- readiness summary and coverage views

### 4) Submission and scoring model
- submission payload validation
- weighted score aggregation logic
- customer-experience uplift logic
- report summary scaffolding

---

## Product direction

Pulse should be positioned as:
- a managed 360-assessment platform
- with capability diagnosis and development planning
- supported by Stuart Davidson as the assessment architect and implementation partner
- backed by Pulse as the technology enabler and operational system

Not as: “just survey software.”

This distinction matters because the product is being developed as a real organisational capability tool rather than a generic form builder.

---

## The product is already ready for both modes conceptually

Pulse is already structurally suited to both:
- 360 assessment
- performance appraisal as a separate evaluation mode

However, the platform is not yet fully productized for both in a fully enterprise-ready way.

The actual distinction is:
- 360 assessment = behaviour, capabilities, development insight
- performance appraisal = results, goals, manager evaluation, outcomes

These should remain distinct unless a client explicitly chooses an integrated model.

---

## What still needs to be added

### 1) Organisation-level competency framework configuration
This is the most important product gap.

The competency model should not be fixed to one old framework or one founder’s view. It should be configurable per organisation and per cycle.

Required capability:
- org-level competency library
- cycle-specific competency selection
- level-based competency mapping
- function-based competency grouping
- optional custom questionnaires per organisation
- support for different frameworks across business units

This is a SaaS capability, not a one-off consultancy task.

### 2) Self-assessment support
This should be added as a first-class participation mode.

Required capability:
- self-assessment as a distinct rater type
- self vs others comparison
- self-assessment inclusion rules by cycle or business unit
- reporting of self-perception versus peer perception

### 3) Rater nomination and approval workflow
This is a must-have for real enterprise rollout.

Required capability:
- employee nominates raters
- manager or HR approves the list
- minimum/maximum raters enforced
- exclusions and duplication checks
- visibility into assessor coverage and quality

### 4) Anonymity and data quality rules
This is essential to preserve trust and reduce organisational risk.

Required capability:
- aggregate peer and direct-report data only where safe
- suppress small-group displays
- minimum response thresholds
- “unable to observe” response handling
- rater confidence and observability checks

### 5) Report generation layer
The reporting layer must become a first-class product feature.

Required outputs:
- individual report
- manager summary
- aggregate leadership capability view
- heat map by function, level or region
- blind-spot and hidden-strength analysis
- executive summary
- export pack for HR and leadership

### 6) Development plan layer
This turns assessment into actual organisational action.

Required capability:
- development priority extraction
- personal development plan template
- follow-up actions and accountability
- 90-day / 180-day review tracking

### 7) Performance appraisal integration
This is a second-stage capability, not the first sprint.

Required capability:
- KPI/results section
- manager evaluation mode
- combined results + behaviour model when requested
- separate workflows for 360-only and integrated review

---

## Parallel work model

## Workstream A: senior engineer / architecture owner
This person owns the trusted rules and integrated system layer.

### Responsibilities
- organisation competency library model
- cycle and framework schema design
- custom competency library support per org
- self-assessment logic and data rules
- rater nomination and approval logic
- reviewer coverage and minimum-response enforcement
- scoring and weighting logic
- server-side release gate enforcement
- report generation service and persistence
- audit logs, security rules, and RBAC boundaries
- API contracts and schemas that Codex can build against

### Primary deliverables
- org competency model and cycle config API
- self-assessment backend rules
- nomination and approval backend workflow
- report generation service and scoring logic
- release gate enforcement and data integrity layer

---

## Workstream B: Codex / operational UX owner
This person owns the user experience and operational flow that sits on top of the architecture.

### Responsibilities
- assessment cycle setup screens
- competency configuration UI
- org framework management screens
- self-assessment flow UI
- rater nomination and approval screens
- participant and rater dashboard flows
- report view and summary screens
- status UX, readiness cards, and admin views
- workflow QA and end-to-end demo validation

### Primary deliverables
- assessment configuration interface
- self-assessment user journey
- nomination and approval management UX
- admin dashboards for cycle progress and quality checks
- report presentation layer

---

## Shared responsibilities

These are shared boundaries and should be reviewed together:
- final assessment lifecycle definition
- assessment config naming conventions
- payload and API contracts
- role-based access design
- scoring rules and release policy
- data validation strategy and edge-case handling

Rule: if the decision affects trust, scoring, security, or data integrity, the senior engineer decides. If it affects workflow UX only, Codex can move independently.

---

## Recommended milestone plan

### Milestone 1: organisation framework and assessment config
Goal: make the assessment model configurable per organisation.

Focus:
- org competency library
- cycle setup for assessment types
- level/function segmentation
- assessment template creation

Owners:
- A: schema, rules, APIs
- B: UI for framework set-up and management

---

### Milestone 2: self-assessment and rater workflow
Goal: complete the assessment participation model.

Focus:
- self-assessment mode
- nomination workflow
- approval workflow
- coverage checks
- minimum response and quality controls

Owners:
- A: validation, rules, APIs, backend enforcement
- B: user journey, review screens, dashboard statuses

---

### Milestone 3: scoring, release readiness and reports
Goal: convert submissions into trusted organisational intelligence.

Focus:
- weighted score logic
- server-side release gate enforcement
- report generation
- leadership summary views
- heat map and aggregated views

Owners:
- A: backend scoring and report generation
- B: UI presentation and report exploration screens

---

### Milestone 4: development planning and future performance-review layer
Goal: move from assessment to action and future enterprise expansion.

Focus:
- development priorities
- individual development plan templates
- one-to-one follow-up
- KPI-results review mode
- integrated performance appraisal architecture

Owners:
- A: architecture and scoring integration
- B: user-facing development planning and review workflow

---

## What not to do yet

We should not chase the following until the core assessment model is stable:
- generic HRIS features
- broad survey platform features
- a full employee performance suite
- any score that is calculated only on the client
- any report that is not backed by server-side logic
- general-purpose organisation-wide “everything platform” work

---

## Engineering guardrails

The core rule remains:

A reviewer should only be able to submit for the correct assignee, using a valid token, with complete data, and with that response reflected in the real scoring and reporting model.

This must stay enforced server-side.

---

## Recommended handoff checklist

### Senior engineer / architecture owner
- [ ] org competency library model
- [ ] cycle-level framework configuration
- [ ] self-assessment backend rules
- [ ] rater nomination and approval backend logic
- [ ] server-side scoring and release gate enforcement
- [ ] report generation service and persistence
- [ ] audit trail and role security enforcement

### Codex / UX owner
- [x] assessment lifecycle screens
- [x] competency configuration workflow UI
- [x] self-assessment completion UX
- [ ] nomination and approval UX
- [ ] admin dashboard and progress views
- [ ] reporting presentation layer
- [ ] end-to-end testing and edge-case validation

---

## Final note

Yes, parallel work is advisable here, but only when it is structured around clear system responsibility.

This handoff is designed to let both engineers make meaningful progress at the same time:
- one layer owns logic and trust
- the other owns user flow and delivery experience

That is the correct next move for speed without breaking the product architecture.
