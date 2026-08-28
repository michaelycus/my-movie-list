# Current Feature

**Type:** Feature
**Build-plan item:** 18. Seen list
**Branch:** feature/seen-list

## Spec

Give the group recommendation flow a memory: once a session's pick is saved,
record that every seated participant (host included) has seen that film, and
stop already-seen films from resurfacing in that group's future
recommendations. This is the `seen_movies` table foreshadowed since the
feature-12 sessions migration and named explicitly in 14a/14b/17's history
notes as deferred until now.

### Scope

- `seen_movies` migration matching `project-overview.md`'s data model
  (`owner_id`, `friend_id` nullable, `movie_id`, `seen_on`), RLS scoped to
  `owner_id = auth.uid()`, with partial unique indexes so marking a film seen
  twice for the same person is a no-op instead of a duplicate row.
- Marking as seen is automatic, not a new manual UI: saving a session's pick
  (`chooseSessionFilm`, already shipped in feature 17) inserts one
  `seen_movies` row per seated participant (host + every friend in the room)
  for the chosen film.
- Group recommendations exclude any film already seen by the host or any
  currently seated participant in that session - a room-wide union, matching
  `combineHardFilters`' existing "every participant counts, not just scored
  ones" reasoning for hard filters.

### Out of scope

- Any manual "mark as seen" / "mark as unseen" UI (film detail page, friend
  page, or a dedicated seen-list page) - not asked for by the build-plan line,
  and auto-marking on a saved pick is the actual signal the app already has.
- Un-marking a film as seen, or editing/undoing a saved pick (feature 17
  already ships saves as one-way).
- Per-friend seen-list browsing/history view.
- Excluding seen films from solo/anonymous catalog search or browse - only
  group recommendations use `seen_movies`.

### Data / contracts

- New table `seen_movies`:
  `owner_id uuid FK profiles`, `friend_id uuid FK friends nullable`,
  `movie_id bigint FK movies`, `seen_on date default current_date`.
  Partial unique indexes: `(owner_id, movie_id) where friend_id is null`
  (host rows) and `(owner_id, friend_id, movie_id) where friend_id is not
  null` (friend rows) - same pattern as `session_participants`'s existing
  partial unique index. RLS: single `for all` policy,
  `owner_id = auth.uid()`, matching `friends`/`sessions`.
- `score_group` RPC gains `excluded_movie_ids bigint[] default '{}'`,
  filtering `not (m.id = any(excluded_movie_ids))` in its existing `filtered`
  CTE. `CREATE OR REPLACE FUNCTION`, additive named parameter - callers using
  named args (as `scoreGroup.ts` already does) are unaffected if omitted.
- `scoreGroup()` in `src/lib/sessions/scoreGroup.ts` gains an
  `excludedMovieIds?: number[]` param on `ScoreGroupParams`, passed through
  as `excluded_movie_ids` (default `[]`).
- New `collectSeenMovieIds(rows: { movie_id: number }[]): number[]` pure
  helper in `src/lib/sessions/recommendations.ts` - dedupes seen-movie rows
  into the id array `scoreGroup` needs.
- `getGroupRecommendations` fetches `seen_movies` for the room (`owner_id`
  plus every seated friend's id, including host rows where `friend_id is
  null`) and passes the collected ids through to `scoreGroup`.
- `chooseSessionFilm` in `src/actions/sessions.ts` fetches the session's
  participants, checks which ones already have a `seen_movies` row for this
  film, and inserts one row per still-missing participant after the pick
  itself saves - setting `seen_on` to the session's own `watched_on` rather
  than today's date, since a session logged after the fact should record
  when it happened, not when it was saved (same reasoning `getSessionList`
  already applies to its own sort). Live verification against the pushed
  migration showed PostgREST's `upsert().onConflict` can't target a partial
  unique index (no WHERE-predicate support in the conflict target it emits),
  so this is a plain select-then-insert-the-gap, not an upsert; the two
  partial unique indexes from step 1 stay as a defensive backstop - a
  unique-violation on insert is caught and logged like any other seen-list
  failure, never thrown.

### Build steps

1. [x] **`seen_movies` migration** - table, partial unique indexes, RLS
   policy, per the contract above.
   Done when: migration applies cleanly; a row insert with someone else's
   `owner_id` is rejected by RLS; a second insert of the same
   `(owner_id, movie_id)` host row conflicts on the partial unique index
   (checked at the application level in step 2, with the index as a
   backstop).

2. [x] **Auto-mark participants as seen on save** - extend
   `chooseSessionFilm` to load the session's participants and upsert a
   `seen_movies` row per participant for the chosen film. Seen-list insert
   failures are logged, not thrown - they must never turn a successful pick
   save into a failed one.
   Done when: saving a pick for a session with N seated participants (host +
   friends) creates N `seen_movies` rows for that film; re-running the same
   insert (e.g. a retried save) leaves the row count unchanged.

3. [x] **Exclude seen films from group recommendations** - `score_group`
   migration adding `excluded_movie_ids`; `scoreGroup.ts` param plumbing;
   `collectSeenMovieIds` helper plus its unit test; `getGroupRecommendations`
   wiring to fetch the room's seen ids and pass them through.
   Done when: a film already marked seen for the host or any seated friend no
   longer appears in that session's `/api/sessions/[id]/recommendations`
   result; a session with no seen films behaves exactly as before (empty
   exclusion list, unchanged ranking).

### Testing plan

`AGENTS.md` declares `npm test` (Vitest) as the test gate. In-scope logic:

- `collectSeenMovieIds` (new pure function, dedup logic worth asserting) -
  new tests in `recommendations.test.ts`.
- `scoreGroup.ts`'s `excludedMovieIds` -> `excluded_movie_ids` pass-through -
  extends the existing param-mapping tests in `scoreGroup.test.ts`, same
  pattern already used for `consensusWeight`/`matchCount`.

`chooseSessionFilm`'s extended upsert and `getGroupRecommendations`'s seen-id
fetch are thin Supabase-query wrappers with no branching logic worth
asserting in isolation, matching the existing convention for
`saveTonightsMood`/`getSessionDetail` - exercised via build evidence and a
manual/browser check (save a pick, confirm the film drops out of a fresh
session's recommendations for the same friends).

### UI/UX notes

No new UI. No visual changes - this feature is entirely a scoring/state
change behind the existing recommendations panel and save flow.

## Outcome

Built and verified against the linked Supabase project
(`sdqupxnxeplnnlfqxycg`), not just locally:

- Both migrations applied cleanly via `npx supabase db push --linked`.
- RLS confirmed live: an anon-key client got 0 rows on `select` and a
  blocked `insert` on `seen_movies`.
- `score_group`'s new `excluded_movie_ids` confirmed live to actually drop a
  targeted movie id from real results, while a legacy 6-arg call (no
  `excluded_movie_ids`) still resolved correctly - see the overload gotcha
  below.
- `markParticipantsAsSeen` run directly against the live tables: correct row
  count for host + friend participants, idempotent on a repeated call,
  `seen_on` stored as the session's `watched_on`. Test data cleaned up after.
- `npx tsc --noEmit`, `npm test` (309/309), `npm run lint` (clean, one
  pre-existing unrelated warning), `npm run build` all clean.

Checkpoint commits on `feature/seen-list`: `3f39a8e` (migration + RLS),
`1a9302c` (auto-mark on save), `4985ae7` (RPC exclusion + wiring).

### Notes for the AI

Two real gotchas caught by live-verifying against the pushed migration rather
than trusting the SQL/PostgREST docs by inspection alone - worth remembering
for any future feature touching partial unique indexes or RPC signatures:

- **PostgREST's `upsert().onConflict` can't target a partial unique index.**
  It emits `ON CONFLICT (columns)` with no `WHERE` predicate, so it can't
  match an index like `seen_movies_host_unique_idx` that only applies
  `where friend_id is null`. The fix is an application-level
  select-then-insert-the-gap instead of relying on the database to no-op a
  duplicate; the partial index stays as a backstop that would surface as a
  logged (not thrown) unique-violation if a race ever slipped past the
  application check.
- **`CREATE OR REPLACE FUNCTION` with a changed parameter list creates a
  second overloaded function, not a true replace.** Postgres identifies a
  function by name *and* argument types, so adding a trailing
  `excluded_movie_ids` parameter to `score_group` would have silently left
  the old 6-argument signature in place alongside the new 7-argument one -
  ambiguous for PostgREST's named-argument RPC calls. The migration
  explicitly `drop function if exists score_group(...)` with the exact old
  signature before creating the new one.
