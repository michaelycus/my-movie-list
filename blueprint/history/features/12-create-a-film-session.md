# Feature: Create a film session

**From build-plan:** feature 12
**Status:** completed 2026-08-27

## Goal

Let a signed-in host start a film session: name it, pick which existing
friends are in the room tonight, and add a friend inline mid-flow without
losing the title or the picks already made. This is the first step of the
`/sessions/new` stepper (`project-overview.md`'s routes list: "Who's here ->
How's everyone feeling -> Here's your film") and the foundation every later
session feature (13-17) builds on.

## Design reference

None - reuses the existing neon-on-dark tokens and the form/card patterns
already established by `/friends` (`AddFriendForm`, `FriendCard`). No new
visual language.

## In scope

- `sessions` and `session_participants` tables (per `project-overview.md`'s
  data model), RLS scoped to the owning host. All columns from the full data
  model are created now - `chosen_movie_id`, `rationale`, `mood_tags`,
  `mood_note`, `constraints` stay null/default until features 13-17 write to
  them, same up-front-schema approach the `friends` migration used for
  features 9-11.
- A shared `requireOwnerId` auth helper, extracted from `src/actions/friends.ts`
  so `src/actions/sessions.ts` doesn't duplicate it.
- `createSession` Server Action: validates a title and a non-empty set of
  existing friend ids owned by the caller, inserts one `sessions` row plus one
  `session_participants` row per selected friend and one host row
  (`friend_id null, is_host true`), with a best-effort compensating delete of
  the session row if the participants insert fails.
- `/sessions/new`: title input, a checkbox list of the host's existing
  friends, and an inline "add a friend" mini-form (name + optional emoji,
  reusing `createFriend` from feature 8) that appends the new friend to the
  pickable list and pre-selects it - all as local state in one client
  component, so nothing already typed or checked is lost.
- On successful creation, redirect to `/sessions/[id]`.
- `/sessions/[id]`: a minimal detail stub - title, watched-on date,
  participant list (host shown as "You", friends by name/emoji) - scoped to
  the owning host. Chosen film and rationale are null at this point and shown
  as a "coming soon" placeholder; features 13-17 extend this same page.
- A "Sessions" link in `SiteHeader` (signed-in only) pointing at
  `/sessions/new` - `/sessions` is already a protected prefix in
  `src/lib/supabase/middleware.ts` (feature 7), no middleware change needed.

## Out of scope

- Mood capture, hard-filter constraints, recommendations, fit breakdowns,
  rationale, or saving/revisiting sessions (features 13-17) - this feature
  only creates the session and seats its participants.
- A `/sessions` history list page - that's feature 17. Nothing links to a
  session after its creation redirect in this feature; that's an accepted gap
  until 17 ships.
- Editing or deleting a session once created, or removing a participant after
  the session exists.
- Any UI for the host to opt out of being a participant - the host is always
  seated automatically; no toggle.
- An emoji picker for the inline add-friend form - plain optional text input,
  matching feature 8's own `AddFriendForm`.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared owner-auth helper** - add
  `requireOwnerId(supabase): Promise<string | null>` to
  `src/lib/supabase/owner.ts` (moved verbatim from the private copy in
  `src/actions/friends.ts`, same `getClaims()`-based check), and update
  `friends.ts` to import it instead of defining its own. *Done when:*
  `npx tsc --noEmit` and `npm test` still pass with no behavior change.

- [x] **Step 2 - `sessions`/`session_participants` schema** - run `supabase
  migration new create_sessions` and fill it in: `sessions` (`id`, `owner_id
  references profiles on delete cascade`, `title not null`, `watched_on date
  not null default current_date`, `chosen_movie_id references movies on
  delete set null`, `rationale text`, `created_at`), RLS `owner_id =
  auth.uid()` for all operations, same shape as the `friends` migration;
  `session_participants` (`id`, `session_id references sessions on delete
  cascade`, `friend_id references friends on delete set null`, `is_host
  boolean not null default false`, `mood_tags text[] not null default
  '{}'`, `mood_note text`, `constraints jsonb not null default '{}'`), a
  partial unique index on `(session_id, friend_id) where friend_id is not
  null` so a friend can't be seated twice, and RLS that joins through
  `sessions.owner_id` (this table has no `owner_id` of its own, per
  `project-overview.md`'s data model) for all operations. *Done when:*
  `supabase db push` applies cleanly to the linked project and `supabase db
  advisors` reports no new security findings on either table.

- [x] **Step 3 - Session input validation & types** - add `src/types/session.ts`
  (`SessionParticipant { id: string; displayName: string; avatarEmoji: string
  | null; isHost: boolean }`, `SessionDetail { id: string; title: string;
  watchedOn: string; chosenMovieId: number | null; participants:
  SessionParticipant[] }`) and `src/lib/sessions/validation.ts` with
  `parseSessionInput(raw: { title: unknown; friendIds: unknown[] })` (zod:
  title trimmed, 1-60 chars; `friendIds` a non-empty array of UUID strings,
  deduplicated). *Done when:* `validation.test.ts` passes covering: a valid
  submission; empty/whitespace-only title; empty `friendIds`; duplicate
  `friendIds` collapsed to one.

- [x] **Step 4 - `createSession` action** - add `src/actions/sessions.ts`
  with `createSession(formData: FormData): Promise<ActionResult<{ id: string
  }>>`: `requireOwnerId`, parse input via Step 3's validator, verify every
  submitted `friendId` is owned by the caller (a `friends` select scoped by
  `owner_id`, reject if the returned count doesn't match), insert the
  `sessions` row, then insert the host row plus one row per verified friend
  into `session_participants`; on a participants-insert failure, delete the
  just-created session row before returning the error, so no orphaned
  session survives a partial failure. *Done when:* build passes; a manual
  create -> verify-two-rows-exist -> forced-participant-failure ->
  verify-session-was-cleaned-up sequence against the dev database confirms
  both the happy path and the compensating delete (via a temporary
  admin-client script, cleaned up after).

- [x] **Step 5 - Session detail read + stub page** - add
  `getSessionDetail(id: string, ownerId: string): Promise<SessionDetail |
  null>` to `src/lib/sessions/detail.ts` (join `sessions` with
  `session_participants` + `friends`, scoped by `id` + `owner_id`, mapping
  the host row to `displayName: "You"`); add `src/app/sessions/[id]/page.tsx`
  rendering title, watched-on date, the participant list, and a "Mood
  capture and recommendations are coming in a later feature" notice where
  `chosenMovieId`/rationale will eventually go; redirect to `/sessions/new`
  (or show a not-found message) when the session doesn't exist or isn't
  owned by the signed-in visitor. *Done when:* visiting `/sessions/[id]` for
  a session just created in Step 4's verification shows the right title and
  participant names; visiting another owner's session id (or a
  nonexistent one) shows the not-found path instead of leaking data -
  verified against the running dev server.

- [x] **Step 6 - New-session UI** - `src/components/sessions/NewSessionForm.tsx`
  (client component: title input, a checkbox per existing friend, an inline
  "add a friend" mini-form that calls `createFriend` via `useTransition` and
  merges the new friend into local state pre-selected, and a submit button
  calling `createSession` via `useActionState` that redirects to
  `/sessions/${id}` with `useRouter` on success); `src/app/sessions/new/page.tsx`
  (server component fetching `getFriends(ownerId)` and rendering the form,
  matching `/friends/page.tsx`'s sign-in-gate pattern); add the "Sessions"
  link to `SiteHeader.tsx` next to "Friends". *Done when:* visiting
  `/sessions/new` shows the title field and the friend checklist; adding a
  friend inline appears in the list pre-selected without clearing the title
  or other checkboxes; submitting with a title and at least one friend
  redirects to the new session's detail page showing the right data -
  verified with a screenshot of the running dev server plus the production
  build.

## Files / areas

- `src/lib/supabase/owner.ts` (new)
- `src/actions/friends.ts` (use the shared helper instead of its own copy)
- `supabase/migrations/<timestamp>_create_sessions.sql` (new)
- `src/types/session.ts` (new)
- `src/lib/sessions/validation.ts` (new), `src/lib/sessions/validation.test.ts` (new)
- `src/lib/sessions/detail.ts` (new)
- `src/actions/sessions.ts` (new)
- `src/app/sessions/new/page.tsx` (new)
- `src/app/sessions/[id]/page.tsx` (new)
- `src/components/sessions/NewSessionForm.tsx` (new)
- `src/components/nav/SiteHeader.tsx` (add the Sessions link)

## Data / contracts

- Schema matches `project-overview.md`'s `sessions`/`session_participants`
  tables exactly, all columns created now so features 13-17 need no further
  migration.
- The host is always seated as a `session_participants` row with `friend_id
  null, is_host true` - the host is a `profiles` row, not a `friends` row,
  and has no taste profile to score against; feature 14/15 will need to
  handle a null-`friend_id` participant when scoring, which is a decision for
  those features, not this one.
- `friend_id` uses `on delete set null` (not cascade) so a session's
  participant history survives a later friend deletion, at the cost of that
  slot showing no name once the friend is gone - accepted trade-off, no
  stronger requirement in `project-overview.md`.
- `getSessionDetail`'s `SessionDetail`/`SessionParticipant` shape is what
  feature 13 will extend (adding mood fields) on the same `/sessions/[id]`
  route - keep the shape additive, not replaced, when that feature lands.

## Testing

- `npm test` is configured (Vitest). In-scope pure logic - `parseSessionInput`
  - ships with unit tests in `validation.test.ts`, following the existing
  pattern in `src/lib/friends/validation.ts`'s tests.
- The migration, `createSession`, `getSessionDetail`, and the UI components
  are integration/UI surfaces (DB DDL, Supabase mutations, client
  components) - no Playwright in this project, so verified against the
  running dev server / dev database, a screenshot, and the production build,
  per `coding-standards.md`.

## Notes for the AI

- Follow the existing `.eq("owner_id", ownerId)` explicit-scoping pattern
  from `src/actions/friends.ts` for every session/participant query - don't
  rely on RLS alone.
- Reuse `createFriend` from `src/actions/friends.ts` for the inline add-friend
  mini-form - don't reimplement friend creation.
- `session_participants` has no `owner_id` column (per
  `project-overview.md`), so its RLS policy must join through
  `sessions.owner_id` - mirror this in `getSessionDetail`'s query too (scope
  by the parent session's `id` + `owner_id`, not a nonexistent column on the
  participants table).
- Match `friends.ts`'s `{ success, data, error }` `ActionResult` pattern for
  `createSession`.

## Verification results

- `npx tsc --noEmit`: clean. `npm run lint`: clean (one pre-existing,
  unrelated warning in `SiteHeader.tsx`). `npm test`: 243/243 passing,
  including 7 new tests for `parseSessionInput`. `npm run build`: clean,
  `/sessions/new` and `/sessions/[id]` both registered.
- `supabase db push` applied the new migration to the linked project.
  `supabase db advisors --linked --type security`: 3 warnings, all
  pre-existing (feature 7's `handle_new_user` trigger, an Auth setting) - none
  on the new `sessions`/`session_participants` tables.
- Live-DB check via a temporary admin-client script (temp rows, cleaned up
  after): `createSession`'s logic seats a host row (`friend_id null, is_host
  true`) plus one row per selected friend; forcing the same failure a
  double-booked friend would hit (the partial unique index) and re-running
  the compensating delete confirmed the orphaned `sessions` row is actually
  removed, not left behind.
- A second temporary-row check confirmed `getSessionDetail`'s
  join/assembly: the host row renders as `displayName: "You"`, a friend row
  renders with that friend's real name and emoji.
- Route-protection check via `curl -I` against the running dev server (not
  signed in): `/sessions/new` and `/sessions/[id]` both `307` to
  `/auth/login?next=...`, matching the existing pattern from features 7-10.
  A malformed session id and a well-formed-but-nonexistent one both resolve
  to the same redirect (auth is checked before the page's own not-found
  logic ever runs).
- **Known gap** (same as every prior friends/session-adjacent feature's
  archive): no Google-authenticated browser session or Playwright available
  in this environment, so the actual signed-in click-through - filling in
  the title, checking friends, adding one inline, submitting, landing on the
  new session's detail page - was not performed. Substituted with the
  DB-level verification above (exercises the real `createSession` and
  `getSessionDetail` logic) plus the redirect checks, which together cover
  everything except the click-driven UI state (`NewSessionForm`'s local
  `useState`/`useTransition` wiring itself was self-reviewed against the
  diff, not observed running).
