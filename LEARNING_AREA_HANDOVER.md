# Pulse Learning Area

Updated: 2 October 2026. Built for a Pulse tenant delivering training to an external client.

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

### Facilitator and trainee walkthrough

Start at **Talent development > Learning area > New programme** while signed in as SD HR. Enter the programme and client names, select the starter activities, then choose **Create programme**. Bracken remains an external training client, not a new Pulse tenant or a set of SD employee records.

Prepare content in **Activities** before inviting real trainees. The current activity editor includes structured JSON configuration; it is not yet a fully visual course builder. Finalise questions, role names and rounds before creating role-play groups or collecting submissions. Replace the hidden placeholder scenarios with the actual workshop material, then release only the activities ready for use.

In **Trainees > Add trainees**, paste one `Name, email` entry per line. Copy each person's link and send it individually through your chosen channel. **Creating trainees does not send invitation emails.** Do not post the collection of personal links in a shared group: each link grants access to that trainee's dashboard and saved work.

For role-play, define the scenario and roles, create a group, assign a different trainee to each role and optionally add an observer. Release the activity. Participants open their own links and converse in character through written, ordered turns. They do not need to be in the same room, but this is not a video-call tool. Observers can leave feedback; HR reviews the conversation in **Responses**.

Trainees open their personal link to see released activities and progress. They mark reading as read, fill in commitments/reflections/IDPs, click **Save draft** before leaving unfinished work and click **Submit** when ready. Reopening the same link restores saved answers. Drafts are visible to SD, and the interface tells trainees this. A successful form submission attempts a receipt email when an address is present; it does not email the submitted answers.

HR uses **Responses** to review named submissions and transcripts and copy/download CSV. Automatic AI analysis, consultant approval and delivery of generated reports to trainees or Bracken leadership are not part of this release.

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

### Trainee invitation emails (2 October)

In **Trainees**, expand **Email invitations**. Use **Send invitations** for eligible trainees, or the envelope beside a person to send individually. After a successful send the individual control becomes Resend. Creating trainees still does not send automatically: HR decides when the programme is ready. Copy-link distribution remains available.

- Uses the existing Resend API key and verified FROM_EMAIL. Replies use the programme owner's tenant-specific reply-to policy, including its HR fallback. No additional migration or Edge Function deployment is required for invitations.
- One message goes to one trainee, containing their name, programme, client and private dashboard link. Resending preserves the active link; it does not rotate tokens.
- Missing/invalid email, expired/revoked/unrecoverable links and archived programmes cannot be sent. Issue a new link where needed. The server independently checks authenticated HR access, tenant ownership and trainee membership.
- The browser processes the cohort sequentially with pacing; keep the page open. Each HTTP request handles one recipient, avoiding a single long-running bulk request. Results and retry IDs are held only in the current mounted view, not stored as an invitation history. Refresh/navigation discards them and stops scheduling further requests; an already-running request may still complete.
- **Accepted by Resend** is provider acceptance, not proof of inbox delivery. Failures remain visible per trainee. Clicking Send invitations again retries those not accepted in this session, without repeating successful recipients. Individual Resend intentionally sends another message.
- An uncertain/failed request reuses its provider idempotency key within the same view; a successful resend receives a fresh key. Provider deduplication is subject to [Resend's documented 24-hour retention window](https://resend.com/changelog/idempotency-keys). There is no durable background queue, delivery webhook tracking or automatic retry after leaving the page.
- No live invitation emails were sent during implementation tests. Rehearse with an authorised test mailbox before bulk client distribution. Earlier setup guidance about copying links describes the still-supported manual alternative.
- Verification: 453 unit tests passed, one existing test skipped. TypeScript and production build passed. Chrome rehearsal with mocked APIs covered cohort sends, per-recipient failure, retry-key reuse, successful-recipient exclusion on retry and the 360px invitation layout. Sender tests verified the existing From address, tenant Reply-To, single recipient and provider idempotency header without sending mail.

The receipt contains a private dashboard link, **not the submitted IDP/reflection payload**. Automatic approval review rejected copying development answers into email; the implemented receipt is the safer alternative. Automated analysis, generated reports, report approval, report emails, reminders, learner uploads and training attendance are deferred.

## Deployment

1. Apply `supabase/migrations/20261001_000001_learning_area.sql` once. `supabase/schema/15_learning_area.sql` is the matching copy-ready documentation snapshot. Do not run both.
2. Keep existing Supabase environment variables, `RESEND_API_KEY` and verified `FROM_EMAIL`. Set `NEXT_PUBLIC_APP_URL` to the canonical deployment origin for email links. Existing tenant reply-to settings continue to apply.
3. Prefer a dedicated strong `LEARNING_LINK_SECRET`, set consistently on local and deployed servers before creating real links. Changing it makes existing encrypted links unreadable to HR; existing token hashes still work. HR can revoke and reissue links after rotation. The service-role-key fallback permits use with existing configuration.
4. Deploy, then create the Bracken cohort from SD's account and rehearse with two test trainees before distribution.

At build time, `supabase migration list --linked` was refused with HTTP 403, insufficient account privileges, and requested `SUPABASE_DB_PASSWORD`. **The user subsequently confirmed applying the migration. Live checks on 1 October verified the eight learning tables and the save/group-creation RPCs are available. Do not reapply the migration.** These checks do not establish a full live end-to-end rehearsal or inspect migration-history bookkeeping. No live trainee emails were sent by testing.

Vercel CLI was signed out and successfully signed in through the browser as `adeoluinuga-9332`. The Windows certificate store was required (`NODE_USE_SYSTEM_CA=1`); TLS verification was not disabled.

### Post-migration live checks

Checked the configured Supabase project and `https://app.pulse.stuartdavidson.org` after the user's migration confirmation:

- All eight learning tables returned HTTP 200 to service-role count-only reads; each contained zero records at the time of the check. Anonymous reads returned HTTP 401. No trainee answers or personal records were retrieved.
- `learning_save` with a deliberately invalid token returned `This link is no longer active.` Anonymous execution returned PostgreSQL `42501`, permission denied. The probe did not create a submission.
- `learning_create_room` with nonexistent cohort/activity IDs returned `Choose a role-play activity.` No group was created.
- Unauthenticated `/cohorts` returned HTTP 307 to sign-in. `/api/learning/cohorts` returned HTTP 401 with `Sign in to manage learning programmes.`
- `/t/not-a-valid-link` returned HTTP 200 without a login redirect, allowing the public page to render. Its API returned HTTP 404 with a human-readable request for a new link. Both responses prevented caching. This verifies the invalid-link route, not successful access through a real trainee link.
- Local `NEXT_PUBLIC_APP_URL` was unset. The receipt handler falls back to the request origin; production environment values were not inspected in this check. Explicitly configure the canonical URL for predictable receipt links.
- Initial local Node requests failed certificate validation; retrying with `NODE_USE_SYSTEM_CA=1` succeeded. TLS verification was never disabled. The initial network failures were not treated as database permission results.

**Current assessment:** the migration's core objects and deployed routes are available, and the checked unauthenticated restrictions hold. Successful authenticated programme creation, live saves, receipt delivery and cross-tenant behaviour still require the rehearsal below. Earlier browser tests used mocked APIs and do not replace it.

## Verification and next steps

- Pure-function tests: name/config validation, required answers, valid scales/choices, IDP rows, malformed/duplicate trainee import, CSV injection and HTML-safe receipts. Personal-link tests check randomness, hashing, encryption round trips, expiry, tamper rejection and wrong-key rejection.
- Isolated PostgreSQL/PGlite tests apply the actual migration and verify direct-access denial, cross-cohort rejection, draft upsert, turn-taking, retry deduplication, observer feedback, config freezing, release checks, expired/revoked links, archived cohorts, reordering and rate limits.
- `scripts/tests/learning-browser.mjs` uses mocked APIs in a real Chrome browser. It verifies 360px layout, draft resume, IDP, different trainee dashboards, two-player role-play, facilitator editing/export, invalid-link handling and screenshots. It does not claim live Supabase integration.
- Run `node --experimental-strip-types --test src/lib/*.test.ts`, `npx tsc --noEmit` and `npx next build` before handover.
- Build verification on 1 October: 439 unit tests passed, 1 pre-existing live-database test skipped; TypeScript and the production build passed. The real-browser rehearsal passed with mocked APIs at phone and desktop sizes. Corrupt generated Next dev type files were removed after stopping the test server, then regenerated; no source workaround was introduced.
- Dependency installation reported 15 audit findings (1 moderate, 13 high, 1 critical) across the dependency tree. Dependency remediation was not included in this feature and needs separate triage.
- Migration application: confirmed by the user, with the post-migration live checks recorded above. No repeat application is needed.
- Next product phase: facilitator review/analysis, report approval and controlled delivery to trainee and client leadership. Scope it after this first training cohort has been used.

### Remaining live rehearsal checklist

- [x] Verify all eight learning tables are accessible to the server and denied to anonymous callers.
- [x] Verify live save/group-creation functions reject invalid identifiers and anonymous save execution is denied.
- [x] Verify deployed HR routes require authentication and invalid trainee links do not demand sign-in.
- [ ] Sign in as SD HR and create a clearly labelled test programme with starter activities.
- [ ] Add two authorised test trainees and distribute their different links privately. Do not use real client trainees as test data.
- [ ] Open each link separately; confirm each dashboard shows the correct trainee and only released activities.
- [ ] Save a draft, close/reopen the link, verify restoration, submit and confirm it appears under HR Responses.
- [ ] Check receipt delivery at an authorised test mailbox and verify its link returns to the correct dashboard.
- [ ] Configure and release a short two-person role-play; complete ordered turns and check the HR transcript. Exercise observer feedback with an optional third test trainee.
- [ ] Complete an IDP, inspect progress and export CSV; verify the exported records match the test submissions.
- [ ] Verify a second real tenant cannot list/read/manage SD's cohort and SD cannot access the other tenant's cohort.
- [ ] Revoke a test link and verify the deployed human message; check expiry and archived-programme behaviour without disrupting a real programme.
- [ ] Create the actual Bracken programme with approved training scenarios and real trainees only after the rehearsal passes.
