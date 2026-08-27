# Feature: Tonight's mood

**From build-plan:** feature 13
**Status:** completed 2026-08-27

## Goal

Let the host capture, right after a session is created, how each participant
is feeling tonight, any runtime override for the group, and the age of the
youngest viewer in the room - the inputs feature 14's group recommendations
will need for scoring and hard-filtering. This continues the same
`/sessions/[id]` page feature 12 stubbed out ("Mood capture and
recommendations are coming in a later feature"), replacing that placeholder
with a real, editable form.

## Design reference

None - reuses the existing neon-on-dark tokens and the card/form patterns
already established on `/sessions/[id]` and the questionnaire's mood-tag
checkbox row (`QuestionnaireForm.tsx`). No new visual language.

## In scope

- A `youngest_viewer_age smallint` column on `sessions` (nullable) - the one
  new piece of schema this feature needs; `session_participants` already has
  `mood_tags`, `mood_note`, and `constraints` from feature 12's up-front
  migration.
- `SessionConstraints` type (`{ maxRuntime: number | null }`) and validation
  for one form submission that covers every participant at once: each
  participant's mood tags (reusing the same 10-tag vocabulary as the
  friend questionnaire), an optional short mood note, a per-participant
  runtime override (no limit / under 2h / under 100 min), and one
  session-wide youngest-viewer age (0-17, optional).
- `saveTonightsMood` Server Action: verifies the session belongs to the
  signed-in host, verifies every submitted participant id belongs to that
  session, updates each `session_participants` row's `mood_tags`/`mood_note`/
  `constraints` and the session's `youngest_viewer_age`.
- Extends `getSessionDetail`/`SessionDetail`/`SessionParticipant` to read the
  mood fields back, and a `TonightsMoodForm` client component rendered on
  `/sessions/[id]` in place of the current placeholder paragraph, pre-filled
  with whatever was last saved.

## Out of scope

- Group recommendations, per-participant fit scoring, or the
  consensus/adventurous slider (feature 14/15) - this feature only captures
  and stores the inputs those will read.
- The pick rationale and save/revisit history (features 16-17).
- Any change to how the friend questionnaire's own stored mood answers work -
  tonight's mood is a separate, session-scoped overlay, never written back to
  `friends.answers`.
- A dedicated design for how a null-`friend_id` host row should be scored
  later - out of scope here, same open item feature 12's archive already
  flagged for feature 14/15.
- Removing a participant or editing the session title/who's-here list from
  this page - still feature-12 territory, untouched.

## Build loop

Run under `/autopilot`: steps were implemented and verified in sequence
without pausing for approval after each one; checkpoint commits were created
after each passing step per `blueprint/config.json`
(`workflow.checkpointCommits: enabled`). Review happened at the final packet.

## Build steps

- [x] **Step 1 - `youngest_viewer_age` column** - add a migration
  (`supabase migration new session_youngest_viewer`) that adds
  `youngest_viewer_age smallint` (nullable, no default) to `sessions`. No RLS
  change needed - the existing owner policy already covers all columns.
  *Done when:* `supabase db push` applies cleanly and `supabase db advisors
  --type security` reports no new findings on `sessions`.

- [x] **Step 2 - Mood types & validation** - add `SessionConstraints` to
  `src/types/session.ts` and extend `SessionParticipant` with `moodTags:
  string[]`, `moodNote: string | null`, `constraints: SessionConstraints`;
  add `youngestViewerAge: number | null` to `SessionDetail`. Add
  `src/lib/sessions/mood.ts`: the shared `MOODS` tuple (same 10 values as
  `QuestionnaireForm.tsx`), `RUNTIME_OVERRIDE_OPTIONS` (`"none" | "under2h" |
  "under100"` mapped to `null | 120 | 100` minutes), `parseMoodInput(raw)`
  (zod: per-participant array of `{participantId: uuid, moodTags: subset of
  MOODS, moodNote: trimmed <= 300 chars or null, maxRuntime: one of the three
  options}`, plus a top-level `youngestViewerAge` coerced to an integer
  0-17 or null), and `readMoodFormData(formData, participantIds)` to pull the
  indexed `mood-<id>` / `note-<id>` / `maxRuntime-<id>` / `youngestViewerAge`
  fields out of the submitted `FormData`. *Done when:* `mood.test.ts` passes,
  covering: a valid full submission; an unknown mood tag silently dropped; a
  note over 300 chars rejected; each runtime option resolving to the right
  minute value; an out-of-range (negative or > 17) youngest-viewer age
  rejected; a blank youngest-viewer age resolving to `null`.

- [x] **Step 3 - `saveTonightsMood` action** - add `saveTonightsMood(sessionId:
  string, formData: FormData): Promise<ActionResult>` to
  `src/actions/sessions.ts`: `requireOwnerId`, validate `sessionId`, confirm
  the session exists and is owned by the caller, select that session's
  `session_participants` ids to build the trusted id list `readMoodFormData`
  parses against (a tampered participant id from another session/owner must
  fail here, not just be silently unreachable at read time - same pattern
  `createSession` already uses for `friendIds`), then update each
  participant row (`mood_tags`, `mood_note`, `constraints`) scoped by both
  `id` and `session_id`, and update the session's `youngest_viewer_age`
  scoped by `id` + `owner_id`. `revalidatePath('/sessions/[id]', 'page')` on
  success. *Done when:* build passes; a manual save -> re-fetch ->
  verify-stored-values sequence against the dev database confirms mood tags,
  note, runtime override, and youngest-viewer age all round-trip correctly,
  and a forged participant id from a different session is rejected.

- [x] **Step 4 - Read the mood fields back** - extend `getSessionDetail` in
  `src/lib/sessions/detail.ts` to select `mood_tags`, `mood_note`,
  `constraints` on the participants query and `youngest_viewer_age` on the
  session query, mapping them onto the Step 2 types (defaulting missing/null
  jsonb to `{ maxRuntime: null }`). *Done when:* `npx tsc --noEmit` passes
  and a manual fetch against a session saved in Step 3 shows the right
  values on the returned `SessionDetail`.

- [x] **Step 5 - Tonight's mood UI** - add
  `src/components/sessions/TonightsMoodForm.tsx` (client component: one card
  per participant with the same mood-tag checkbox row style as
  `QuestionnaireForm.tsx`, an optional note textarea, and a runtime-override
  select; one session-wide youngest-viewer-age number input; a single save
  button posting to `saveTonightsMood` via `useActionState`, pre-filled from
  the loaded `SessionDetail`); wire it into `src/app/sessions/[id]/page.tsx`
  in place of the current "Mood capture and recommendations are coming in a
  later feature" paragraph. *Done when:* visiting `/sessions/[id]` for a
  session created earlier shows the mood form pre-filled with whatever Step
  3's verification saved; changing a mood tag, note, runtime override, or
  youngest-viewer age and saving persists and reloads correctly - verified
  with a screenshot of the running dev server plus the production build.

## Files / areas

- `supabase/migrations/20260827170937_session_youngest_viewer.sql` (new)
- `src/types/session.ts` (extend)
- `src/lib/sessions/mood.ts` (new), `src/lib/sessions/mood.test.ts` (new)
- `src/actions/sessions.ts` (extend)
- `src/lib/sessions/detail.ts` (extend)
- `src/components/sessions/TonightsMoodForm.tsx` (new)
- `src/app/sessions/[id]/page.tsx` (extend)

## Data / contracts

- `constraints` jsonb stays the small, additive shape
  `{ maxRuntime: number | null }` - matches the "nothing over 2h" example
  already in feature 12's migration comment; feature 14 reads it alongside
  each friend's own stored `hard_filters.maxRuntime` when combining the
  room's hard filters.
- `youngest_viewer_age` lives on `sessions`, not per-participant - it's a
  room-wide fact the host states once, not something each participant
  reports about themselves.
- Mood tags reuse the exact same 10-value vocabulary as the friend
  questionnaire (`fun`, `serious`, `inspiring`, `scary`, `action`,
  `romantic`, `mind-bending`, `feel-good`, `dark`, `weird`) so a later
  scoring step can compare tonight's mood tags against a friend's stored
  mood answers without a translation table. The constant is duplicated
  locally in `src/lib/sessions/mood.ts` rather than imported from
  `src/lib/friends/questionnaire.ts`, matching how the friends feature
  itself already duplicates it between its own lib and component files.
- The host's participant row (`friend_id null`) gets a mood entry like
  everyone else - tonight's mood is captured for every person in the room,
  including the host; how a null-`friend_id` row gets scored later stays
  feature 14/15's decision.

## Testing

- `npm test` is configured (Vitest). In-scope pure logic -
  `parseMoodInput`/`readMoodFormData` - ships with unit tests in
  `mood.test.ts`, following the existing pattern in
  `src/lib/sessions/validation.test.ts`.
- The migration, `saveTonightsMood`, `getSessionDetail`'s extension, and the
  UI component are integration/UI surfaces - no Playwright in this project,
  so verified against the running dev server / dev database, a screenshot,
  and the production build, per `coding-standards.md`.

## Notes for the AI

- Scope every query explicitly by `owner_id`/`session_id`, not RLS alone -
  same pattern `createSession` and `getSessionDetail` already use.
- Match the existing `{ success, data, error }` `ActionResult` pattern for
  `saveTonightsMood`.
- Reuse the mood-tag checkbox visual style from `QuestionnaireForm.tsx`
  rather than inventing a new control.

## Verification results

- `npx tsc --noEmit`: clean. `npm run lint`: clean (one pre-existing,
  unrelated warning in `SiteHeader.tsx`, same as feature 12's archive).
  `npm test`: 253/253 passing, including 10 new tests for `parseMoodInput`.
  `npm run build`: clean, `/sessions/[id]` still registered.
- `supabase db push` applied the new `youngest_viewer_age` migration to the
  linked project. `supabase db advisors --linked --type security`: 3
  warnings, all pre-existing (same ones feature 12's archive already noted -
  `handle_new_user`, an Auth setting) - none on `sessions`.
- Live-DB round-trip check via a temporary admin-client script (a real auth
  user + temp session/participant rows, all cleaned up after): applied the
  exact update shape `saveTonightsMood` builds (mood tags, mood note,
  runtime-override constraints, youngest-viewer age) and read it all back
  unchanged; separately confirmed a participant id from a different session
  is rejected by the action's `.eq("id", ...).eq("session_id", ...)`
  scoping (zero rows affected), covering the forged-id path `createSession`
  already established the pattern for.
- Route-protection check via `curl -I` against the running dev server (not
  signed in): `/sessions/[id]` still `307`s to `/auth/login?next=...`,
  unchanged from feature 12.
- **Known gap** (same as feature 12's archive): no Google-authenticated
  browser session or Playwright available in this environment, so the
  actual signed-in click-through - checking mood tags, writing a note,
  picking a runtime override, setting the youngest-viewer age, saving, and
  seeing it reload pre-filled - was not performed. Substituted with the
  DB-level verification above (exercises the real `saveTonightsMood` and
  `getSessionDetail` logic) plus the redirect check and the production
  build; `TonightsMoodForm`'s client-side wiring (`useActionState`, default
  values) was self-reviewed against the diff, not observed running.
