# Feature: Poster calibration step

**From build-plan:** feature 10
**Status:** completed 2026-08-27

## Goal

Let a host enrich a friend's taste profile by tapping "loved it" / "not for me"
on eight popular films, no typing required. This gives feature 11 (friend taste
embedding) real signal for friends who won't fill in free text, and gives
already-answered friends a fast way to add more signal.

## Design reference

None. Reuses the existing neon-on-dark tokens and the poster-tile look already
established by `PosterCard` on the catalog grid - no new visual language, so no
reference image needed.

## In scope

- A "Quick taste check" section on the existing `/friends/[id]/questionnaire`
  page (project-overview.md already routes features 9 and 10 to this one page).
- A pool of 8 popular films (top by `popularity`, restricted to films that have
  a poster), computed fresh each page load - not pinned to a fixed list.
- Two tap targets per poster: "Loved it" / "Not for me". Tapping saves
  immediately (no separate "Save" button, no typing) and shows the selected
  state right away.
- Picks are per-friend, persisted on the `friends` row, and visible again when
  the page reloads.
- Re-tapping a poster changes that pick (loved -> not for me or back); it does
  not add a duplicate entry.

## Out of scope

- Blending calibration picks into `taste_text`/`taste_embedding` - that's
  feature 11, which reads the picks this feature stores.
- Swipe gestures, animation, or a card-deck interaction - a static grid with
  two buttons per poster is enough for v1.
- Re-showing a fixed set of 8 films forever - the pool is recomputed by
  popularity each visit. A friend's earlier picks stay stored even if that film
  later drops out of today's top 8 (feature 11 still reads all stored picks).
- Any change to the required/optional questionnaire fields from feature 9.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Calibration data contract & lib** - add `CalibrationPick`
  (`{ movieId: number; liked: boolean }`) to `src/types/calibration.ts`, and
  `src/lib/friends/calibration.ts` with `CALIBRATION_POOL_SIZE = 8`,
  `parseCalibrationPicks(raw: unknown): CalibrationPick[]` (zod-validated,
  drops malformed entries instead of rejecting the whole array), and
  `upsertCalibrationPick(picks, pick): CalibrationPick[]` (replaces an existing
  entry for the same `movieId`, otherwise appends). *Done when:*
  `calibration.test.ts` passes covering: valid array, missing/undefined input,
  malformed entries mixed with valid ones, and upsert replacing vs. appending.
- [x] **Step 2 - Calibration movie pool query** - add `getCalibrationMovies()`
  to `src/lib/movies/browse.ts`, selecting up to `CALIBRATION_POOL_SIZE` films
  ordered by `popularity` descending where `poster_path is not null`, returning
  `BrowseMovie[]` (reuse `toBrowseMovie`). *Done when:* the function compiles
  and returns at most 8 films in popularity order; verified by running it
  against the dev database.
- [x] **Step 3 - Persist and expose picks** - extend `FriendDetail`
  (`src/types/friend.ts`) with `calibrationPicks: CalibrationPick[]`; update
  `getFriend` (`src/lib/friends/list.ts`) to read `answers.calibrationPicks` via
  `parseCalibrationPicks`; add `saveCalibrationPick(friendId, movieId, liked)`
  to `src/actions/friends.ts` that reads the friend's current `answers`,
  upserts the one pick with `upsertCalibrationPick`, and writes
  `{ ...existingAnswers, calibrationPicks: updatedPicks }` back - scoped by
  `id` + `owner_id`, same as the other actions in that file. Update
  `saveQuestionnaire` in the same file to read-and-preserve
  `answers.calibrationPicks` when it overwrites `answers`, so saving the
  questionnaire never wipes stored calibration picks (and vice versa). *Done
  when:* build passes; a manual save-questionnaire-then-save-a-pick-then-save-
  questionnaire-again sequence keeps both sets of data intact (checked via the
  running app in Step 4's verification, since both actions touch the same row).
- [x] **Step 4 - Calibration UI** - `PosterCalibration.tsx` client component
  rendering the 8 pool films as poster tiles (reusing `PosterCard`'s image
  sizing/URL convention) with "Loved it" / "Not for me" buttons per tile,
  calling `saveCalibrationPick` directly on tap (via `useTransition`, no form),
  showing a pending and then a selected state per tile from the friend's
  existing `calibrationPicks`. Wire it into
  `src/app/friends/[id]/questionnaire/page.tsx` alongside the existing
  `QuestionnaireForm`, fetching `getCalibrationMovies()` in the page's existing
  `Promise.all`. *Done when:* visiting `/friends/[id]/questionnaire` shows a
  "Quick taste check" section with 8 posters; tapping a button highlights it
  immediately without a full page reload; reloading the page still shows the
  same picks highlighted; verified with a screenshot of the running dev server.

## Files / areas

- `src/types/calibration.ts` (new)
- `src/lib/friends/calibration.ts` (new), `src/lib/friends/calibration.test.ts` (new)
- `src/lib/movies/browse.ts` (add `getCalibrationMovies`)
- `src/types/friend.ts` (extend `FriendDetail`)
- `src/lib/friends/list.ts` (extend `getFriend`)
- `src/actions/friends.ts` (add `saveCalibrationPick`, adjust `saveQuestionnaire`)
- `src/components/friends/PosterCalibration.tsx` (new)
- `src/app/friends/[id]/questionnaire/page.tsx` (wire in the new section)

## Data / contracts

- `CalibrationPick = { movieId: number; liked: boolean }` - stored as a JSON
  array under the existing `friends.answers` jsonb column, key
  `calibrationPicks`, alongside the flat `QuestionnaireAnswers` fields feature 9
  already stores there. No migration: `answers` is schema-less jsonb and this
  repo's `friends` migration was deliberately written so features 9-11 need no
  schema change (`supabase/migrations/20260827140000_friends.sql`).
- **Load-bearing for feature 11:** `getFriend` returns
  `calibrationPicks: CalibrationPick[]` on `FriendDetail`; feature 11 reads this
  list to blend calibration signal into the taste embedding. Keep the shape
  stable.
- Because `answers` is one jsonb column serving both this feature and feature 9,
  both `saveQuestionnaire` and `saveCalibrationPick` must read-modify-write
  (fetch current `answers`, merge in only the key they own, write the whole
  object back) rather than blind-overwrite. This is a small, accepted
  read-then-write window (single owner acting on their own data, no
  multi-device concurrent editing in scope) rather than a jsonb merge at the
  database layer.

## Testing

- `npm test` is configured (Vitest), so the in-scope logic here -
  `parseCalibrationPicks` and `upsertCalibrationPick` - ships with unit tests in
  `calibration.test.ts`, following the existing pattern in
  `src/lib/friends/questionnaire.test.ts`.
- `getCalibrationMovies`, the two server actions, and `PosterCalibration` are
  integration/UI surfaces (DB query, Supabase mutation, client component) - no
  Playwright installed in this project, so verify with the running dev server,
  a screenshot of the calibration section, and the production build, per
  `coding-standards.md`.

## Notes for the AI

- `saveCalibrationPick` and `saveQuestionnaire` both live in
  `src/actions/friends.ts` and both touch `friends.answers` - re-read the
  current file before editing either, since Step 3 changes both.
- Follow the existing `requireOwnerId` + explicit `.eq("owner_id", ownerId)`
  pattern in `src/actions/friends.ts`; don't rely on RLS alone.
- `PosterCalibration` is a Client Component (`"use client"`) for the tap
  interaction; the questionnaire page itself stays a Server Component that
  fetches the pool and passes data down, matching how it already hands
  `answers`/`genres` to `QuestionnaireForm`.
- Match `PosterCard`'s poster URL convention
  (`https://image.tmdb.org/t/p/w342{poster_path}`, `unoptimized`) rather than
  inventing a new one.

## Verification results

- `npx tsc --noEmit`: clean. `npm run lint`: clean (one pre-existing,
  unrelated warning in `SiteHeader.tsx`). `npm test`: 226/226 passing,
  including 6 new tests for `parseCalibrationPicks`/`upsertCalibrationPick`.
  `npm run build`: clean, `/friends/[id]/questionnaire` registered.
- Live-DB check via a temporary admin-client script (cleaned up after): a
  calibration save -> questionnaire re-save -> second calibration save
  sequence left both `lovedFilm` and both picks intact - confirms the
  read-modify-write merge in `saveCalibrationPick`/`saveQuestionnaire` avoids
  the clobber risk this spec flagged in Data / contracts.
- Live-DB check of `getCalibrationMovies`'s query shape: returned exactly 8
  films, ordered by `popularity` descending, all with a poster.
- `curl` to the questionnaire route while signed out: `307` to
  `/auth/login?next=...`, matching the route-protection precedent from
  features 7-9.
- **Known gap** (same as features 7-9's archives): the actual signed-in
  click-through - tapping a poster in a real browser and watching the state
  update - was not performed. No Google-authenticated session or Playwright
  available in this environment; substituted with the DB-level verification
  above, which exercises the real merge logic the actions run.
