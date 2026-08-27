# Feature: Search route + UI

**From build-plan:** feature 6d (sub-feature of 6. Natural-language search) - the
last piece; feature 6 shipped once this was done.
**Status:** complete

## Goal

Wire 6a/6b/6c's already-built pieces (cache, parse, hybrid retrieval) into a
`/api/search` Route Handler, and give it a UI: a natural-language search box
on `/` that shows results tagged with why each one matched.

## In scope

- A migration correcting an oversight from 6a (see Notes): `query_cache`
  needs to be readable/writable by `anon`/`authenticated`, not service-role
  only, because the route handler that touches it uses the ordinary
  request-scoped Supabase client, never the admin client.
- `GET /api/search?q=<text>` Route Handler: validates `q`, fetches the genre
  catalog, calls `parseSearchQuery` (6b) then `searchMovies` (6c), returns
  JSON.
- A natural-language search box (client component) on `/`: loading, error,
  empty, and results states; each result tagged with how it matched
  (`matchedVia`).

## Out of scope

- A "here's what we understood" filter-chip summary (e.g. "Comedy - 1990s") -
  only the per-result match tag is required; a global summary is a nice-to-have
  for later, not this step.
- Rate limiting / anonymous request caps (feature 20) - the route validates
  `q`'s length as basic input hygiene, nothing more.
- Any change to the existing keyword/filter search (feature 5) - the new
  search box is a separate, additional entry point on the same page.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `query_cache` anon/authenticated policies** - scaffold with
  `npx supabase migration new query_cache_anon_policies`; add `select`,
  `insert`, and `update` policies on `query_cache` for `anon, authenticated`
  (mirrors how `movies`/`genres` are already public-read, extended to
  public-write for this one cache table). The migration's comment explains
  why this table differs from `ingest_checkpoint`'s zero-policy pattern (see
  Notes). *Done when:* `npx supabase db push` applies cleanly, and a `curl`
  request to the `query_cache` REST endpoint using the anon key succeeds for
  both a `select` and an `insert` (proving the route handler in Step 2 will
  actually be able to read/write the cache, not just that the policy exists
  on paper).
- [x] **Step 2 - `/api/search` Route Handler** - `src/app/api/search/route.ts`:
  `GET`, validates `q` with zod (`trim().min(1).max(200)`, 400 + `{error}`
  on failure), fetches genres via `getGenres` (browse.ts), calls
  `parseSearchQuery(q, genres, process.env.OPENROUTER_API_KEY!)` then
  `searchMovies(client, process.env.OPENAI_API_KEY!, parsed)` using the
  ordinary `createClient()` from `src/lib/supabase/server.ts` (never the
  admin client - see Notes), maps `RankedMovie[]` to the camelCase
  `SearchResultMovie[]` wire shape, returns
  `{ query, semanticQuery, results }`. An unexpected throw (a genuine
  Postgres error) returns 500 + `{error}`. *Done when:* vitest (mocking
  `getGenres`, `parseSearchQuery`, `searchMovies`) covers a missing/blank
  `q` (400), a successful request (genres/parsed/searchMovies called
  correctly, response mapped and shaped right), and an unexpected throw
  (500 + error body). Full suite, build, and lint stay green.
- [x] **Step 3 - natural-language search box + match badges** - extend
  `PosterCard` with an optional `badge?: { label: string }` prop rendered
  under the title (reusing `PillLinkGroup`'s existing neon-cyan pill style,
  not inventing a new color); add
  `src/components/catalog/NaturalLanguageSearchBar.tsx` (`"use client"`):
  text input + submit, `fetch('/api/search?q=...')` on submit, disables the
  submit button while loading, renders loading / error / empty / results
  states, maps `matchedVia` to a short label ("Matched: title/cast" /
  "Matched: theme" / "Matched: title & theme") passed as `PosterCard`'s
  badge; wire it into `src/app/page.tsx` above the existing keyword
  `SearchBar`, with a short label distinguishing the two ("Or search by
  vibe"). *Done when:* typing a natural-language query and submitting shows
  a loading state, then either a tagged result grid or an appropriate
  empty/error state, verified via the dev server and a screenshot; `npm run
  build` and `npm run lint` stay clean. UI/integration step - no unit test
  per the testing gate; rides on browser + build evidence.

## Files / areas

- `supabase/migrations/<timestamp>_query_cache_anon_policies.sql` (new)
- `src/app/api/search/route.ts` (new) + `route.test.ts`
- `src/types/movie.ts` - add `SearchResultMovie`
- `src/components/catalog/PosterCard.tsx` - optional badge prop
- `src/components/catalog/NaturalLanguageSearchBar.tsx` (new)
- `src/app/page.tsx` - mount the new search bar

## Data / contracts

- `SearchResultMovie extends BrowseMovie { matchedVia: "keyword" | "theme" |
  "keyword+theme" }` (drops `RankedMovie`'s internal `score` - not needed by
  the UI).
- `GET /api/search?q=<text>` -> `200 { query: string; semanticQuery: string;
  results: SearchResultMovie[] }`, or `400 { error: string }` for an
  invalid `q`, or `500 { error: string }` for an unexpected failure.

## Testing

- Test runner is configured (`npm test`) - Step 2's route handler is thin
  wiring around already-tested logic (`parseSearchQuery`, `searchMovies`),
  same category as this feature's other orchestration wrappers, so it ships
  a mocked-dependency test per its done-when.
- Step 3 is UI/integration (a client component, a browser-driven flow) -
  screenshot + build evidence per `coding-standards.md`, no unit test
  predicted.

## Notes for the AI

- **Why Step 1 exists / correcting 6a:** `query_cache` was originally given
  zero RLS policies, mirroring `ingest_checkpoint` - reasonable for
  `ingest_checkpoint` (touched only by the offline ingest script via the
  admin client) but wrong for `query_cache`, which the *live, anonymous-facing
  search route* needs to read and write. `src/lib/supabase/admin.ts`'s own
  doc comment says never to import the admin client into a route handler
  that responds to the browser - so the fix is granting `anon, authenticated`
  access on `query_cache` itself (like `movies`/`genres` already have),
  not reaching for the admin client here. `query_cache` holds no PII (just
  query text, an embedding, and a hit count), so public read/write on this
  one cache table is a low-risk, appropriate trade.
- Reuse, don't reimplement: `getGenres`/`PAGE_SIZE` (`browse.ts`),
  `parseSearchQuery` (`search/parse.ts`), `searchMovies` (`search/retrieve.ts`).
  This step is wiring + UI only, no new business logic.
- The client component only ever calls `/api/search` via `fetch` - it never
  imports server-only code (`parseSearchQuery`, `searchMovies`, any
  Supabase client) directly.
- **`OPENROUTER_API_KEY` still isn't in `.env.local`** (flagged back in 6b) -
  add it before manually trying this feature, or natural-language parsing
  will always gracefully degrade to raw-text search (still functional, just
  not demonstrating the structured-filter extraction).
- `q`'s zod validation (length 1-200) is basic input hygiene, not the rate
  limiting feature 20 will add later - don't build guardrails beyond that
  here.

## Outcome

Built and verified end-to-end with the real dev server, not just mocks:
SSR'd HTML confirmed the new UI renders; a live `curl` against `/api/search`
returned real results with `matchedVia: "theme"` (vector search genuinely
worked); a follow-up anon-key `curl` against `query_cache` confirmed the
query was actually cached, proving Step 1's RLS fix works in the live flow.
`q=` correctly 400s. Deviated slightly from the spec's literal wording: put
a "Search by vibe" heading on the new bar itself rather than an "Or search
by vibe" label on the existing keyword bar, since the new bar sits above it
- same distinguishing intent, better fit given the placement. Full suite
193/193, build and lint clean. Checkpoint commit `4b3c753` on
`feature/query-cache-match-movies-rpc`.

Feature 6 (Natural-language search) is complete across all four sub-features
(6a-6d), all built and checkpointed on one branch.
