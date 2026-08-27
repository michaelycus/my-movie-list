# Feature: Hybrid retrieval & merge

**From build-plan:** feature 6c (sub-feature of 6. Natural-language search)
**Status:** complete

## Goal

Turn a parsed query (6b's `{ filters, semanticQuery }`) into a ranked result
list: run Postgres full-text (catches proper nouns like "Tom Hanks") and
pgvector cosine retrieval (catches "something bittersweet about growing up")
in parallel, merge with Reciprocal Rank Fusion, apply a mild `weighted_rating`
boost, and tag each result with why it matched. This is the last piece of
*logic* feature 6 needs - 6d just wires it to a route and a UI.

## In scope

- `getOrEmbedQuery(client, apiKey, text)` - checks `query_cache` (6a) first,
  embeds via OpenAI (reusing `fetchEmbeddings` from `src/lib/ingest/openai.ts`
  rather than a third implementation) and caches on a miss.
- `lexicalSearch(client, filters, semanticQuery, limit)` - full-text retrieval
  over `search_doc`, reusing `applyFilters` from `browse.ts` (now exported)
  so the same filter semantics apply here as on the browse page.
- `vectorSearch(client, embedding, filters, limit)` - calls 6a's
  `matchMovies`, then filters the resolved rows in memory (see Notes).
- `mergeSearchResults(lexical, vector)` - Reciprocal Rank Fusion (`k=60`) over
  the two rank-ordered lists, a mild `weighted_rating` boost on the fused
  score, and a `matchedVia: "keyword" | "theme" | "keyword+theme"` tag per
  result.
- `searchMovies(client, apiKey, parsed, limit)` - orchestrates the above:
  embed/cache -> two retrievals in parallel -> merge -> slice to `limit`.

## Out of scope

- The `/api/search` Route Handler and any UI (6d).
- Rate limiting / anonymous request caps (feature 20).
- A written, per-result LLM explanation - `matchedVia` is a cheap, deterministic
  tag (which retrieval channel(s) surfaced the result), not an LLM call per
  result. Consistent with the project's cost-containment constraint.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - pure merge & filter logic** - `mergeSearchResults(lexical:
  MovieRow[], vector: MatchedMovieRow[]): RankedMovie[]` (RRF with `k=60`,
  summing `1/(k+rank)` per list a result appears in; final score
  `rrf * (1 + 0.05 * (weightedRating ?? 0) / 10)`; `matchedVia` derived from
  which list(s) contained the id; sorted descending) and
  `filterMatchedRows(rows: MatchedMovieRow[], filters): MatchedMovieRow[]`
  (same genre/decade/runtime/age semantics as `applyFilters`, applied
  in-memory). No I/O - pure functions over plain arrays. *Done when:* vitest
  covers RRF with lexical-only, vector-only, and both-list overlap; the
  weighted_rating boost changing tie-break order; and each filter type on
  `filterMatchedRows` (genre overlap, decade range, runtime band, max age,
  and no filters passthrough).
- [x] **Step 2 - retrieval wiring** - `getOrEmbedQuery`, `lexicalSearch`, and
  `vectorSearch` in `src/lib/search/retrieve.ts`, each a thin wrapper: cache
  check/write (6a's `query-cache.ts`), `applyFilters` + `textSearch` on
  `movies` (exported from `browse.ts`), and 6a's `matchMovies` + Step 1's
  `filterMatchedRows`. *Done when:* vitest with a mocked Supabase client
  covers a cache hit (skips `fetchEmbeddings`), a cache miss (embeds then
  caches), `lexicalSearch` applying filters + text search, and
  `vectorSearch` filtering the RPC's rows.
- [x] **Step 3 - `searchMovies` orchestrator** - ties Steps 1-2 together:
  embed/cache the query, run `lexicalSearch` and `vectorSearch` in parallel
  via `Promise.all`, merge, slice to `limit` (default `PAGE_SIZE` from
  `browse.ts`). If embedding fails (OpenAI outage, cache-miss `fetchEmbeddings`
  throws), catch it and degrade to a lexical-only result set instead of
  failing the whole search - vector retrieval is the one piece with an
  external dependency separate from Postgres, and losing it shouldn't take
  keyword search down too. A `lexicalSearch`/`vectorSearch` failure that
  *is* a Postgres/RPC error still propagates - if the database itself is
  down nothing works anyway, and 6d's route handler is where that's surfaced
  to the user. *Done when:* a vitest test with a comprehensive mocked client
  (covering the `query_cache` cache-miss path, `movies` text search, and the
  `match_movies` RPC together) asserts the final list is correctly merged
  and ranked, that both retrievals were requested in parallel (not
  sequentially awaited), and that a `fetchEmbeddings` failure still returns
  a lexical-only result instead of rejecting.

## Files / areas

- `src/lib/search/retrieve.ts` (new) + `retrieve.test.ts`
- `src/lib/movies/browse.ts` - export `applyFilters` (currently private) so
  `retrieve.ts` reuses it instead of reimplementing filter semantics

## Data / contracts

- `RankedMovie` (**load-bearing for 6d**):
  ```ts
  interface RankedMovie extends MovieRow {
    matchedVia: "keyword" | "theme" | "keyword+theme";
    score: number;
  }
  ```
- `searchMovies(client, apiKey, parsed: ParsedSearchQuery, limit?):
  Promise<RankedMovie[]>` is the one function 6d's route handler calls -
  everything upstream of it (parse, embed, retrieve, merge) is already built
  by 6a/6b/this step.

## Testing

- Test runner is configured (`npm test`) - all three steps are logic (pure
  merge/filter math, and server-side retrieval functions), so each ships
  unit tests per its done-when, mocking the Supabase client and
  `fetchEmbeddings` the way `query-cache.test.ts`/`match.test.ts`/
  `openai.test.ts` already do.
- No manual/UI path yet - `searchMovies` isn't called from any route until 6d.

## Notes for the AI

- **Embedding failures degrade to lexical-only, never a thrown error out of
  `searchMovies`.** Same resilience principle 6b already applies to the LLM
  parse call - an external AI dependency going down should narrow the
  feature (keyword-only results), not break it.
- **Why vector filtering happens in memory, not via chained PostgREST
  filters:** 6a's `matchMovies` already awaits and returns a resolved array
  (not a lazy query builder), so `applyFilters`'s `FilterableQuery` interface
  can't chain onto it. `match_movies` already caps results at `match_count`
  (default 200), so filtering that bounded set in JS is simple, fast, and
  far more testable than restructuring `matchMovies` into a lazy builder for
  this one caller.
- Reuse, don't reimplement: `fetchEmbeddings` (`ingest/openai.ts`),
  `applyFilters`/`PAGE_SIZE`/`MovieRow` (`browse.ts`), `matchMovies`
  (`search/match.ts`), `hashQuery`/`getCachedQueryEmbedding`/
  `cacheQueryEmbedding` (`search/query-cache.ts`).
- `lexicalSearch` orders by `popularity` descending (same column `browse.ts`
  already sorts by) to get a rank order for RRF - Postgres full-text rank
  scoring (`ts_rank`) isn't exposed through PostgREST without a dedicated
  RPC, and popularity is a reasonable, already-available proxy. Note this as
  a deliberate simplification, not an oversight.
- Server-only: this file is never imported into a Client Component.

## Outcome

Built and verified: 22 unit tests, including a genuine concurrency proof for
Step 3 (a deliberately-unresolved lexical query, checked synchronously to
confirm the embedding-cache check had already fired before the lexical query
ever resolves). Full suite 188/188, build and lint clean. Checkpoint commit
`d9520b2` on `feature/query-cache-match-movies-rpc`.
