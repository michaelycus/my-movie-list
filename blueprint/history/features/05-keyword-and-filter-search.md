# Feature: Keyword and filter search

**From build-plan:** feature 5
**Status:** completed 2026-08-26

## Goal

Let anyone find films in the catalog by typing a title, actor, or director
name, and narrow the grid with structured filters (genre, decade, runtime
band, age ceiling). This is the lexical half of search - project-overview.md's
hybrid retrieval plan for feature 6 (natural-language search) merges this
lexical path with vector results later, so the query-building and filter
logic built here is reused, not replaced.

## In scope

- Populate `movies.search_doc` (currently `null` for every row) from title +
  cast + director, so full-text search actually has something to search.
- Free-text search box matching title, cast, and director via
  `search_doc`.
- Structured filters: genre (multi-select, OR), decade, runtime band, age
  ceiling (max) - all combine with the text query and each other via AND.
- Filters and sort/pagination stay in sync: changing one preserves the others
  in the URL (a real gap today - `SortControl`/`Pagination` rebuild the URL
  from scratch and would silently drop any active filter).
- A "no films match your filters" empty state, distinct from the existing
  load-failure state.
- "Clear filters" affordance.

## Out of scope

- Natural-language parsing and semantic/vector search, and "why this matched"
  (feature 6 - this feature only builds the lexical/structured half feature 6
  will merge with).
- Autocomplete/type-ahead, search history, saved searches.
- Search analytics/rate limiting (feature 20).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Backfill `search_doc`** - New migration under
  `supabase/migrations/` that populates every existing row's `search_doc` via
  a one-time `UPDATE`: `to_tsvector('simple', title || cast names || crew
  names)`, aggregating `movie_cast.person_name` and `movie_crew.person_name`
  (director) per movie with a correlated subquery. `'simple'` (no stemming) is
  deliberate - the content is mostly proper nouns (titles, people), where
  English stemming does more harm than good. Apply with `npx supabase db
  push`. *Done when:* querying `search_doc` for a known film (e.g. id 5, "Four
  Rooms") is non-null, and `select id, title from movies where search_doc @@
  websearch_to_tsquery('simple', 'tarantino')` returns films Quentin Tarantino
  directed or acted in.

- [x] **Step 2 - Search params and URL helpers** - In `src/lib/movies/browse.ts`,
  extend `BrowseParams`/`parseBrowseParams` with: `q` (string, trimmed, empty
  -> `null`), `genreIds` (`number[]`, from repeated or comma-separated `genre`
  params, invalid entries dropped rather than rejecting the request), `decade`
  (number, must be a multiple of 10 in `[1920, 2020]` or `null`), `runtimeBand`
  (`"short" | "standard" | "long" | null`), `maxAge` (one of the real observed
  certification values `0 | 10 | 12 | 14 | 16 | 17 | 18`, or `null`). Add pure
  helpers: `decadeToDateRange(decade)` -> `{ start, end }` ISO dates;
  `runtimeBandToRange(band)` -> `{ min, max }` minutes (`short` < 90,
  `standard` 90-150, `long` > 150); `buildSearchHref(params, overrides)` ->
  the `/?...` querystring for the merged params, omitting default/empty
  fields. *Done when:* `npm test` passes new unit tests covering each parser's
  valid/invalid/missing cases and both range helpers' boundaries (89/90,
  150/151), plus `buildSearchHref` merging overrides and omitting defaults.

- [x] **Step 3 - Query layer** - In `src/lib/movies/browse.ts`, factor the
  `movies` query building (currently only `.order().range()`) into a shared
  filter step applied to *both* the count query and the data query, so
  pagination stays accurate under filters. Add, each conditional on the param
  being set: `.textSearch("search_doc", q, { type: "websearch", config:
  "simple" })`; `.overlaps("genre_ids", genreIds)`; `.gte("release_date",
  start).lt("release_date", end)` from `decadeToDateRange`; `.gte("runtime",
  min).lte("runtime", max)` from `runtimeBandToRange` (excludes `runtime:
  null` rows - an unknown runtime can't be confirmed to fit a band);
  `.lte("min_age", maxAge)` (excludes `min_age: null` rows for the same
  reason - unknown certification isn't assumed safe). Add `getGenres()`
  (`id, name` from `genres`, ordered by name) for the filter bar. *Done when:*
  manually querying through `getBrowseMovies` with each filter type set
  (checked against the running app in Step 4) returns only matching films, and
  `totalCount`/pagination reflect the filtered set, not the full catalog.

- [x] **Step 4 - Search box, filter bar, and wiring** - Add
  `src/components/catalog/PillLinkGroup.tsx` (reusable row of pill `Link`s -
  single- or multi-select, generalizing `SortControl`'s existing pattern).
  Add `src/components/catalog/SearchBar.tsx` (a `<form method="get" action="/">`
  with a text input for `q`, plus hidden inputs mirroring the other active
  params so submitting text search doesn't drop other filters). Add
  `src/components/catalog/FilterBar.tsx` composing `PillLinkGroup` for genre
  (multi-select, toggles one genre in/out of `genreIds`), decade, runtime
  band, and max age (single-select each), plus a "Clear filters" link shown
  only when a filter is active. Update `SortControl` and `Pagination` to build
  their hrefs with `buildSearchHref` instead of hardcoding `/?sort=...`, so
  they preserve active filters. Wire everything into `src/app/page.tsx`:
  parse the fuller params, call `getGenres()` and the filtered
  `getBrowseMovies()`, and render a "No films match your filters" message
  (with the same "Clear filters" link) when the query succeeds but returns
  zero rows - distinct from the existing `loadFailed` message. *Done when:*
  typing an actor name and submitting returns their films; selecting a genre,
  decade, runtime band, or age ceiling narrows the grid; combining several
  filters at once ANDs them; changing sort or page while filtered keeps the
  filters active (visible in the URL); an over-narrow combination shows the
  empty state, not a blank grid or a crash; "Clear filters" returns to the
  unfiltered catalog.

## Files / areas

- `supabase/migrations/` (new migration) - `search_doc` backfill.
- `src/lib/movies/browse.ts` - extended params, parsers, range helpers,
  `buildSearchHref`, filtered query, `getGenres()`.
- `src/lib/movies/browse.test.ts` - extended with the new unit tests.
- `src/components/catalog/PillLinkGroup.tsx` (new).
- `src/components/catalog/SearchBar.tsx` (new).
- `src/components/catalog/FilterBar.tsx` (new).
- `src/components/catalog/SortControl.tsx`, `Pagination.tsx` - use
  `buildSearchHref`.
- `src/app/page.tsx` - wire in search/filters, empty-state.

## Data / contracts

```ts
export type RuntimeBand = "short" | "standard" | "long";
export type AgeCeiling = 0 | 10 | 12 | 14 | 16 | 17 | 18;

export interface BrowseParams {
  sort: BrowseSort;
  page: number;
  q: string | null;
  genreIds: number[];
  decade: number | null; // e.g. 1990 = the 1990s
  runtimeBand: RuntimeBand | null;
  maxAge: AgeCeiling | null;
}
```

`search_doc` (`tsvector`, already migrated and GIN-indexed in feature 1a) goes
from unused to load-bearing here - locked as title + cast + director text,
matching project-overview.md's data model. Feature 6 reuses `BrowseParams`,
`buildSearchHref`, and the filtered `getBrowseMovies` query as the lexical
half of its hybrid merge, so this shape is load-bearing for that feature too.

## Testing

`npm test` (Vitest) is configured, so this is a gate. In-scope logic:
`parseBrowseParams`'s new fields, `decadeToDateRange`, `runtimeBandToRange`,
and `buildSearchHref` are pure and ship unit tests per Step 2's done-when.
`getBrowseMovies`/`getGenres` are Supabase-calling functions, like the
existing precedent - not unit tested; verified against the real running app
in Steps 3-4 (a filtered query returns only matching films, pagination counts
match). The search box, filter bar, and empty state are UI/integration and
ride on running-app verification plus the build, not unit tests - no
Playwright is installed in this project, so use the dev/prod server and
API/HTML output as evidence (see feature 4's precedent).

## Notes for the AI

- Server components throughout - no `'use client'`. The search box is a plain
  GET `<form>`, filters are `Link`s, matching the project's existing
  zero-client-JS navigation pattern (`SortControl`, `Pagination`) rather than
  introducing controlled inputs or shadcn form components.
- No shadcn/ui primitives exist in this codebase yet despite being configured
  in `components.json`; features 3 and 4 both hand-rolled plain Tailwind
  elements on the neon-dark tokens instead. Match that precedent here rather
  than installing shadcn `input`/`select` mid-feature.
- Apply the same filters to the count query and the data query in
  `getBrowseMovies` - duplicating the filter chain (or worse, filtering only
  one) desyncs `totalCount`/pagination from the actual result set.
- `min_age: null` and `runtime: null` are "unknown," not "safe" - both filters
  exclude nulls rather than including them, so a runtime-band or age-ceiling
  filter never surfaces a film it can't actually confirm fits.
- Reuse `formatAgeCertification` from `src/lib/movies/detail.ts` for the age
  filter's pill labels instead of re-deriving "16+"/"All ages" text.
- The migration changes stored data (all 5000 rows), not just schema - it's
  idempotent (safe to re-run) but still worth a manual sanity check after
  applying, per Step 1's done-when.
