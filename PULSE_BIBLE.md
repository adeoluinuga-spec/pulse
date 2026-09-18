# Pulse: the platform bible

**Last updated:** 18 September 2026, from `main` at `bd9ba6b`
**Status:** The single reference for what Pulse is, what it can do, who can do what, and what is still unfinished. Where an older document disagrees with this one, this one wins (section 17 lists which documents it replaces).

**How this was written:** from the code as it stands, not from earlier notes. Where a claim depends on something outside the code (a migration having been run, an email actually arriving), the text says so.

---

## Contents

1. What Pulse is
2. The platform at a glance
3. Who uses Pulse, and what each person can do
4. Getting an organisation onto Pulse
5. Organisation structure
6. Strategy, goals and KPIs
7. Performance appraisal
8. 360-degree assessments
9. Payroll
10. Dashboards, reports, team and wellbeing: what is real and what is demo
11. Email and notifications
12. AI features
13. How data is protected
14. Known gaps and open decisions
15. Running the platform: setup, secrets and database migrations
16. Testing
17. Document map
18. Build history

**Status labels used throughout**

| Label | Meaning |
|---|---|
| **Live** | Built, saves real data, usable in the browser. |
| **Live, rehearse first** | Built and tested, but not yet run end to end by real people in a real organisation. |
| **Partial** | Some of it is real, some of it is still demonstration or local-only. |
| **Demo** | The screen exists but shows invented data, or its actions do not save. |
| **Not built** | Shown as "coming soon", or does not exist. |

---

## 1. What Pulse is

Pulse is a multi-organisation HR and performance platform. One installation serves many client organisations ("tenants"). Each organisation sees only its own people and data.

It covers five connected areas:

- **Organisation**: who reports to whom, departments, teams and positions.
- **Planning**: strategic objectives broken down into key result areas, objectives, key results, goals and KPIs.
- **Performance**: an evidence-based appraisal cycle, and a separate 360-degree feedback assessment.
- **Pay**: a Nigerian payroll that calculates, gets approved, and produces payslips and bank/remittance files.
- **Everyday work**: dashboards, work reports, and AI-assisted summaries (partly still demonstration; see section 10).

**Who it is for.** Stuart Davidson (SD) is the client and operator. Zenith Corp is the demonstration organisation used to show the platform to prospective clients; its email addresses are demo accounts and do not receive mail.

**Where it runs**

| Item | Value |
|---|---|
| Application address | `https://app.pulse.stuartdavidson.org` |
| Email sending domain | `pulse.stuartdavidson.org` (via Resend) |
| Platform super-admin | `hello@stuartdavidson.org` |
| Application | Next.js 16 (App Router), hosted on Vercel |
| Database, sign-in, background jobs | Supabase: Postgres, Auth, Edge Functions, `pg_cron` |
| AI | Anthropic Claude |

---

## 2. The platform at a glance

| Area | Where | Status | In one line |
|---|---|---|---|
| Platform admin | `/admin` | Live | Super-admin creates organisations and sees all tenants. |
| Organisation onboarding | `/onboarding`, `/welcome` | Live | HR sets up the organisation, imports staff and sends invites. |
| Sign-in | `/auth/login`, `/auth/reset` | Live | Email sign-in and password reset. |
| Organisation structure | `/dashboard/organisation` | Live, rehearse first | Visual org chart: draft, review, publish. |
| Strategy cascade | `/strategy` | Live, rehearse first | Objectives to key results, any depth, with progress rolling up. |
| Goals | `/goals` | Live, rehearse first | Create, weight, track and link goals to strategy and appraisal. |
| KPIs | `/kpis` | Live, rehearse first | Standing measures with targets, direction and frequency. |
| Performance appraisal | `/appraisal` | Live, rehearse first | Self-review, manager review, peer feedback, independent HR release. |
| 360 assessments | `/assessments` and sub-pages | Live, rehearse first | Full cycle from setup to released reports and exports. |
| 360 rater links | `/review/...` | Live | Raters answer on their phone without a Pulse account. |
| Payroll | `/payroll` | Live, rehearse first | Calculate, adjust, approve, export bank/PAYE/pension/NHF files. |
| Payslips | `/payslips` | Live | Everyone sees and downloads their own approved payslips. |
| Role dashboards | `/dashboard` | Partial | Routes each person to an HR, executive, manager or employee view. |
| Work reports | `/reports/submit` vs `/dashboard/reports` | Partial | One form saves, the other does not (section 10). |
| Legacy performance dashboard | `/dashboard/performance` | Demo | Shows invented appraisal history. |
| Team workspace | `/dashboard/team` | Demo | Chat, meetings and tasks are illustrative only. |
| AI and wellbeing | `/dashboard/ai-wellbeing` | Partial | Real AI calls over partly invented context. |
| Leave, PIPs, learning, development plans | sidebar | Not built | Shown as "coming soon". |

---

## 3. Who uses Pulse, and what each person can do

Pulse describes a person in three independent ways.

**1. Platform role**: what the person can administer.

| Role | Who | Can do |
|---|---|---|
| `super_admin` | The platform operator (SD) | Everything HR can, in any organisation, plus creating organisations at `/admin`. |
| `hr_admin` | An organisation's HR team | Run the organisation: structure, staff, appraisal, 360, payroll, grants. |
| `executive_view` | CEO, MD, COO | Executive dashboard and released results for their organisation. Sees Payroll in the sidebar, but can only open it once HR grants them a payroll right (usually "approve"). |
| `standard` | Everyone else | Their own work, reviews, reports and payslips. |

**2. People responsibility**: set by the published org chart: `none`, `team_lead`, `manager`, `senior_manager`, `director`. Anyone other than `none` gets the manager dashboard and manager duties in appraisal and 360.

**3. Named grants**: payroll only. HR can give any individual the right to **prepare**, **approve** or **view** payroll, whatever their platform role (section 9).

**People without accounts.** 360 raters, including customers and other external raters, answer through a private emailed link and never sign in.

**Where each person lands after signing in**

| Person | Lands on |
|---|---|
| HR admin or super-admin | `/dashboard/hr` |
| Executive (`executive_view`, or cadre "executive") | `/dashboard/executive` |
| Anyone with people responsibility | `/dashboard/manager` |
| Everyone else | `/dashboard/employee` |

**Job levels (cadre).** Today every organisation uses the same four fixed cadres: entry, mid, senior and executive. SD has asked for each organisation to define its own level names and count ("Level 1 … n") at setup, used consistently across the tenant. This is not yet built (section 14).

---

## 4. Getting an organisation onto Pulse

1. **Super-admin creates the organisation** at `/admin`, naming the HR admin and executive email addresses. The admin screen lists every tenant with headcount, active cycle, cadence and currency.
2. **HR completes onboarding** at `/onboarding`:
   - Step 1: welcome.
   - Step 2: organisation details, leave policy and default appraisal weights (goal 35, reports 20, KPIs 25, manager 10, peers 10).
   - Step 3: import staff by CSV, or add them one by one.
   - Step 4: send personalised invitations by email.
3. **Staff accept** and complete their profile and photo at `/welcome`.
4. **HR publishes the org chart** (section 5). Many later features (default appraisal reviewers, 360 rater selection, manager dashboards) read reporting lines from it.

**Reply-to address.** Each organisation can set a reply-to email so replies to Pulse emails reach its own HR team. If none is set, replies go to the HR admin.

---

## 5. Organisation structure

**Where:** `/dashboard/organisation` (HR only). **Status:** Live, rehearse first.

**What HR can do**

- Start from existing staff and reporting lines, from a department template, or from a blank canvas.
- Add positions, departments and teams. Assign existing staff to positions; moving someone leaves their old position vacant.
- Set reporting lines by choosing "Reports to" or by dragging a card onto its manager. Several people may sit at the top level.
- Set each person's department, team and people responsibility.
- Choose a theme (Cobalt, Forest, Slate) and a horizontal or vertical layout, with zoom, fit-to-screen and collapsible branches.
- **Save a draft** without affecting anyone, then **review and publish**.

**What publishing checks.** Everyone is placed exactly once. Occupied positions report to occupied positions or sit at the top. Assigned positions have a department. Vacancies are allowed, and people under a vacant post are routed to the next occupied manager up the line.

**What publishing changes.** In one transaction it updates each employee's role, department, team, line manager and people responsibility, and keeps a snapshot of the previous state. It never changes platform roles and never sends messages.

**Safety.**
- If two people edit at once, the second is told to reload rather than overwrite.
- If the staff list changed since the draft began, publishing is blocked until the draft is refreshed.

**Not included yet.** Dotted-line or matrix reporting, one person in two positions, and departments or teams as independent records.

---

## 6. Strategy, goals and KPIs

These three screens form one planning chain: what the organisation is trying to achieve, down to the individual measures that prove it.

### 6.1 The strategy cascade (`/strategy`)

The conventional chain is:

**Strategic objective → Key result area (KRA) → Objective (OKR) → Key result → goals and KPIs**

Each level can carry:
- an owner
- a description and expected outcome
- a measure with baseline, target and current value
- a timeline
- delivery actions ("strategy 1, 2, 3 … n"), each with an expected outcome, a responsible person, optional resources and a timeline

**Design choices**

- **The chain is a suggestion, not a cage.** An organisation can plan in three levels or six and name the levels its own way. Only loops and runaway depth are refused, and the database refuses them.
- **Progress is earned, not typed.** A level's progress is calculated from what sits beneath it: child levels, then linked goals and KPIs. A level with nothing beneath it and no measure shows "not measured", not zero.

### 6.2 Goals (`/goals`)

- **Create and edit goals** with owner, type, weight, progress, and start and end dates.
- **Link each goal** to a strategy level and to an appraisal cycle.
- **Locking:** a goal locks against changes that would alter a submitted appraisal.
- **Validation:** a goal must have everything the appraisal score needs (owner, weight, progress, period), so a half-complete goal cannot quietly distort a score.

### 6.3 KPIs (`/kpis`)

- **Create and edit KPIs** with owner, baseline, target and actual.
- **Direction:** higher-is-better or lower-is-better.
- **Period and frequency:** a KPI is a standing measure read at a frequency, not a dated project.
- **Links:** each KPI links to a strategy level and to an appraisal cycle.
- **Two different calculations:** strategy progress (from baseline) and appraisal attainment (against target, capped at 100%) are kept separate on purpose.

---

## 7. Performance appraisal

**Where:** `/appraisal`. **Status:** Live, rehearse first.

**The cycle**

1. **HR creates a cycle:** name, period, review deadline, reporting cadence, and weights that total 100. Setting a weight to 0 excludes that component. Weights cannot change once set.
2. **HR enrols staff.** Reviewers default to each person's line manager from the org chart. Nobody may review themselves.
3. **Employees write a reflection; assigned peers give feedback.**
4. **After the period, managers sign off:** five ratings of observable work (1–5), evidence notes and dated development commitments.
5. **The score is calculated and frozen on the server.** Missing weighted evidence blocks sign-off.
6. **An independent HR reviewer** records a final rating with a rationale and releases the result. HR cannot release their own appraisal, or one they wrote as reviewer.
7. **The employee acknowledges the result** and can record disagreement. Development commitments keep being tracked after release.

Returning a review to the employee or manager requires a reason, and the earlier version is kept in the history.

**How the score is built (default weights)**

| Component | Weight | Evidence |
|---|---:|---|
| Goal achievement | 35% | The employee's goals linked to the cycle, weighted |
| Report consistency | 20% | Submitted work reports for completed periods |
| KPI performance | 25% | The employee's KPIs linked to the cycle, attainment capped at 100% |
| Manager assessment | 10% | Five 1–5 ratings |
| Peer feedback | 10% | Average of at least three different peers |

**Scoring rules**

- **Missing evidence is not zero.** It is shown as missing, and weights are not quietly moved elsewhere.
- **Reports** are counted once per period. Approved leave excuses the days it covers. Join dates are respected. A Monday–Friday week is assumed.
- **HR's final 1–5 rating** is recorded separately from the calculated evidence score.
- **Nothing is automated off the result:** no promotion, pay or employment recommendation. Pay only moves if payroll imports a bonus (section 9.5).

**Linking evidence.** HR and managers attach goals and KPIs to a cycle through an evidence matcher that suggests matches by date and link.

**Privacy.**
- Unreleased manager notes and scores are hidden from the employee, including when the employee is in HR.
- Peer results appear only as an aggregate of three or more people.
- Leave type, mood and health information are never scoring inputs.

**Exports.** Released results export to CSV (safe against spreadsheet formula injection) and print to PDF.

---

## 8. 360-degree assessments

**Where:** `/assessments` (HR console) with sub-pages for cycles, instrument, participants, nominations, bulk reviewers and reports. Raters answer at `/review/...`. Participants see their status at `/dashboard/360`.
**Status:** Live, rehearse first. The core chain has been rehearsed against a synthetic cohort. It has not yet been run with a real client cohort and real email delivery end to end.

### 8.1 Setting up a cycle

- **Create a cycle** with dates, levels, weights and context.
- **Build the instrument** in the Framework tab: competencies as clickable cards, with statements added underneath. Items can be rated or open text.
- **Add participants** individually, by bulk selection of a whole level from the org chart, or by importing. Participants are linked to their employee records and notified in the app and by email.
- **Close, reopen, clone.**
  - A closed cycle can be reopened to setup, but only if nobody has responded and no report has been released.
  - A cycle can be cloned for the next round (`/assessments/cycles`), either carrying the same people or starting with a fresh population. The earlier cycle is kept as the baseline, so reports can show movement.

### 8.2 Choosing raters

- **Groups:** self, line manager, colleague, direct report and customer (internal or external).
- **Automatic selection** from the published org chart:
  - Line managers are invited automatically.
  - Direct reports are the people who actually report to the subject. The group is never padded with strangers; a shortfall is reported instead.
  - Colleagues are chosen nearest-peer first, widening outwards until the quota (default 3) is met, so small organisations can still run a 360.
  - Selection is deterministic, so running it twice gives the same answer.
- **Minimum raters per group** is set between 2 and 5 and locks at the first invitation, so confidentiality cannot be loosened mid-cycle.
- **Other ways in:**
  - bulk CSV/XLSX import, with validation, an error report and a confirm step
  - participant nominations with HR approval
  - a rater-load warning above six assignments per person
- **Removing people.** A participant or rater nobody has written about yet is **deleted**. One with feedback is **withdrawn**: kept for the record, excluded from everything. After a report is released, removal is refused, because a released report cannot be recalled.

### 8.3 Collecting responses

- **Launching** sends each rater a personal email naming the person being reviewed, from the organisation's reply-to address. Failed sends are shown and can be retried.
- **Links** are single-use, hashed, time-limited and tied to one assignment. A used or expired link explains itself and points to HR.
- **The form is built for phones:** one competency at a time, autosaves drafts, resumes where the rater left off, allows "unable to observe", and reviews everything before submitting.
- **Raters with several reviews** get one queue page listing everything they owe.
- **Reminders** can be sent on demand, and a scheduled job reminds raters in cycles that are collecting.

### 8.4 Scoring and confidentiality

- **Scores are calculated on the server** from submitted responses only. "Unable to observe" is excluded.
- **Small groups are hidden.** Any anonymous group (colleague, direct report, customer) below the minimum is suppressed. Self and line manager are shown, since the subject knows who they are.
- **Analysis:** self-versus-others gaps, blind spots and hidden strengths.
- **Written comments** are read through a pseudonymised view, and exports never link a comment to a named rater.

### 8.5 Reports

- **Report status:** draft → in review → released.
- **HR report console:** generate, review, release and export. A report viewer at `/assessments/reports/[subject]` shows the full report on screen.
- **Who sees a report:** HR sees everything in the organisation. The participant, their line manager (if the cycle allows it) and executives see **released** reports only. Every view and export is logged.
- **Exports:**
  - individual and group PDFs built from real scores
  - CSV and XLSX exports
  - a batch PDF job
- **AI narrative synthesis** of comments, written to keep raters unidentifiable, with an HR review step (section 12).

### 8.6 Governance

- **Retention:** a retention period can be configured, and purges can run manually (with a certificate) or on a schedule.
- **Audit:** release, access and export events are recorded.

---

## 9. Payroll

**Where:** `/payroll` (payroll team), `/payroll/runs/[run]`, `/payroll/people/[person]`, and `/payslips` for everyone.
**Status:** Live, rehearse first. **The tax rules are not yet verified by a tax professional** (section 14).

**What it does and does not do.** Pulse calculates pay, gets it approved and produces the files finance needs. **It does not move money and does not file tax returns.** The rules are Nigerian only.

### 9.1 Setting people up

- **Pay records** are dated and append-only. A pay rise is a new record with an effective date, never an edit. Each record lists components (basic, housing, transport and any others), with exactly one marked as basic and each marked taxable or pensionable.
- **Payroll details** per person: tax state, TIN, bank and account, pension fund and RSA PIN, NHF number, rent relief, NHIS, life assurance, pension or NHF exemption, and exit date.
- **Organisation settings:** pension, NHF, NSITF and ITF each on or off, a default tax state and a pay day. ITF defaults on at five or more staff.
- **Salaries are private.** Browsers cannot read the salary column at all. Each person gets their own pay only through a server route that takes no parameters, so it cannot be pointed at someone else.

### 9.2 Running payroll

1. **Start a run** for a month.
2. **Calculate.**
   - PAYE is worked out on an annualised full-month basis, with one-off payments taxed incrementally.
   - Pay for joiners, leavers and mid-month pay changes is prorated by calendar day.
   - Each line shows its full tax working.
   - Missing essentials (such as a bank account) are flagged as **blockers**.
3. **Adjust:** add one-off earnings or deductions (bonus, arrears, loan repayment), or import performance bonuses (9.5).
4. **Submit** for approval. This is refused while blockers remain.
5. **An independent approver approves or returns it.** Returning requires a reason.
6. **Once approved, the run is frozen:** figures, rules and payment destinations cannot change.
7. **Download files:** bank payment schedule, PAYE by state, pension by fund, NHF. Every download is logged. Anyone who cannot be paid (for example, no account on record) is left off and counted, never guessed.
8. **Payslips** become visible to each employee and download as PDF (amounts show "NGN", since the PDF font has no ₦ sign).

**Money** is held in whole kobo throughout, so no rounding creeps in.

### 9.3 Controls (maker-checker)

- **Anyone who worked on a run cannot approve or return it.** That means whoever calculated it, submitted it, added or removed an adjustment, or imported bonuses. The database enforces this too, from the run's own records, so the rule holds even if the application is wrong.
- **Changes and their audit record are saved together or not at all:** calculation, submission, return, approval, voiding, bonus import and adjustment removal.
- **Payment details are frozen per line at calculation.** Editing someone's bank account after approval cannot redirect an approved salary. A change before approval forces recalculation.
- **Stale actions are refused.** If two people act on the same run at once, only one succeeds.
- **Failures stop the action.** If Pulse cannot read something a control depends on (settings, blockers, who worked on the run), it refuses the action rather than assuming.

### 9.4 Who can do what in payroll

| Right | Who has it |
|---|---|
| Prepare (calculate, adjust, submit, import bonuses, edit people's pay) | HR admins, super-admins, and anyone granted "prepare" |
| Approve | Only people explicitly granted "approve". Neither HR nor executives can approve by default. |
| View all runs and files | Preparers, approvers, and anyone granted "view" |
| Manage grants | HR admins and super-admins |
| See own payslips | Everyone, once a run is approved |

### 9.5 Performance bonuses from appraisal

- **Preview first:** preparers preview bonuses from a released appraisal cycle, using score bands (percent of monthly basic) that the organisation can adjust. The preview lists every bonus, and everyone left out with the reason.
- **Import:** bonuses become taxable adjustments on the draft run.
- **Paid once:** an appraisal pays out **once** across all non-voided runs. Voiding a run frees its bonuses to be paid elsewhere.

### 9.6 Tax rules

Three dated rule sets are built in:

- `ng-pita-2020`
- `ng-pita-2024`
- `ng-nta-2026`

Each run keeps a full copy of the rules it used. All three are marked **unverified**. `PAYROLL_TAX_EXAMPLES.md` contains worked examples and nine questions for a tax professional to confirm.

---

## 10. Dashboards, reports, team and wellbeing: what is real and what is demo

| Screen | Status | Detail |
|---|---|---|
| HR dashboard `/dashboard/hr` | Live | Reads real staff, goals, reports, leave requests and organisation data. Only shows demo data on a developer machine with sign-in bypass switched on. |
| Executive dashboard `/dashboard/executive` | Live | Real staff and goals; AI executive briefing. |
| Manager dashboard `/dashboard/manager` | Live | Real team, goals and reports. |
| Employee dashboard `/dashboard/employee` | Live | 360 status card; links to the real report form. |
| 360 status `/dashboard/360` | Live | The participant's own cycle status. |
| Profile `/dashboard/profile` | Partial | Profile edits save; the photo upload progress bar is simulated. |
| **Report form `/reports/submit`** | **Live** | Saves the report to the database and can update goal progress. Reached from the employee dashboard. |
| **Reports `/dashboard/reports`** (sidebar) | **Demo** | Submission only lives in the page and says "your manager has been notified" without notifying anyone. Refreshing loses it, so these reports never reach the appraisal. |
| Performance `/dashboard/performance` | Demo | Fixed appraisal history and locally editable goals. Contradicts the real `/goals` and `/appraisal`. |
| Team `/dashboard/team` | Demo | Team, meetings, tasks and chat are sample data; the AI team summary is real but works on sample content. |
| AI & wellbeing `/dashboard/ai-wellbeing` | Partial | Real AI coaching and wellbeing responses, over hard-coded peer history and suggestions. |
| `/team`, `/reports` (top level) | Not built | "Coming soon" placeholders. |
| Leave, PIPs, learning, development plans | Not built | "Coming soon" in the sidebar. Appraisal development commitments do exist separately. |

---

## 11. Email and notifications

- **Provider:** Resend, sending from the verified domain `pulse.stuartdavidson.org`, with the organisation's reply-to address.
- **Emails Pulse sends:**
  - staff invitations
  - 360 participant notices
  - 360 rater invitations, naming the person being reviewed
  - launch notices
  - reminders
- **In-app notifications** appear in the notification panel.
- **Background delivery:** two Supabase Edge Functions (`send-notification`, `send-reminders`) and a `pg_cron` schedule for 360 reminders.
- **Not yet built:** delivery, bounce and complaint tracking from Resend (HR cannot see whether an email bounced), and per-cycle reminder scheduling.

---

## 12. AI features

All AI runs through Anthropic Claude on the server. AI never writes to scores or decisions.

| Feature | Where it appears |
|---|---|
| 360 comment synthesis, individual and group | 360 reports, with HR review |
| Report analysis | Report form |
| Appraisal recommendation text | Appraisal |
| Coaching insight, wellbeing response | AI & wellbeing |
| Executive briefing | Executive dashboard |
| Team summary | Team workspace |
| Training suggestions | Development areas |

The 360 synthesis treats rater anonymity as a hard requirement: it works from pseudonymised comments and is instructed not to reveal who said what.

A second AI provider client (DeepSeek) exists in the code but is not used.

---

## 13. How data is protected

- **Every record belongs to an organisation.** Every server route works out the caller's organisation from their sign-in, never from what the browser sends.
- **Two lines of defence.** Server routes use a privileged database connection, so they check organisation and role in code. Database row-level security is the second line, not the only one.
- **Salaries** are invisible to browsers at the column level. Payroll tables are closed to browsers entirely.
- **Sensitive functions** (payroll, org publishing, appraisal commands) can only be called by the server, not by signed-in browsers.
- **360 confidentiality:**
  - suppression below the minimum group size
  - pseudonymised comments
  - no comment-to-rater links in exports
  - released-only access for participants and managers
- **Audit trails** are kept for payroll, appraisal, org publishing and 360 release, access and export.
- **Spreadsheet exports** escape formula characters, so a name like `=HYPERLINK(...)` cannot run.
- **Security housekeeping outstanding:** the Supabase service-role key and the database password were exposed earlier (including in git history) and should be rotated.

---

## 14. Known gaps and open decisions

**Decisions waiting on SD**

1. **Tax rules.** Review `PAYROLL_TAX_EXAMPLES.md` with a tax professional and mark the rule sets verified. Then decide whether unverified rules should **block** payroll approval (today they only warn).
2. **Job level names.** Each organisation defines its own levels ("Level 1 … n") at setup, used consistently across the tenant. Direction agreed, not yet built.
3. **360 direct-report meaning.** Agree the definitive wording used in labels, templates and reports.

**Gaps that affect correctness**

| Gap | Effect | Fix |
|---|---|---|
| Sidebar "Reports" doesn't save | Reports submitted there never reach the appraisal's 20% | Point the sidebar at the real form, or connect this page to it |
| Legacy Performance dashboard shows invented history | Staff may update goals in the wrong place | Retire it or rebuild it on live data |
| An older appraisal evidence endpoint can still attach evidence without the review checks | An HR-only side door around the workflow rules | Retire its write actions (the current screen doesn't use them) |
| Planning screens don't page through very large result sets | Very large organisations could see incomplete rollups | Add paging, as payroll now does |
| Executives see a Payroll link they cannot open until HR grants them a right | Confusing first click | Show the link only when granted, or grant "approve" during setup |

**Operational work not yet built**

- Durable PDF batch jobs; the current batch lives in server memory.
- Email delivery and bounce tracking.
- Per-cycle reminder scheduling.
- HR screens for cycle operations history, governance (retention, purge certificates, export audit) and framework versioning.
- Monitoring and alerting for failed sends, jobs and purges.
- Splitting the very large 360 console file (`src/app/assessments/page.tsx`, about 3,500 lines).

**Not built:** leave, performance improvement plans, learning and development, development plans, matrix reporting.

**Not yet done:** a full rehearsal with real roles in a test organisation, from org chart to strategy, goals and KPIs, saved reports, appraisal release, bonus preview, payroll approval, export and employee payslip, plus a separate real-email 360 rehearsal.

---

## 15. Running the platform: setup, secrets and database migrations

### 15.1 Settings the application needs

| Setting | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser connection to Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes; keep secret |
| `NEXT_PUBLIC_APP_URL` | Links in emails (`https://app.pulse.stuartdavidson.org`) |
| `RESEND_API_KEY`, `FROM_EMAIL` | Sending email |
| `SUPER_ADMIN_EMAIL`, `NEXT_PUBLIC_SUPER_ADMIN_EMAIL` | Platform super-admin (`hello@stuartdavidson.org`) |
| `ANTHROPIC_API_KEY` | AI features |
| `PULSE_EDGE_SECRET` | Shared secret between the app and Edge Functions |
| `CRON_SECRET` | Protects scheduled endpoints (retention purge) |

The Edge Functions need their own secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `APP_URL` and `PULSE_EDGE_SECRET`.

### 15.2 Database migrations

Migrations live in `supabase/migrations/` and run in date order. Never edit one that has been applied; make a new one. `supabase/schema/` holds readable reference copies.

| Migration | What it adds | State |
|---|---|---|
| `20260903_000001_assessment_schema` | 360 core tables | Live |
| `20260904_000001_assessment_response_contract` | Items, unable-to-observe, drafts | Live |
| `20260904_000002_assessment_report_access_tiers` | Report status and access tiers | Live |
| `20260905_000001_assessment_prior_cycle` | Cycle baseline and clone links | Live |
| `20260908_000001_org_reply_to_email` | Organisation reply-to address | Live |
| `20260909_000001_organisation_structure` | Org chart drafts, versions, publishing | Live |
| `20260909_000002_vacant_position_reporting` | Routing around vacant posts | Live |
| `20260909_000003_assessment_participant_withdrawal` | Withdraw instead of delete | Live |
| `20260909_000004_assessment_rater_rules` | Rater minimums and quotas | Live |
| `20260910_000001_performance_appraisal_workflow` | Appraisal workflow | Live |
| `20260910_000002_strategy_cascade` | Strategy levels; goal and KPI links | Live |
| `20260916_000001_restrict_salary_visibility` | Hide salaries from browsers | Live |
| `20260916_000002_payroll` | Payroll tables and guards | Live |
| `20260916_000003_payroll_atomic_calculation` | All-or-nothing calculation | Live |
| `20260917_000001_payroll_control_hardening` | Frozen payment details, database maker-checker, once-only bonuses | Live |

All fifteen were confirmed present in the live database on 18 September 2026 by read-only checks: each migration's distinguishing column or function was queried. A new migration should be added to this table when it is written and marked live once run.

---

## 16. Testing

| What | How |
|---|---|
| Rules and calculations (about 395 tests) | `node --experimental-strip-types --test src/lib/*.test.ts` |
| Database behaviour against real Postgres | `node --experimental-strip-types scripts/tests/<name>-db.mjs`: payroll, payroll-calculation, payroll-controls, salary-visibility, appraisal, organisation-structure |
| Browser journeys | `scripts/tests/*-browser.mjs` against `npx next dev -p 3100`, using Chrome (`PULSE_TEST_BROWSER`). Use `localhost`, not `127.0.0.1`. |
| Type check and build | `npx tsc --noEmit` and `npx next build` |

Test tools are installed without saving them to the project, all in one command, because separate `--no-save` installs remove each other:

```
npm i --no-save @electric-sql/pglite playwright marked
```

Browser tests use invented data and block outside traffic. Passing tests prove the code does what it says; they do not prove Supabase, email or tax rules are configured correctly in production.

---

## 17. Document map

| Document | Status | Use it for |
|---|---|---|
| **`PULSE_BIBLE.md`** (this document) | Current | The overall picture |
| `APP_AUDIT_2026-09-17.md` | Current as of 17 Sept | Independent audit findings; its payroll findings are now fixed (section 9.3) |
| `PAYROLL_TAX_EXAMPLES.md` | Current | Worked tax examples for professional review |
| `PERFORMANCE_APPRAISAL.md` | Current | Appraisal detail and design references |
| `ORGANISATION_STRUCTURE.md` | Current | Org chart detail and deployment notes |
| `INTERFACE_THEME.md` | Current | Visual design conventions |
| `CONTRACT.md` | Reference | 360 response contract |
| `PULSE_360_GAP_REPORT.md` | Mostly current for 360 | Deeper 360 study pack |
| `OPERATOR_ROADMAP.md` | Out of date (8 Sept) | Step-by-step 360 journey; predates planning, appraisal and payroll |
| `PULSE_TODO.md` | Out of date (9 Sept) | Replaced by sections 14 and 15 |
| `HANDOVER.md`, `MILESTONE_PLAN.md`, `LAUNCH_CHECKLIST.md` | Historical (early Sept) | Early 360 planning |
| `REHEARSAL_REPORT.md`, `RECONCILIATION_REPORT.md`, `ASSESSMENT_E2E_QA.md` | Historical | Records of past checks |
| `README.md` | Boilerplate | Not yet written |

---

## 18. Build history

| When | What arrived |
|---|---|
| Up to 2 Sept | Core platform: sign-in, onboarding, dashboards, first 360 framework, nominations and reviewer workflow |
| 3–5 Sept | 360 response contract, database scoring, rater queue, four-tier report access, AI synthesis, delivery and reminders, synthetic rehearsal |
| 6–8 Sept | 360 lifecycle, report console, reply-to address, instrument builder, dashboards made 360-aware |
| 9 Sept | Organisation structure editor; reopen and clone cycles; rater emails fixed; withdraw vs delete; cohort from the org chart; automatic raters |
| 10 Sept | Evidence-based appraisal; goals and KPIs linked to cycles; goal creation; strategy cascade; KPI authoring; 360 report viewer |
| 12–14 Sept | Shared visual theme; planning screens; accessibility fixes |
| 16 Sept | Salaries hidden from browsers; payroll engine, API and screens; payslips; performance bonuses |
| 17 Sept | Independent audit; payroll controls hardened in response |
| 18 Sept | This document |
