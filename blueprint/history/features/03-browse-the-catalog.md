# Feature: Browse the catalog

**From build-plan:** feature 3
**Status:** completed 2026-08-26

## Goal

An anonymous visitor can land on `/` and see the film catalog as a poster grid,
sorted by popularity, rating, or release date, paginated. This is the first
user-facing screen in the app and the first feature to touch the UI, so it also
establishes the CineMood design tokens that every later screen builds on.

## Design reference

No mockup exists yet (`prototypes/` hasn't been run and no reference image was
provided). The look is fully specified in `blueprint/context/project-overview.md`
under UI/UX (exact hex tokens, dark-mode-first, neon accents, no bare
percentages) - build against that written spec rather than blocking on an image.

## In scope

- Neon-on-dark design tokens (from `project-overview.md`) ported into
  `globals.css`, replacing the default shadcn palette. Dark only for now - a
  light variant is not defined by the spec and isn't needed for this feature.
- `image.tmdb.org` added to `next.config.ts` `images.remotePatterns` (currently
  missing).
- A typed, tested helper that parses `sort`/`page` URL params into a safe query.
- A server-rendered poster grid pulling from `movies` (already public via RLS,
  no auth needed), sorted by popularity / rating (`weighted_rating`) / release
  date, descending only.
- Pagination via URL `?page=`.
- Loading skeleton and a friendly message if the query fails.

## Out of scope

- Keyword/genre/runtime/age filters (feature 5) and natural-language search
  (feature 6) - this is browse-only, no query box.
- Film detail page / clicking a poster (feature 4) - cards render but don't
  need to link anywhere real yet; a non-functional `href` placeholder is fine.
- Ascending sort direction, per-column direction toggle - descending only for
  every sort key, matching "most popular / highest rated / newest first."
- Light theme variant.
- TMDB attribution footer - explicitly feature 22 (deployment readiness).
- Genre chips/badges on cards - not requested by this feature's line item.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Design tokens** - replace the default shadcn OKLCH palette in
  `src/app/globals.css` with CineMood's tokens from `project-overview.md`
  (`--bg`, `--surface`, `--surface-2`, `--fg`, `--muted`, `--neon-magenta`,
  `--neon-cyan`, `--neon-lime`, `--neon-amber`), wired through the existing
  `@theme inline` block so `bg-background`/`text-foreground` etc. resolve to
  them. Set dark as the only/default mode (drop the `.dark` override split for
  now). Update `layout.tsx` metadata (`title: "CineMood"`, a real description).
  *Done when:* `npm run build` passes and the homepage renders the dark
  background/foreground tokens (screenshot).

- [x] **Step 2 - Browse query contract** - add `BrowseMovie` to
  `src/types/movie.ts` (`id`, `title`, `posterPath`, `releaseDate`,
  `voteAverage`, `weightedRating`, `popularity`) - **load-bearing**: feature 4
  (film detail) will define its own fuller type but should reuse this shape for
  grid cards. Add `src/lib/movies/browse.ts` with `parseBrowseParams(searchParams)`
  - a pure function validating `sort` against `'popularity' | 'rating' |
  'release_date'` (default `'popularity'`) and clamping `page` to an integer
  `>= 1` (default `1`) - and `getBrowseMovies({ sort, page })`, which maps sort
  to the right column (`popularity`, `weighted_rating`, `release_date`), runs
  the Supabase server-client query with `.range()` for a 24-per-page window and
  `count: 'exact'`, and returns `{ movies: BrowseMovie[], totalCount: number }`.
  *Done when:* `npm test` passes with a new `browse.test.ts` covering
  `parseBrowseParams` (valid sort, invalid sort falls back, missing/non-numeric/
  zero/negative page clamps to 1).

- [x] **Step 3 - Poster grid renders** - `src/components/catalog/PosterCard.tsx`
  and `PosterGrid.tsx`, rendering `next/image` from
  `https://image.tmdb.org/t/p/w342{posterPath}` with `unoptimized` (per
  project-overview's Vercel Hobby image-quota note), a placeholder box for
  films with a null `posterPath`, and title/year/rating underneath. Rewrite
  `src/app/page.tsx` as a server component: read `searchParams`, call
  `parseBrowseParams` + `getBrowseMovies`, render `PosterGrid`. Remove the
  default create-next-app landing content. *Done when:* `/` shows a real grid
  of posters sorted by popularity descending (screenshot).

- [x] **Step 4 - Sort control** - `src/components/catalog/SortControl.tsx`
  (client component): three options (Popularity, Rating, Release date) as
  links/buttons that set `?sort=` and reset `?page=1`, with the active option
  visually marked (neon-cyan per the token set). *Done when:* clicking each
  option reorders the grid and the URL reflects the chosen `sort` value
  (screenshot + URL check per option).

- [x] **Step 5 - Pagination** - `src/components/catalog/Pagination.tsx`:
  Prev/Next controls plus a "page X of Y" label, driven by `totalCount` from
  Step 2 and the current `page`/`sort` params (sort must carry over across page
  links). Prev disabled on page 1, Next disabled on the last page. *Done when:*
  navigating forward/back changes the films shown, the URL `page` param
  updates, and both boundaries correctly disable (screenshot + click-through).

- [x] **Step 6 - Loading and error states** - `src/app/loading.tsx` with a
  skeleton grid matching `PosterGrid`'s layout (Next.js route-segment loading
  UI, shown automatically during the server fetch). Wrap the `getBrowseMovies`
  call in `page.tsx` in try/catch; on failure, render a friendly "couldn't load
  the catalog" message instead of a crash. *Done when:* a throttled reload
  shows the skeleton before the grid, and a deliberately broken Supabase env
  var (temporary local test) shows the friendly message, not a Next.js error
  page.

## Files / areas

- `src/app/globals.css` - design tokens
- `src/app/layout.tsx` - metadata
- `next.config.ts` - `images.remotePatterns` for `image.tmdb.org`
- `src/types/movie.ts` - new, `BrowseMovie` (load-bearing for feature 4)
- `src/lib/movies/browse.ts` + `browse.test.ts` - new
- `src/components/catalog/PosterCard.tsx`, `PosterGrid.tsx`, `SortControl.tsx`,
  `Pagination.tsx` - new
- `src/app/page.tsx` - rewritten
- `src/app/loading.tsx` - new

## Data / contracts

- `BrowseMovie` (new, `src/types/movie.ts`):
  ```ts
  interface BrowseMovie {
    id: number;
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
    voteAverage: number | null;
    weightedRating: number | null;
    popularity: number | null;
  }
  ```
- `parseBrowseParams(searchParams: URLSearchParams | Record<string, string | string[] | undefined>): { sort: 'popularity' | 'rating' | 'release_date'; page: number }`
- `getBrowseMovies(params: { sort; page }): Promise<{ movies: BrowseMovie[]; totalCount: number }>` - reads from `movies` via the existing server Supabase client (`src/lib/supabase/server.ts`), page size fixed at 24.

## Testing

- `npm test` (Vitest) covers `parseBrowseParams` in `browse.test.ts` - it's a
  pure validator per the Testing scope rule (assertable inputs/outputs: valid
  sort values, an invalid one, missing/malformed/out-of-range page numbers).
- `getBrowseMovies` itself is a thin Supabase-calling wrapper (integration) -
  exempt per the same rule, verified by the running app instead.
- UI steps (3-6) ride on screenshot + `npm run build` evidence, per the
  component/integration exemption.

## Notes for the AI

- Server components by default; only `SortControl` and `Pagination` need
  `'use client'` if they use interactive nav (plain `<Link>` with query params
  needs no client component at all - prefer that over client-side state, since
  the sort/page is URL-driven and should stay server-renderable).
- `movies` is `anon`-readable per existing RLS policy - use the existing
  `createClient()` from `src/lib/supabase/server.ts`, not the admin client
  (that's service-role, ingest-only).
- Poster URLs are built at render time from `poster_path` only, per
  project-overview's Images convention - never store a full URL.
- Keep `weighted_rating` as the "Rating" sort key, not raw `vote_average` -
  it's the Bayesian-weighted column computed exactly to avoid a 10.0-with-4-votes
  problem in a sort like this.
- No em dashes, matching `coding-standards.md`'s Writing section.
