# Feature: CSV parse, join, and normalize

**From build-plan:** feature 1b (second sub-feature of 1. Film catalog ingest)
**Status:** completed 2026-08-26

## Goal

Turn the two raw TMDB CSVs into the exact shape the `movies`/`genres`/`movie_cast`/`movie_crew`
tables from 1a expect: streamed and joined on the TMDB id, JSON columns
normalized, non-`Released` films dropped, and a Bayesian `weighted_rating`
computed. This is pure transformation logic - no network calls, no database
writes. 1c wires this module's output into TMDB enrichment and the actual
upsert.

## In scope

- Streaming RFC-4180 CSV parsing of both files (credits.csv runs ~40MB with
  large embedded JSON cells and commas/newlines inside quoted fields).
- Joining `movies.id` to `credits.movie_id`.
- Normalizing `genres`, `keywords` (top 10), `cast` (billing order < 8),
  `crew` (Director only for now).
- Filtering to `status === "Released"`.
- Computing `weighted_rating` (Bayesian/IMDb-style) per film.
- Deduplicating the genre lookup list across the whole catalog.

## Out of scope

- TMDB API calls for `poster_path`, `backdrop_path`, `min_age` (feature 1c).
- Any database write - this feature returns in-memory data, 1c upserts it.
- Embeddings (feature 2).
- Writer/Original Music Composer crew roles - only Director for now; the
  `movie_crew` shape supports adding more `job` values later without a schema
  change.
- `budget`, `revenue`, `homepage`, `spoken_languages`, `production_companies` -
  present in the raw CSVs but intentionally not part of the `movies` schema
  locked in 1a, so they're not extracted here either.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - CSV streaming parsers** - add the `csv-parse` dependency; `src/lib/ingest/types.ts` (raw row and normalized shapes below); `src/lib/ingest/csv.ts` exporting `parseMoviesCsv(filePath)` and `parseCreditsCsv(filePath)`, each an `AsyncIterable` built on `csv-parse`'s stream API with `columns: true` (never `split(',')`). Test with small fixture CSV files under `src/lib/ingest/__fixtures__/` that include a quoted field containing a comma and an embedded newline, proving the real parser handles what `split(',')` can't - plus one test per parser that runs it against the real `references/*.csv` file and asserts exactly 4803 rows. *Done when:* `npm test` passes, including the real-file row-count assertions.
- [x] **Step 2 - JSON field normalizers** - `src/lib/ingest/normalize.ts` exporting `parseGenres`, `parseKeywords` (limit 10), `parseCast` (billing_order < 8), `parseCrew` (Director only), each taking the raw JSON string from a CSV cell. Handle `"[]"` and a crew array with no Director (return `[]`, never throw). *Done when:* `npm test` passes, with cases for a normal row, an empty array, and a crew list with no Director.
- [x] **Step 3 - Weighted rating** - `src/lib/ingest/rating.ts` exporting `computeGlobalVoteStats(films)` (mean `vote_average` across films with `vote_count > 0`, and `minVotesThreshold` as the median `vote_count`) and `computeWeightedRating(voteAverage, voteCount, meanVote, minVotesThreshold)` using `WR = (v/(v+m))*R + (m/(v+m))*C`. *Done when:* `npm test` passes, including a `vote_count = 0` case (result equals the global mean) and a high-vote-count case (result close to the film's own average).
- [x] **Step 4 - Join and assemble** - `src/lib/ingest/catalog.ts` exporting `normalizeCatalog(moviesCsvPath, creditsCsvPath): Promise<{ films: NormalizedFilm[]; credits: NormalizedCredits[]; genres: NormalizedGenre[] }>`: streams both files, indexes credits by id, filters to `Released`, applies Steps 2-3, and returns the deduplicated genre list. *Done when:* `npm test` passes a test that runs this against the real `references/*.csv` files and asserts: exactly 4795 films (the real `Released` count), film 19995 (Avatar) has title "Avatar", director "James Cameron", and Sam Worthington in the top 3 billed cast, and no film throws on empty cast/crew.

## Files / areas

- `src/lib/ingest/types.ts` - new
- `src/lib/ingest/csv.ts` - new
- `src/lib/ingest/normalize.ts` - new
- `src/lib/ingest/rating.ts` - new
- `src/lib/ingest/catalog.ts` - new
- `src/lib/ingest/__fixtures__/*.csv` - new, small hand-written fixtures
- `package.json` - new dependency (`csv-parse`)

## Data / contracts

Locking this now because 1c consumes it directly.

```ts
export interface RawMovieCsvRow {
  budget: string; genres: string; homepage: string; id: string;
  keywords: string; original_language: string; original_title: string;
  overview: string; popularity: string; production_companies: string;
  production_countries: string; release_date: string; revenue: string;
  runtime: string; spoken_languages: string; status: string; tagline: string;
  title: string; vote_average: string; vote_count: string;
}

export interface RawCreditsCsvRow {
  movie_id: string; title: string; cast: string; crew: string;
}

export interface NormalizedGenre {
  id: number;
  name: string;
}

export interface NormalizedFilm {
  id: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  tagline: string | null;
  releaseDate: string | null;   // "YYYY-MM-DD" or null
  runtime: number | null;
  originalLanguage: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  weightedRating: number;
  genreIds: number[];
  keywords: string[];           // up to 10
  countries: string[];          // production_countries[].name
  status: string;
}

export interface NormalizedCredits {
  movieId: number;
  cast: { personName: string; characterName: string | null; billingOrder: number | null }[];
  crew: { personName: string; job: string }[];  // job === "Director" only
}
```

`NormalizedFilm`'s fields map 1:1 to the `movies` columns from 1a, minus
`poster_path`, `backdrop_path`, `min_age`, `search_doc`, and the embedding
columns - those are added in 1c and feature 2. `NormalizedCredits` is kept
separate from `NormalizedFilm` (not nested) because it maps to two separate
tables (`movie_cast`, `movie_crew`).

## Testing

`npm test` is now configured (Vitest) and is a real gate: every step above
adds pure logic (parsers, normalizers, a rating calculator, a join/assemble
function) and ships with tests in the same step.

- Steps 1-3 use small hand-written fixtures - fast, deterministic, no
  dependency on the real 40MB files being present for the suite to run.
- Step 4's test runs against the real `references/tmdb_5000_movies.csv` and
  `references/tmdb_5000_credits.csv` - this is the integration proof that the
  whole pipeline works end to end against real data, not just fixtures.
- No UI or routes in this feature, so no browser evidence needed.

## Notes for the AI

- Use the `csv-parse` package's stream API (`import { parse } from "csv-parse"`), piped from `fs.createReadStream`. A Node `Readable` stream is async-iterable (`for await (const row of parser)`) - no extra glue needed.
- Real data, already inspected: 4803 rows in each CSV, every `movie_id` in credits.csv has a matching `id` in movies.csv and vice versa (no orphans, no duplicate ids) - the join is a plain map lookup, not a fuzzy match. 4795 of 4803 are `Released` (5 `Rumored`, 3 `Post Production`). 43 films have an empty `cast` array, 28 an empty `crew` array, 30 have crew but no `Director` credit. 62 films have `vote_count = 0`. 2 are missing `runtime`, 1 missing `release_date`, 844 missing `tagline`. Build fixtures and edge-case tests around these real shapes, not hypotheticals.
- `billing_order` is TMDB's `order` field, 0-indexed - "billing_order < 8" keeps the first 8 credited cast members (orders 0-7).
- Bayesian weighted rating on this dataset: mean `vote_average` (films with votes) is ~6.17, median `vote_count` is 236 - both plausible, sane inputs, not degenerate. Use them as computed from the actual `Released` set, not hardcoded.
- `character_name` in `NormalizedCredits.cast` maps to `movie_cast.character_name` from the 1a migration (renamed from the CSV's `character` key because `character` is a reserved Postgres type name).
- Keep this feature pure and I/O-light: reading the two CSV files is the only I/O. No Supabase, no TMDB, no network calls belong here.
