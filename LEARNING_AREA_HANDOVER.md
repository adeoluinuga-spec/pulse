# Pulse Learning Area

Updated: 1 October 2026. Built for a Pulse tenant delivering training to an external client.

## Model and scope

Stuart Davidson is the tenant; Bracken Media Solutions is its training client. Bracken trainees do not need Pulse accounts or employee records. Every cohort belongs to its creator's organisation. The feature is available to other tenants through the same organisation-scoped routes.

The first version contains materials, structured forms, fixed-row IDPs, commitments, individual reflections and **actual group role-play**. Role-play is a shared written conversation with assigned roles, ordered turns, a fixed number of rounds and an optional observer. It is not video conferencing, an AI simulation or a general chat room.

Anonymous staff surveys are separate: there are no survey foreign keys, matching routines, joined reports or survey reads in this module.

## Where to find it

- HR desktop: Talent development > Learning area.
- HR mobile: profile menu > Learning area.
- `/cohorts`: programme list.
- `/cohorts/new`: programme name, client name and optional manager development starter activities.
- `/cohorts/[id]`: Trainees, Activities and Responses tabs.
- `/t/[token]`: personal trainee dashboard, without sign-in.
- `/t/[token]/a/[activityId]`: material, form or group role-play.

## First Bracken programme

1. Sign in as SD HR and open Learning area. Create **Manager Development Programme**, client **Bracken Media Solutions**, with starter activities selected.
2. Add trainees, one line per person: `Name, email`. Email is optional. A malformed row rejects the whole batch with its line number. Existing email duplicates also reject the batch.
3. Copy each personal link, or use Copy all links for distribution. New links last 180 days. Revoke a link to disable it, then Issue new link to replace it. No bulk invitation email is sent by creating trainees.
4. Materials and commitment/reflection forms in the starter can be used immediately. **Practice scenarios, role-play and IDP start hidden.** Replace the placeholder scenarios with the actual training material before releasing them.
5. Edit the role-play scenario and roles before creating groups. Assign each role to a different trainee. An observer is optional. Each trainee belongs to at most one group per role-play activity; add another role-play activity for another practice round or different pairing.
6. Release the activity. Each group sees its own conversation and participant names, with the current speaker named. Player turns advance automatically; the final round completes the activity. Observers can add feedback during or after the conversation. HR can finish a group early.
7. Release the IDP when needed. It contains three fixed goal rows plus separate strengths and support questions.
8. Review named submissions and role-play transcripts in Responses. Copy or download CSV. Drafts are visible to HR and are clearly marked as drafts; trainees are told this.

The five training scenarios were not supplied. They are deliberately not invented or released as original training content. The starter is offered to each tenant when creating a programme; it has **not been inserted into the production SD account by this build**.

## Saving and progress

- Materials have an explicit Mark as read action.
- Forms offer Save draft and Submit. Required fields are enforced on submission, not draft save. Saving is explicit; typing alone is not saved.
- Reopening a form restores its latest saved answers. Resubmitting replaces the same trainee/activity record.
- Submission returns to the dashboard with the existing seven-second success popup.
- Only released activities count toward progress. Completed role-play groups count as done for assigned players and observers.
- Conversation refreshes every 15 seconds while visible, and also has a refresh control. Posting does not clear the input until the server accepts it. A retry uses the same request ID, avoiding duplicate messages or consuming two turns.
- Existing work locks an activity's questions/type/config. Create another activity if wording or roles must change after collection begins. Activities with work attached can be hidden but not individually deleted.

## API and data

- `GET/POST /api/learning/cohorts`: current tenant's programme list and creation.
- `GET/POST /api/learning/cohorts/[id]`: tenant-scoped management and response reads.
- `GET/POST /api/public/learning/[token]`: token-bound reads, draft/submission saves and role-play messages.
- Tables: `learning_cohorts`, `learning_trainees`, `learning_activities`, `learning_submissions`, `learning_rooms`, `learning_room_members`, `learning_messages`, `learning_request_limits`.
- HR routes verify the authenticated user through the anon client, resolve their employee organisation, require HR/super-admin, then use a service-role client with explicit tenant predicates.
- Public routes resolve the token on the server. Caller-supplied trainee or tenant IDs never choose the owner of a submission.
- Composite foreign keys prevent a trainee, activity, room and submission crossing cohort boundaries.
- All new tables deny direct anon/authenticated access. Write RPCs are service-role-only. Transactional RPCs recheck expiry, revocation, release and cohort status before writing.
- Personal tokens have 256 bits of randomness. Lookup uses SHA-256; a separately encrypted copy lets authorised HR copy links again. The encryption key is derived from `LEARNING_LINK_SECRET`, falling back to the existing service-role key. Neither raw token nor ciphertext is returned to trainees in API payloads. Do not log full learning URLs.
- Archived cohorts, expired and revoked links display human messages. The personal routes are excluded from auth gating, PWA install prompts, notification chrome and service-worker caching. API responses are private/no-store; pages set no-referrer/noindex.
- Form values, config, trainee batches and request size are validated. Markdown uses react-markdown with raw HTML and remote images disabled. CSV cells are protected against spreadsheet formula injection.
- Shared database-backed request limits apply per link (90/minute) and per keyed IP digest (3,000/minute, allowing shared training Wi-Fi). Raw IP addresses are not stored; expired digests are removed when requests arrive. The Vercel edge firewall rule **Pulse learning public API** was published on 1 October: paths starting `/api/public/learning/`, fixed-window limit of 3,000 requests per IP per 60 seconds. The draft was verified to contain only this rule before publishing; other application routes are unaffected.

## Email

Uses the existing `sendPulseEmail` sender and tenant `resolveOrgReplyTo` policy. Successful form submission sends a receipt when the trainee has an email address. A delivery failure does not undo saved work and is reported honestly to the trainee.

The receipt contains a private dashboard link, **not the submitted IDP/reflection payload**. Automatic approval review rejected copying development answers into email; the implemented receipt is the safer alternative. Automated analysis, generated reports, report approval, report emails, reminders, learner uploads and training attendance are deferred.

## Deployment

1. Apply `supabase/migrations/20261001_000001_learning_area.sql` once. `supabase/schema/15_learning_area.sql` is the matching copy-ready documentation snapshot. Do not run both.
2. Keep existing Supabase environment variables, `RESEND_API_KEY` and verified `FROM_EMAIL`. Set `NEXT_PUBLIC_APP_URL` to the canonical deployment origin for email links. Existing tenant reply-to settings continue to apply.
3. Prefer a dedicated strong `LEARNING_LINK_SECRET`, set consistently on local and deployed servers before creating real links. Changing it makes existing encrypted links unreadable to HR; existing token hashes still work. HR can revoke and reissue links after rotation. The service-role-key fallback permits use with existing configuration.
4. Deploy, then create the Bracken cohort from SD's account and rehearse with two test trainees before distribution.

At build time, `supabase migration list --linked` was refused with HTTP 403, insufficient account privileges, and requested `SUPABASE_DB_PASSWORD`. The live migration remains **unverified/unapplied by this agent**. No live trainee emails were sent by testing.

Vercel CLI was signed out and successfully signed in through the browser as `adeoluinuga-9332`. The Windows certificate store was required (`NODE_USE_SYSTEM_CA=1`); TLS verification was not disabled.

## Verification and next steps

- Pure-function tests: name/config validation, required answers, valid scales/choices, IDP rows, malformed/duplicate trainee import, CSV injection and HTML-safe receipts. Personal-link tests check randomness, hashing, encryption round trips, expiry, tamper rejection and wrong-key rejection.
- Isolated PostgreSQL/PGlite tests apply the actual migration and verify direct-access denial, cross-cohort rejection, draft upsert, turn-taking, retry deduplication, observer feedback, config freezing, release checks, expired/revoked links, archived cohorts, reordering and rate limits.
- `scripts/tests/learning-browser.mjs` uses mocked APIs in a real Chrome browser. It verifies 360px layout, draft resume, IDP, different trainee dashboards, two-player role-play, facilitator editing/export, invalid-link handling and screenshots. It does not claim live Supabase integration.
- Run `node --experimental-strip-types --test src/lib/*.test.ts`, `npx tsc --noEmit` and `npx next build` before handover.
- Build verification on 1 October: 439 unit tests passed, 1 pre-existing live-database test skipped; TypeScript and the production build passed. The real-browser rehearsal passed with mocked APIs at phone and desktop sizes. Corrupt generated Next dev type files were removed after stopping the test server, then regenerated; no source workaround was introduced.
- Dependency installation reported 15 audit findings (1 moderate, 13 high, 1 critical) across the dependency tree. Dependency remediation was not included in this feature and needs separate triage.
- Pending live rehearsal: apply migration, verify two real tenant accounts cannot access each other's cohorts, create Bracken with actual trainees/scenarios, check a receipt at an authorised test mailbox, and verify expired/revoked links on the deployed URL.
- Next product phase: facilitator review/analysis, report approval and controlled delivery to trainee and client leadership. Scope it after this first training cohort has been used.
