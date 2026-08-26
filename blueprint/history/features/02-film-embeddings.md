# Feature: Film embeddings

**From build-plan:** feature 2
**Status:** completed 2026-08-26

## Goal

Give every released film a semantic fingerprint: one embedding document built
from its title, tagline, overview, keywords, top-billed cast, and director,
embedded with OpenAI `text-embedding-3-small`, and stored on `movies` next to
the exact text that produced it. This unlocks vector search for feature 6 and
taste-matching for feature 14; neither is built here.

## In scope

- A pure function that composes the embedding document text for one film.
- An OpenAI embeddings client (batch call, retry on 429/5xx).
- Supabase read/write helpers: find films still missing an embedding, pull
  their cast/director names, write the embedding back.
- A resumable `npm run embed` script that batches through the whole catalog.

## Out of scope

- Using the embeddings for search or ranking (features 6 and 14).
- Re-embedding a film whose text changed after its first embed (no such edit
  path exists yet - nothing in the app changes `title`/`overview`/etc. today).
- Any UI.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Embedding document builder** - `src/lib/ingest/embedding-document.ts`:
  `buildEmbeddingDocument(movie, credits)` composes a labeled text block
  (Title / Tagline / Overview / Keywords / Cast / Director), skipping any line
  whose source field is null, empty, or an empty array. `groupCreditsByMovie(castRows, crewRows)`
  turns flat `movie_cast`/`movie_crew` rows into a `Map<movieId, { cast: string[], directors: string[] }>`,
  cast ordered by `billing_order`. *Done when:* `embedding-document.test.ts`
  covers a film with full data, a film missing tagline/overview/keywords, a
  film with no director credit, and a film with no cast credits.

- [x] **Step 2 - OpenAI embeddings client** - `src/lib/ingest/openai.ts`:
  `fetchEmbeddings(texts, apiKey)` posts one batch to
  `https://api.openai.com/v1/embeddings` (`model: "text-embedding-3-small"`),
  retries on 429/5xx honoring `Retry-After` (mirror `tmdb.ts`'s
  `fetchWithRetry` rather than extracting a shared helper - keeps this step
  from touching feature 1c's already-tested code), and returns
  `number[][]` re-sorted by the response's `index` so output order always
  matches input order. *Done when:* `openai.test.ts` covers a successful
  batch, a 429-then-success retry, and a throw after exhausted retries
  (mirroring `tmdb.test.ts`'s three cases).

- [x] **Step 3 - DB read/write helpers** - `src/lib/ingest/embedding-upsert.ts`:
  `fetchMoviesNeedingEmbeddings(admin, limit)` selects
  `id, title, tagline, overview, keywords` from `movies` where
  `embedded_at is null`, ordered by `id`. `fetchCreditsForMovies(admin, movieIds)`
  selects matching `movie_cast` (ordered by `billing_order`) and `movie_crew`
  rows (filtered to `job = 'Director'`, defensive even though ingest already
  scopes crew to directors only) for those ids. `updateEmbeddings(admin, rows)`
  writes `embedding`, `embedding_text`, and `embedded_at` back per row via
  `.update().eq("id", ...)` (an `.upsert()` would fail `movies.title`'s
  NOT NULL constraint since these payloads never include `title`).
  *Done when:* `embedding-upsert.test.ts` covers all three functions against a
  mocked admin client (same mocking style as `upsert.test.ts`/`checkpoint.test.ts`),
  including empty-input and query-error cases.

- [x] **Step 4 - `npm run embed` script** - `scripts/embed.ts` wires steps 1-3
  into a loop: fetch a batch of up to 100 films missing embeddings, fetch
  their credits, build documents, embed them in one OpenAI call, write them
  back, log progress, repeat until a batch comes back empty. Supports an
  optional `--limit=` flag (same parsing as `ingest.ts`) to cap total films
  processed, for cheap manual testing. Throws early if `OPENAI_API_KEY` is
  unset (mirrors `ingest.ts`'s `TMDB_API_KEY` check). Add
  `"embed": "tsx --env-file=.env.local scripts/embed.ts"` to `package.json`.
  *Done when:* `npm run embed -- --limit=5` against the dev database embeds 5
  films - confirmed by querying Supabase and seeing `embedding_text` and
  `embedded_at` populated (and `embedding` non-null) for exactly those 5 rows,
  with no change to any other row.

## Files / areas

- `src/lib/ingest/embedding-document.ts` + `.test.ts` (new)
- `src/lib/ingest/openai.ts` + `.test.ts` (new)
- `src/lib/ingest/embedding-upsert.ts` + `.test.ts` (new)
- `scripts/embed.ts` (new)
- `package.json` (add `embed` script)
- Reused as-is, no changes: `src/lib/supabase/admin.ts`, `src/lib/ingest/concurrency.ts`

## Data / contracts

- No schema change - `movies.embedding` (`vector(1536)`), `embedding_text`,
  and `embedded_at` already exist from 1a's migration; this feature is the
  first to write them.
- `embedded_at is null` is both the completion marker and the resume cursor
  for this script. Unlike 1c (which needed the separate `ingest_checkpoint`
  table because nothing on `movies` marked a row "done"), this feature has a
  natural per-row marker, so it does not use `ingest_checkpoint`. A crash
  mid-run loses nothing: already-embedded rows have `embedded_at` set and are
  excluded from the next batch by the same query.
- `embedding` is written as a plain `number[]` (1536 entries) on the update
  payload - Supabase's JS client serializes it to the JSON array form
  `pgvector`'s input parser accepts; no manual stringification needed.

## Testing

- `test` is declared in `AGENTS.md`, so this is a gate: every logic-bearing
  step (1-3) ships a passing Vitest test in the same diff, run via `npm test`.
- Step 1: pure text-composition and grouping logic - fully unit tested, no
  mocks needed.
- Step 2: external HTTP call - unit test with `vi.stubGlobal("fetch", ...)`
  and `vi.useFakeTimers()`, same pattern as `tmdb.test.ts`.
- Step 3: Supabase calls - unit test with a mocked admin client, same pattern
  as `upsert.test.ts`/`checkpoint.test.ts`. No real database in tests.
- Step 4 is an orchestration script (like `ingest.ts`, which also has no
  test file) - verified by actually running it against the dev database with
  `--limit=5` and inspecting the resulting rows, not a unit test.

## Notes for the AI

- `OPENAI_API_KEY` is not yet in `.env.local` - tell the user to add it before
  running step 4's manual verification; tests never need a real key since
  `fetch` is mocked.
- Keep this feature's new files inside `src/lib/ingest/`, alongside
  `tmdb.ts`/`upsert.ts`/`checkpoint.ts` - it's still catalog-ingest
  infrastructure, and reuses `concurrency.ts`/`admin.ts` unchanged.
- All new code is script-only (`scripts/embed.ts` and its libs); nothing here
  runs on Vercel or touches the Next.js app, so no client/server-component
  distinction applies.
- After step 4 is approved, the full 5,000-film backfill (~$0.10 of OpenAI
  spend, per the project overview's cost note) is a manual run the user
  triggers themselves (`npm run embed`, no `--limit`) - not part of the
  reviewable diff.
