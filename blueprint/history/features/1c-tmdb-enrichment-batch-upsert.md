# Feature: TMDB enrichment & batch upsert

**From build-plan:** feature 1c (third sub-feature of 1. Film catalog ingest)
**Status:** completed 2026-08-26

## Goal

Wire 1b's `normalizeCatalog()` output through TMDB enrichment (poster,
backdrop, age certification) and land it in the real database, in resumable
checkpointed batches, as a runnable `npm run ingest` script. This is the step
that makes "5000 released films in the database" (build-plan item 1) actually
true.

## In scope

- TMDB API calls per film: `GET /movie/{id}` for `poster_path`/`backdrop_path`,
  `GET /movie/{id}/release_dates` for certification, mapped to `min_age`
  (BR certification, falling back to US, per the table in `project-plan.md` §4.1).
- A small concurrency limiter for TMDB calls (no new dependency - hand-rolled),
  with retry/backoff on 429 and 5xx.
- Reading/writing `ingest_checkpoint` so a crash resumes instead of re-billing
  already-processed films.
- Batch upsert into `movies`, `genres`, `movie_cast`, `movie_crew` via the
  service-role admin client from 1a.
- `npm run ingest` (optionally `-- --limit=N` for a bounded run) as the actual
  entry point.

## Out of scope

- Embeddings (`movies.embedding`, `embedding_text`, `embedded_at`) - feature 2.
- `search_doc` - belongs to feature 5 (Keyword and filter search), which needs
  to decide what goes into the tsvector and how it's weighted; populating it
  here would be guessing at that design early.
- A full unbounded run of all ~4795 films. This feature proves the pipeline
  correct at small scale (see Testing); running it to completion for the whole
  catalog is a follow-up action after the feature is reviewed, not part of the
  automated done-when - it takes real wall-clock time and a real TMDB budget.
- Any UI - this is a local script only, per `project-plan.md` §8.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - TMDB client & concurrency limiter** - `src/lib/ingest/concurrency.ts` exporting `runWithConcurrency(tasks, limit)`; `src/lib/ingest/tmdb.ts` exporting `mapCertificationToMinAge(certification, country)` (the exact BR/US table from `project-plan.md` §4.1), `extractMinAge(releaseDatesResponse)` (BR first, US fallback, `null` if neither), and `fetchFilmEnrichment(tmdbId, apiKey)` (both TMDB calls, retry on 429/5xx respecting `Retry-After` when present). *Done when:* `npm test` passes with `fetch` mocked (no real network in the suite - see Testing), and a throwaway script call to `fetchFilmEnrichment(19995, TMDB_API_KEY)` against the real TMDB API returns real poster/backdrop/min_age for Avatar - this also settles whether `TMDB_API_KEY` needs to be a query param or a Bearer token, empirically.
- [x] **Step 2 - Checkpoint helpers** - `src/lib/ingest/checkpoint.ts` exporting `getCheckpoint(admin, source)` and `setCheckpoint(admin, source, lastId)` against `ingest_checkpoint`. *Done when:* `npm test` passes with a mocked Supabase client asserting the right query shape, and a throwaway script run against the real project (`setCheckpoint("tmdb_ingest_test", 123)` then `getCheckpoint` returns `123`, then the test row is deleted) confirms it against the live table.
- [x] **Step 3 - Batch upsert** - `src/lib/ingest/upsert.ts` exporting `toMovieRow(film)` (camelCase `EnrichedFilm` -> the snake_case `movies` row), `upsertGenres`, `upsertFilms` (`.upsert(..., { onConflict: "id" })`), and `upsertCastAndCrew` (delete-by-`movie_id`-in-batch, then insert - idempotent on resume, since the checkpoint only advances after a batch fully succeeds). *Done when:* `npm test` passes with a mocked client asserting payload shape and the delete-then-insert call order, and a throwaway script run against the real project using a few high, non-colliding fake movie ids (`900000001`+) proves running the same batch twice does not duplicate `movie_cast`/`movie_crew` rows; test rows cleaned up after.
- [x] **Step 4 - Orchestration script** - `scripts/ingest.ts` (wired as `npm run ingest`, `tsx scripts/ingest.ts`): read the checkpoint, run `normalizeCatalog()` (1b), **sort the returned films by `id` ascending** (checkpoint resume depends on a deterministic order - the CSV's row order isn't sorted by id), upsert genres once, then process films with `id > checkpoint` in batches of 100 - enrich each via the concurrency-limited TMDB client, upsert films + cast/crew, advance the checkpoint to the batch's highest `id` after each batch succeeds. A film whose TMDB calls fail after retries is upserted anyway with `null` enrichment fields (logged), rather than blocking the run. Support `--limit=N` to bound how many films are processed, for reviewable runs. *Done when:* `npm run ingest -- --limit=10` against the real CSVs/TMDB/Supabase lands exactly 10 real films (the 10 lowest ids) with `poster_path`/`backdrop_path`/`min_age` populated (where TMDB had the data) plus their cast/crew/genres; running it again with the same limit correctly advances to the *next* 10 films rather than repeating the first batch (proving the checkpoint drives resume); and deliberately resetting the checkpoint backward and reprocessing the same batch leaves `movies`/`movie_cast`/`movie_crew` row counts unchanged - no duplication even on a simulated crash-and-retry.

## Files / areas

- `src/lib/ingest/concurrency.ts` - new
- `src/lib/ingest/tmdb.ts` - new
- `src/lib/ingest/checkpoint.ts` - new
- `src/lib/ingest/upsert.ts` - new
- `scripts/ingest.ts` - new
- `package.json` - new script (`ingest`)

## Data / contracts

```ts
export interface EnrichedFilm extends NormalizedFilm {
  posterPath: string | null;
  backdropPath: string | null;
  minAge: number | null;
}
```

Certification -> `min_age` mapping (from `project-plan.md` §4.1, locked here
because it's the only place it's implemented):

| BR | min_age | | US | min_age |
|---|---|---|---|---|
| Livre | 0 | | G | 0 |
| 10 | 10 | | PG | 8 |
| 12 | 12 | | PG-13 | 13 |
| 14 | 14 | | R | 17 |
| 16 | 16 | | NC-17 | 18 |
| 18 | 18 | | | |

Unmapped or missing certification -> `min_age: null` (matches the `movies`
schema from 1a, which already allows `NULL = unknown`).

`ingest_checkpoint.source` for this pipeline: `"tmdb_ingest"`.

## Testing

`npm test` is a real gate here too, but this feature also touches two live
external services (TMDB, Supabase) - per `coding-standards.md`'s scope rule,
those don't belong in the committed unit suite:

- **Unit-tested (mocked, in `npm test`):** `mapCertificationToMinAge`,
  `extractMinAge` (table-driven, including "neither country present"),
  `runWithConcurrency` (asserts the concurrency cap is actually respected using
  instrumented fake tasks), `fetchFilmEnrichment`'s retry logic (mocked
  `fetch`: success, one 429 then success, persistent failure), `toMovieRow`,
  and the upsert functions' call shape (mocked Supabase client).
- **Proven against the real services (ad-hoc script evidence during
  `/implement`, not committed as tests):** the real TMDB response shape and
  auth mechanism (Step 1), the real `ingest_checkpoint` round-trip (Step 2),
  real upsert idempotency (Step 3), and the real bounded 10-film run (Step 4).
  This mirrors how 1a's admin client was verified against the live Supabase
  project.

## Notes for the AI

- TMDB auth: `TMDB_API_KEY` is in `.env.local`. Try it as a `?api_key=` query
  param first (the classic v3 pattern the variable name suggests); if the real
  call in Step 1 says otherwise, adjust and note it here.
- No new HTTP or concurrency-limiter dependency - `fetch` is a global in this
  Node version, and the concurrency cap is small enough to hand-roll (a queue
  of at most N in-flight promises).
- `movie_cast`/`movie_crew` have no unique constraint (see 1a's migration), so
  upserts there use delete-by-`movie_id`-in-batch then insert, not `.upsert()`.
  This is safe because the checkpoint only advances after a batch's upsert
  fully succeeds - a crash mid-batch leaves that batch un-checkpointed, and the
  next run's delete+insert on the same ids cleans up any partial state.
- Genres are upserted once, before the per-film batch loop - they're shared
  and already deduplicated by 1b's `normalizeCatalog()`.
- Films must be sorted by `id` ascending before the `id > checkpoint` resume
  filter is applied - `normalizeCatalog()` preserves CSV row order, which is
  not sorted by id, so skipping the sort would make resume skip or repeat
  films unpredictably.
- A film that fails TMDB enrichment after retries still gets upserted, with
  `null` poster/backdrop/min_age - this keeps one bad film from blocking the
  whole run, matching the plan's "degrade gracefully" stance elsewhere. It also
  means that film won't be retried automatically later; that's an accepted
  tradeoff for now, not a bug.
- Keep `admin.ts` (1a) as the only Supabase client used here - this is
  service-role, script-only work.
