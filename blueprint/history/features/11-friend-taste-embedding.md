# Feature: Friend taste embedding

**From build-plan:** feature 11
**Status:** completed 2026-08-27

## Goal

Turn a friend's stored questionnaire answers into a searchable taste
signature: synthesise the answers into a natural-language paragraph, embed it
with OpenAI, blend in the poster-calibration picks (feature 10) as a nudge
toward/away from specific films, and store the result on `friends.taste_text`
/ `friends.taste_embedding`. Refresh it every time the answers or the
calibration picks change, so feature 14 (group recommendations) always scores
against current data.

## Design reference

None - no UI surface. This is a backend synthesis step wired into the
existing questionnaire and calibration server actions.

## In scope

- A pure paragraph-builder that turns `QuestionnaireAnswers` (+ genre id ->
  name lookup) into one embeddable natural-language paragraph.
- A pure blend function that nudges the paragraph's embedding toward liked
  calibration films and away from disliked ones.
- A DB read for the embeddings of the movies a friend calibrated on (reusing
  `movies.embedding`, already populated by feature 2 - no new embedding calls
  for calibration films).
- Reusing `fetchEmbeddings` (`src/lib/ingest/openai.ts`) for the one new
  OpenAI call per refresh (the taste paragraph); no second embeddings client.
- Wiring the refresh into both `saveQuestionnaire` and `saveCalibrationPick`
  in `src/actions/friends.ts`, so either kind of edit keeps the stored
  embedding current.
- Skipping the refresh (silently, not an error) when the friend has no
  questionnaire answers yet - a calibration-only friend has no paragraph to
  embed.
- Degrading gracefully (log, don't fail the parent save) if the embedding
  call errors - same philosophy as natural-language search's fallback in
  `src/lib/search/retrieve.ts`.

## Out of scope

- Any recommendation scoring, retrieval, or ranking against
  `taste_embedding` - that's feature 14.
- A "re-embed all friends" backfill script or admin action - not needed until
  there's a reason to bulk-refresh (e.g. a paragraph-format change), which
  isn't part of this feature.
- Any UI - no page shows `taste_text` or an embedding status to the host.
- Changing the questionnaire or calibration data contracts from features
  9/10.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared "has answered" check** - add
  `hasQuestionnaireAnswers(answers: Record<string, unknown> | null | undefined): boolean`
  to `src/lib/friends/questionnaire.ts` (moved from the private `hasAnswers`
  in `src/lib/friends/list.ts` - same check: `lovedFilm` is a non-empty
  string), and update `list.ts` to import and use it instead of its local
  copy. *Done when:* `npx tsc --noEmit` and `npm test` still pass with no
  behavior change (existing friend-list/detail tests, if any exercise this
  path, keep passing; otherwise verified by reading the equivalent logic is
  unchanged).

- [x] **Step 2 - Taste paragraph builder** - add `src/lib/friends/taste.ts`
  with `buildTasteParagraph(answers: QuestionnaireAnswers, genres: {id: number; name: string}[]): string`,
  turning the structured + free-text answers into one embeddable paragraph
  (loved film, perfect night, hard no + whether it's blocking, moods, recency
  preference, loved/avoided genres by name, runtime tolerance, subtitle
  tolerance, content tolerance). Skip any clause whose source field is
  empty/default-only, mirroring `buildEmbeddingDocument`'s skip-empty-lines
  pattern in `src/lib/ingest/embedding-document.ts`. *Done when:*
  `taste.test.ts` passes covering: a fully-answered profile produces a
  paragraph containing each answer's content and the correct genre names;
  empty `moods`/`lovedGenreIds`/`avoidGenreIds` don't produce empty or
  malformed clauses.

- [x] **Step 3 - Calibration blend** - add
  `blendTasteEmbedding(base: number[], picks: { embedding: number[]; liked: boolean }[]): number[]`
  to the same `taste.ts`. With no picks, returns `base` unchanged (already
  unit-length from OpenAI, no re-normalization needed). With picks, computes
  the average signed delta (liked = +1, disliked = -1 weight) across picks,
  blends `0.7 * base + 0.3 * delta` element-wise, then L2-normalizes the
  result so magnitude stays comparable across friends regardless of pick
  count. *Done when:* `taste.test.ts` (extended) passes covering: no picks
  returns `base` as-is; an all-liked pick set shifts the result toward the
  pick vector (higher cosine similarity to the pick than `base` alone); an
  all-disliked pick set shifts it away (lower cosine similarity); mixed picks
  net out; output is unit-length whenever picks are non-empty.

- [x] **Step 4 - Calibration embedding lookup** - add
  `getMovieEmbeddings(client: SupabaseClient, movieIds: number[]): Promise<Map<number, number[]>>`
  to `taste.ts`, selecting `id, embedding` from `movies` where
  `id = any(movieIds)` and `embedding is not null`. Returns an empty map for
  an empty `movieIds` array without querying. *Done when:* the function
  compiles and, run against the dev database with a couple of real movie ids
  from feature 2's embedded catalog, returns a map keyed by those ids with
  1536-length vectors.
  **Found in verification:** PostgREST returns the `vector` column as its text
  form (`"[-0.07,0.04,...]"`), not a parsed array - live-DB check against the
  dev database caught this before it shipped. Added
  `parseEmbeddingVector` (exported, unit-tested) to `taste.ts` and used it
  here; re-verified against the dev database afterward, now returns real
  1536-length numeric vectors.

- [x] **Step 5 - Orchestration + wiring into the actions** - add
  `computeTasteEmbedding(client, apiKey, answers, calibrationPicks, genres): Promise<{ tasteText: string; tasteEmbedding: number[] }>`
  to `taste.ts`, composing steps 2-4: build the paragraph, embed it via
  `fetchEmbeddings`, look up embeddings for the picked movie ids, filter out
  any pick whose movie has no embedding, blend. In
  `src/actions/friends.ts`, add a private `refreshTasteEmbedding(supabase,
  friendId, ownerId, answers)` helper that: returns early (no-op) when
  `!hasQuestionnaireAnswers(answers)`; otherwise fetches genres via
  `getGenres()`, calls `computeTasteEmbedding` with
  `process.env.OPENAI_API_KEY!`, and updates the friend's `taste_text` /
  `taste_embedding` columns (scoped by `id` + `owner_id`, same pattern as the
  rest of the file); wraps the whole body in try/catch and only
  `console.error`s on failure so a refresh failure never fails the
  questionnaire/calibration save itself. Call it (awaited) at the end of
  `saveQuestionnaire`, passing the merged `{ ...parsed.data, calibrationPicks }`
  object, and at the end of `saveCalibrationPick`, passing the merged
  `{ ...existingAnswers, calibrationPicks: updatedPicks }` object - both
  already computed in those functions today. *Done when:* build passes; a
  manual save-questionnaire-then-check-the-row sequence against the dev
  database shows `taste_text` and `taste_embedding` populated after saving
  the questionnaire, and `taste_embedding` changes after a subsequent
  calibration pick is saved (verified via a temporary admin-client script,
  same approach feature 10's archive used, cleaned up after).

## Files / areas

- `src/lib/friends/questionnaire.ts` (add `hasQuestionnaireAnswers`)
- `src/lib/friends/list.ts` (use the shared check instead of its own copy)
- `src/lib/friends/taste.ts` (new)
- `src/lib/friends/taste.test.ts` (new)
- `src/actions/friends.ts` (add `refreshTasteEmbedding`, call it from
  `saveQuestionnaire` and `saveCalibrationPick`)

## Data / contracts

- No schema change: `friends.taste_text` and `friends.taste_embedding` already
  exist (`supabase/migrations/20260827140000_friends.sql`), added up front for
  exactly this feature.
- `computeTasteEmbedding`'s output feeds directly into those two columns -
  keep the return shape (`{ tasteText, tasteEmbedding }`) stable since
  feature 14 will read `friends.taste_embedding` directly via SQL, not
  through this function.
- Blend weights (`0.7` base / `0.3` calibration delta) are a reasonable
  starting default with no product-specified value in `project-overview.md`;
  note them as named constants in `taste.ts` so they're easy to retune once
  feature 14/15 shows how much calibration should move the ranking.

## Testing

- `npm test` is configured (Vitest). In-scope pure logic -
  `buildTasteParagraph` and `blendTasteEmbedding` - ships with unit tests in
  `taste.test.ts`, following the existing pattern in
  `src/lib/friends/questionnaire.test.ts` and `calibration.test.ts`.
- `getMovieEmbeddings`, `computeTasteEmbedding`, and the `refreshTasteEmbedding`
  wiring are integration surfaces (DB reads/writes, an OpenAI call) - no
  Playwright in this project, so verified against the running dev server /
  dev database plus the production build, per `coding-standards.md`.

## Notes for the AI

- Reuse `fetchEmbeddings` from `src/lib/ingest/openai.ts` for the paragraph
  embedding call - do not add a second OpenAI client.
- `movies.embedding` is already populated for every embedded film (feature 2);
  `getMovieEmbeddings` is a plain read, not a new embedding call.
- Follow the existing `requireOwnerId` + explicit `.eq("owner_id", ownerId)`
  pattern in `src/actions/friends.ts` for the update inside
  `refreshTasteEmbedding`.
- `saveQuestionnaire` and `saveCalibrationPick` already build the exact merged
  `answers` object `refreshTasteEmbedding` needs (to avoid a second
  read-modify-write) - pass that, not a fresh DB read.
- A refresh failure (OpenAI outage, bad key) must never turn a successful
  questionnaire/calibration save into a failed one - catch and log inside
  `refreshTasteEmbedding`, don't let it throw into the calling action.

## Verification results

- `npx tsc --noEmit`: clean. `npm run lint`: clean (one pre-existing,
  unrelated warning in `SiteHeader.tsx`). `npm test`: 236/236 passing,
  including 10 new tests for `buildTasteParagraph`, `blendTasteEmbedding`, and
  `parseEmbeddingVector`. `npm run build`: clean, all existing routes
  registered, no new routes (this feature has no UI surface).
- **Bug caught and fixed during Step 4's live-DB verification:** PostgREST
  returns the `movies.embedding` pgvector column as its text form
  (`"[-0.07,0.04,...]"`), not a parsed JSON array. The first version of
  `getMovieEmbeddings` used it as `number[]` directly, which would have
  silently blended garbage ("vectors" whose length was the string's character
  count, not 1536) into every friend's taste embedding the first time they
  saved a calibration pick. Fixed by adding `parseEmbeddingVector` (exported,
  unit-tested for the string form, the already-array form, and invalid
  input); re-verified against the dev database afterward.
- Live-DB check via a temporary admin-client script (temp friend row, cleaned
  up after): `computeTasteEmbedding` against a real profile ->
  `taste_text`/`taste_embedding` populated with a real 1536-dim vector after
  a simulated questionnaire save; a second `computeTasteEmbedding` call with
  one calibration pick added produces a measurably different embedding,
  confirming the blend actually shifts the stored vector.
- **Known gap:** the actual signed-in browser flow (filling in the
  questionnaire form, tapping a calibration poster, and confirming the DB
  updates from a real request) was not exercised - no Google-authenticated
  session or Playwright available in this environment, same gap noted in
  features 7-10's archives. Substituted with the DB-level verification above,
  which exercises the real `computeTasteEmbedding` logic
  `refreshTasteEmbedding` calls, plus reading `src/actions/friends.ts`'s diff
  to confirm both call sites pass the already-merged `answers` object rather
  than re-reading the row.
- **Not touched, flagged for a separate look:** `src/lib/search/query-cache.ts`'s
  `getCachedQueryEmbedding` has the same latent type/runtime mismatch
  (`data.embedding` typed `number[]`, actually a pgvector text string over
  PostgREST) but happens not to break today - the cached value is only ever
  passed back into another pgvector RPC parameter, which accepts the text
  form. Out of scope for this feature (feature 6, not feature 11); worth a
  follow-up `/audit` or `/fix` since any future direct numeric use of that
  cached value would hit the same bug this feature's version of it did.
