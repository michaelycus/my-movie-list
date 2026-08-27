# Feature: Query cache & vector match RPC

**From build-plan:** feature 6a (sub-feature of 6. Natural-language search)
**Status:** complete

## Goal

Lay the database foundation natural-language search builds on: a `query_cache`
table so repeat searches don't re-pay for an OpenAI embedding, and a
`match_movies` pgvector RPC so vector retrieval runs in the database, not
client-side. Later sub-features (6b parsing, 6c merge, 6d route + UI) build on
top without touching schema again.

## In scope

- Migration adding `query_cache` (query_hash PK, query_text, embedding,
  hits, created_at) and the `match_movies` RPC function.
- `match_movies(query_embedding, match_count)` returns candidate movies
  ordered by cosine similarity, shaped so the existing `applyFilters` helper
  from `src/lib/movies/browse.ts` can filter/paginate its results the same
  way it filters a plain `movies` select today.
- Typed helpers to read a cached embedding by query hash and to upsert one
  (insert or bump `hits` on repeat), plus the query-hash function itself.

## Out of scope

- Calling OpenRouter/OpenAI to actually parse or embed a query (6b).
- Full-text + vector merge, Reciprocal Rank Fusion, "why this matched" (6c).
- The `/api/search` route handler and any UI (6d).
- Rate limiting / anonymous request caps (feature 20).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `query_cache` table + `match_movies` RPC migration** -
  scaffold with `npx supabase migration new query_cache_and_match_movies`
  (never a hand-invented filename), then fill it in: `query_cache` (RLS
  enabled, no policies - service-role only, same pattern as
  `ingest_checkpoint`) and `match_movies(query_embedding
  extensions.vector(1536), match_count int default 200) returns table (id
  bigint, title text, poster_path text, release_date date, vote_average
  numeric, weighted_rating numeric, popularity numeric, genre_ids
  smallint[], runtime int, min_age smallint, similarity real)`, ordered by
  cosine distance ascending, `security invoker`, execute granted to `anon,
  authenticated` (movies are already public-read). *Done when:* `npx
  supabase db push` applies the migration to the linked project with no
  errors, `select * from match_movies('[0,0,...]'::vector, 5);` returns
  rows in the SQL editor, and `npx supabase db advisors` (or the MCP
  `get_advisors` tool) reports no new security findings.
- [x] **Step 2 - query-hash helper** - pure function in
  `src/lib/search/query-cache.ts` that normalizes free text (trim, lowercase,
  collapse whitespace) and hashes it to the `query_hash` key, so "Films with
  Tom Hanks" and "films  with tom hanks " share a cache row. *Done when:* a
  vitest unit test covers normalization (case, whitespace) and confirms equal
  inputs hash equal and distinct inputs hash distinct.
- [x] **Step 3 - cache read/write helpers** - `getCachedQueryEmbedding(client,
  queryHash)` and `cacheQueryEmbedding(client, {queryHash, queryText,
  embedding})` in the same file, mirroring the `getCheckpoint`/`setCheckpoint`
  pattern in `src/lib/ingest/checkpoint.ts` (mocked Supabase client in tests,
  same shape of `from().select().eq().maybeSingle()` / `.upsert()` calls).
  Reading a hit bumps `hits` via a second update (or a single upsert with
  `hits = query_cache.hits + 1` via an RPC/raw SQL if the client supports it -
  keep it simple: read first, then upsert with incremented `hits`). *Done
  when:* vitest tests cover cache hit (returns embedding, increments hits),
  cache miss (returns null), and write (upserts with the given hash/text/
  embedding).
- [x] **Step 4 - typed `matchMovies` wrapper** - `matchMovies(client,
  embedding, limit)` in `src/lib/search/match.ts` calling the RPC via
  `client.rpc("match_movies", {...})`, returning results typed to match the
  existing `MovieRow`-like shape (reuse/extend the type from
  `src/lib/movies/browse.ts` rather than redefining it) plus `similarity`.
  *Done when:* a vitest test with a mocked client asserts the RPC is called
  with the right params and the response rows are mapped/typed correctly.

## Files / areas

- `supabase/migrations/<timestamp>_query_cache_and_match_movies.sql` (new)
- `src/lib/search/query-cache.ts` (new) + `query-cache.test.ts`
- `src/lib/search/match.ts` (new) + `match.test.ts`
- `src/lib/movies/browse.ts` - export the `MovieRow`-shaped type (or a shared
  supertype) so `match.ts` can reuse it instead of redefining the same columns

## Data / contracts

- `query_cache`: `query_hash text primary key, query_text text not null,
  embedding extensions.vector(1536) not null, hits int not null default 1,
  created_at timestamptz not null default now()`. Internal cost-optimization
  cache, not user-owned data - no anon/authenticated policies, same as
  `ingest_checkpoint`. (Corrected in 6d - see that archive - once the live
  search route needed to touch this table with the ordinary client.)
- `match_movies` RPC return shape is **load-bearing for 6c**: it must carry
  every column `applyFilters` in `browse.ts` filters on (`genre_ids`,
  `release_date`, `runtime`, `min_age`) plus display columns
  (`poster_path`, `vote_average`, `weighted_rating`, `popularity`) and
  `similarity`, so 6c can filter and merge without a second query.

## Testing

- Test runner is configured (`npm test`) - this step is pure logic
  (hashing, cache read/write, RPC param mapping), so it ships with unit
  tests per the steps above, mocking the Supabase client the same way
  `checkpoint.test.ts` does.
- The migration itself isn't unit-testable; verified manually with `npx
  supabase db push` against the linked project and a direct RPC call, per
  Step 1's done-when.

## Notes for the AI

- Follow the existing `ingest_checkpoint` precedent for `query_cache`'s RLS
  (enabled, zero policies, service-role only) - it's the same kind of
  internal bookkeeping table, not user data.
- `match_movies` uses `security invoker` and an explicit `grant execute`,
  matching how `movies` itself is already anon-readable - no need for
  `security definer`.
- Reuse `applyFilters`'s `FilterableQuery` interface pattern in mind for 6c;
  don't duplicate filter logic here, just make sure the RPC's return columns
  support it later.
- No new env vars needed for this step - embedding computation and OpenRouter
  calls belong to 6b/6d.
- Follow the same imperative-migration workflow as feature 1a: scaffold with
  `npx supabase migration new`, apply with `npx supabase db push` against the
  linked hosted project (this project has no local Supabase dev instance),
  and check `npx supabase db advisors` before calling the migration step done.

## Outcome

Built and verified: migration applied to the linked project, `match_movies`
smoke-tested with a real embedding (correct similarity ordering), no new
security advisories. All 4 steps shipped with passing unit tests. Checkpoint
commit `0916cd3` on `feature/query-cache-match-movies-rpc`.

An oversight surfaced later, in 6d: `query_cache`'s zero-policy RLS (mirroring
`ingest_checkpoint`) was wrong for a table the live, anonymous-facing search
route needs to read/write with the ordinary client. Fixed by 6d's own
migration, not by editing this one - see `6d-search-route-ui.md`.
