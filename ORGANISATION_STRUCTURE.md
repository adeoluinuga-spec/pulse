# Organisation structure workspace

Implemented 2026-09-09. Route: `/dashboard/organisation`.

HR can open **Org Structure** in the desktop sidebar, the mobile dashboard tabs,
the HR dashboard, or Organisation Setup (including the Teams tab).

## HR workflow

1. Start from the existing staff list and reporting lines, choose the department
   hierarchy template, or start with a custom blank canvas.
2. Add positions, departments and teams. These are positions in a reporting tree;
   departments and teams are named groups, matching the existing employee model.
3. Select a position and assign an existing employee. Assigning someone already
   placed moves them to that position and leaves the previous position vacant.
4. Choose the reporting position in **Reports to**, or drag the card onto its
   manager. Choose **Top level** for a person with no line manager.
5. Set department, team and leadership responsibility. Team lead is distinct from
   manager, senior manager and director. Direct reports cause an individual
   contributor's responsibility to become manager on publication.
6. Save the draft. Live employees are unchanged. Layout, theme and positions
   persist with the draft; zoom and collapsed branches are local view controls.
7. Review and publish. All existing employees must be placed exactly once,
   assigned positions must have departments, and occupied positions must report
   to occupied positions or sit at the top level. Vacancies without occupied
   direct reports may remain in the chart. Multiple top-level staff are permitted.

Publishing updates `employees.role`, `department`, `team`, `line_manager_id` and
`people_responsibility` in one database transaction. Existing manager dashboards,
360 relationship checks and report entitlement checks read those fields. It does
not change `platform_role`, invite anyone, or send messages. Existing users see
updated profile/navigation information when their profile reloads.

The themes are Cobalt, Forest and Slate. Both horizontal and vertical layouts
support zoom, fit, branch collapse and keyboard-accessible reporting selection.
The first version models primary reporting lines. Matrix/dotted-line relationships,
multiple simultaneous positions per employee and independent department/team
entities are not included.

## Deployment

Apply `supabase/migrations/20260909_000001_organisation_structure.sql` to the
target Supabase project through the normal migration process, then deploy the app.
No new application secret or runtime dependency is required.

The migration creates:

- `organisation_structures`: current draft, roster baseline, revision and last
  published structure.
- `organisation_structure_versions`: immutable-to-browser publication snapshots,
  previous employee fields, publishing actor and timestamp.
- `organisation_structure_roster`: service-only tenant roster read.
- `save_organisation_structure`: service-only validated transactional save/publish.

The app API resolves the authenticated user's tenant; it never accepts an org ID
or actor ID from the browser. Only that tenant's HR/super-admin employee can use
the API. Both tables additionally restrict reads with RLS, and browser roles have
no write privileges or execute privilege on the service functions.

No deployment or client-data migration was performed as part of this local build.
When the migration is absent, the workspace shows a setup-required error rather
than falling back to fictitious staff or browser-only persistence.

## Concurrency and audit

Every save uses an expected revision. An out-of-date editor gets HTTP 409 and
must reload rather than overwrite another person's draft. Publishing additionally
compares the current employee roster to the draft's original roster. A changed
roster blocks publication: reload, choose **Use live reporting lines**, then
reapply and review the desired edits. This conservative first version does not
automatically merge concurrent employee edits.

Publishing briefly takes a SHARE ROW EXCLUSIVE lock on `employees` while checking
the roster, updating staff and recording history. This prevents staff imports or
edits from racing the snapshot; other employee writers wait for that transaction.
Draft saves do not take this table lock. At larger multi-tenant write volumes,
replace it with a shared tenant-version protocol covering every employee writer.

## Verification

- 10 new pure behaviour tests; full suite: 196 pass, 1 existing skip.
- Isolated PostgreSQL/PGlite test executes the actual migration against the base
  schema and checks draft isolation, publication, rollback after simulated history
  failure, manager fields, role preservation, stale revisions/rosters, graph
  validation, cross-tenant assignment, RLS and RPC privileges.
- Browser smoke test uses synthetic staff and intercepts the structure API. It
  checks desktop/mobile editing, circular reporting rejection, drag-to-manager,
  draft persistence, publish review, incomplete-template blocking, undo and
  removal. External network calls are blocked. This is not live Supabase evidence.
- Unauthenticated GET and PUT requests to the actual Next route return 401.
- TypeScript and the production build pass. Targeted lint for the new feature and
  edited navigation passes. Full-repository lint remains blocked by three existing
  errors in `src/app/assessments/page.tsx`, `src/app/review/[token]/ReviewFlow.tsx`
  and `src/app/review/queue/[token]/page.tsx` (plus 11 existing warnings).

Pure tests: `node --experimental-strip-types --test src/lib/organisationStructure.test.ts`.
The DB/browser harnesses live in `scripts/tests/organisation-structure-*.mjs`.
They use optional tools installed outside the application dependencies:

```powershell
npm.cmd install --prefix "$env:TEMP/pulse-structure-tools" --no-audit --no-fund --package-lock=false @electric-sql/pglite playwright
$env:PULSE_TEST_TOOLS = "$env:TEMP/pulse-structure-tools"
node scripts/tests/organisation-structure-db.mjs
# In a separate terminal, run the local development server:
$env:NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS = 'true'
npm.cmd run dev -- --hostname 127.0.0.1 --port 3100
# Back in the test terminal:
$env:PULSE_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/tests/organisation-structure-browser.mjs
```

After migration/deployment, rehearse with an actual HR account: edit/save/reload,
publish a controlled reporting change, verify the affected manager dashboard and
360 relationship resolution, then attempt access as a standard employee and HR
from another tenant. Record deployment evidence before marking it live.

SQL Editor handover: supabase/schema/09_organisation_structure.sql contains the transactional run-once script. Linked CLI migration attempts failed with LegacyDbConfigLoginRoleNetworkError / TransportError; live application remains unverified.
