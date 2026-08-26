# Feature: Film detail page

**From build-plan:** feature 4
**Status:** completed 2026-08-26

## Goal

Give every film in the catalog its own page at `/films/[id]`: backdrop, poster,
overview, genres, runtime, cast, director, rating, and age certification. This
is the landing spot for a poster click from the catalog grid (feature 3) and
the contract later features (search results, session recommendations) will
link into.

## In scope

- `/films/[id]` route rendering one film's full detail.
- Data layer: fetch the movie row, its genre names, top-billed cast, and
  director from Supabase.
- Poster grid cards link to their film's detail page.
- 404 for a nonexistent or malformed id; friendly fallback for a Supabase
  fetch failure (distinct from "doesn't exist").
- Loading skeleton for the route.

## Out of scope

- Keyword/filter search and natural-language search (features 5, 6).
- "Why this matched" explanations - only meaningful once search exists.
- Seen-list toggle, friend/session actions, related-films rail - later
  features or not planned.
- TMDB attribution footer (feature 22, applies site-wide).
- Editing or admin actions on a film.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Detail data layer** - Add `MovieDetail` to `src/types/movie.ts`.
  Add `src/lib/movies/detail.ts` with:
  - `parseMovieId(raw: string): number | null` - valid positive integer ->
    that number; anything else (non-numeric, zero, negative, decimal) -> `null`.
  - `formatRuntime(minutes: number | null): string | null` - `null`/`0` ->
    `null` (caller hides the row); under 60 -> `"45m"`; exact hour -> `"1h"`;
    otherwise -> `"2h 5m"`.
  - `formatAgeCertification(minAge: number | null): string` - `null` ->
    `"Not rated"`; `0` -> `"All ages"`; otherwise -> `"{minAge}+"`.
  - `getMovieDetail(id: number): Promise<MovieDetail | null>` - fetches the
    movie row by id; when no row matches, returns `null` (not an error - the
    page turns this into a 404). When found, also fetches genre names (`genres`
    where `id = any(genre_ids)`), cast (`movie_cast` where `movie_id = id`,
    ordered by `billing_order`, nulls last - ingest already caps this at
    top-8), and director(s) (`movie_crew` where `movie_id = id`; ingest only
    ever stores `Director` rows here, joined with `", "` if more than one).
    Throws on a genuine Supabase error, same as `getBrowseMovies`.
  *Done when:* `npm test` passes new unit tests covering `parseMovieId` (valid
  id, non-numeric, zero, negative, decimal) and `formatRuntime` /
  `formatAgeCertification` (each documented case above, plus the boundary
  values 59/60/61 minutes).

- [x] **Step 2 - Film detail page** - Add `src/app/films/[id]/page.tsx` (server
  component). Parse the route param with `parseMovieId`; a `null` result calls
  `notFound()`. Call `getMovieDetail`; catch a thrown error into a friendly
  "couldn't load this film" message (same pattern as the browse page's
  `loadFailed`); a resolved `null` (no error, no row) calls `notFound()`.
  Render: backdrop (fallback to a plain surface panel when `backdropPath` is
  null), poster (fallback to title-in-box like `PosterCard`), title, tagline
  (omit if empty), overview, genre badges, formatted runtime (omit row if
  `null`), release year, `weightedRating` (reuse the neon-lime badge style
  from `PosterCard`), formatted age certification, director (omit row if no
  director credit), cast list (omit section if empty), and a "Back to
  catalog" link to `/`. *Done when:* visiting `/films/<a real id>` renders all
  present fields; a film missing tagline/runtime/director/cast renders
  without empty rows; `/films/999999999` and `/films/not-a-number` both 404;
  simulating a Supabase error renders the friendly fallback, not a crash.
  (Verified as a "soft 404": correct not-found content and a `noindex` meta
  tag render for both cases, but the HTTP status stays `200` rather than
  `404` - a documented Next.js 16 limitation, since the project's existing
  root `app/loading.tsx` forces every nested dynamic route to flush its
  shell before `notFound()` is discovered, and the status can't change once
  streaming starts. Accepted as-is; see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`.
  Fixing it for real would mean restructuring `loading.tsx`'s placement,
  which is feature 3's shipped layout and out of scope here.)

- [x] **Step 3 - Loading state and catalog link** - Add
  `src/app/films/[id]/loading.tsx` (skeleton matching the style of the
  existing catalog `loading.tsx`). Wrap `PosterCard`'s content in a Next
  `Link` to `/films/${movie.id}`. *Done when:* clicking any poster on `/`
  navigates to that film's detail page; throttling the network shows the
  skeleton first.

## Files / areas

- `src/types/movie.ts` - add `MovieDetail`.
- `src/lib/movies/detail.ts` (new) - data layer + formatters.
- `src/lib/movies/detail.test.ts` (new) - unit tests for the pure helpers.
- `src/app/films/[id]/page.tsx` (new) - the route.
- `src/app/films/[id]/loading.tsx` (new) - skeleton.
- `src/components/catalog/PosterCard.tsx` - wrap in a `Link`.

## Data / contracts

```ts
interface MovieDetail {
  id: number;
  title: string;
  tagline: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtime: number | null; // raw minutes; format with formatRuntime for display
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  weightedRating: number | null;
  minAge: number | null; // format with formatAgeCertification for display
  genres: { id: number; name: string }[];
  cast: { name: string; character: string | null }[];
  director: string | null; // "" joined -> null when no Director credit exists
}
```

Not flagged load-bearing for a specific later feature, but this is the
canonical single-film shape - reuse it rather than redefining if a later
feature (e.g. a related-films rail) needs the same data.

## Testing

`npm test` (Vitest) is configured, so this is a gate: `parseMovieId`,
`formatRuntime`, and `formatAgeCertification` are pure logic with real edge
cases and ship unit tests in `detail.test.ts` per Step 1's done-when.
`getMovieDetail` itself is a Supabase-calling function, like `getBrowseMovies`
- not unit tested; verify it via the running app (Step 2/3 done-whens) and
`/check`. The route and loading skeleton are UI/integration and ride on
screenshot plus build evidence, not unit tests.

## Notes for the AI

- Server component, no `'use client'` - matches `src/app/page.tsx`.
- Reuse `createClient` from `src/lib/supabase/server`, matching
  `src/lib/movies/browse.ts`'s pattern.
- Reuse the `POSTER_BASE_URL` constant pattern from `PosterCard.tsx` for both
  poster and backdrop image URLs (`image.tmdb.org` is already in
  `next.config.ts`'s `remotePatterns`); backdrops use `unoptimized` too.
- `movie_cast`/`movie_crew` are public-read (RLS already allows `anon`), so no
  auth is involved here.
- Match the existing neon-on-dark token usage (`--neon-lime` for the rating
  badge, `--neon-amber` for the error/fallback message) rather than inventing
  new colors.
- No test runner exists for route components in this codebase (see
  `browse.ts`/`page.tsx` precedent) - don't add one here.
