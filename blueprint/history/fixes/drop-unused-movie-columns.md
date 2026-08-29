# Fix: Drop unused `movies` columns (`status`, `countries`, `original_title`)

**Type:** Fix
**Status:** completed 2026-08-29

## The problem

An `/audit` pass into why only 20 of 5,000 films had landed in `movies`
surfaced a separate issue while reviewing the schema: three columns are dead
weight, confirmed by grepping every read path (`browse`, `detail`, `search`,
`friends/taste`, `sessions`, `admin`) and the embedding document builder -
none of them ever select these columns back out:

- **`status`** - `normalizeCatalog()` already filters the CSV to
  `status === "Released"` before a row ever becomes a `NormalizedFilm`
  ([catalog.ts:50-51](src/lib/ingest/catalog.ts#L50-L51)). Every stored row's
  `status` is therefore always the literal string `"Released"` - it carries no
  information after ingest.
- **`countries`** - captured into `NormalizedFilm.countries` at ingest, never
  referenced by any feature (no country filter exists in the spec or UI).
- **`original_title`** - same story - mapped in at ingest, never read back
  anywhere.

This is a good time to trim them: only 20 rows exist so far, before the full
~4,795-row ingest runs.

## The fix

1. Migration dropping the three columns from `movies`.
2. Remove `countries`, `status`, `originalTitle` from `NormalizedFilm` /
   `EnrichedFilm` (`src/lib/ingest/types.ts`), stop populating them in
   `normalizeCatalog()` (`src/lib/ingest/catalog.ts`), and stop mapping them in
   `toMovieRow()` (`src/lib/ingest/upsert.ts`).
3. `normalizeCatalog()` keeps filtering on `row.status` from the raw CSV row
   (`RawMovieCsvRow.status` stays - it's the real CSV column and still drives
   the Released filter); only the *normalized*/*stored* `status` field goes
   away. Same idea for `production_countries` and `original_title` on
   `RawMovieCsvRow` - those stay as-is, documenting the real CSV shape; they
   just stop flowing into `NormalizedFilm`.

Must not break: the Released-only filter, `weightedRating` computation (reads
`vote_average`/`vote_count`, untouched), or any other `NormalizedFilm` field.

## Build steps

- [x] **Step 1 - migration + code + tests** - New migration
  `supabase/migrations/20260829112045_drop_unused_movie_columns.sql` with
  `alter table movies drop column status, drop column countries, drop column original_title;`.
  Removed the three fields from `NormalizedFilm`/`EnrichedFilm`
  (`types.ts`), stopped setting them in `catalog.ts`, stopped mapping them in
  `upsert.ts`'s `toMovieRow()`. Updated the fixtures/assertions in
  `upsert.test.ts` that referenced the removed fields. *Done when:* `npm test`
  passes with no reference to `film.status`, `film.countries`, or
  `film.originalTitle` left in `src/lib/ingest/`, and the migration applies
  cleanly - met (341/341 tests passing, `npm run build` clean).

## Files / areas

- `supabase/migrations/20260829112045_drop_unused_movie_columns.sql` - new
- `src/lib/ingest/types.ts`
- `src/lib/ingest/catalog.ts`
- `src/lib/ingest/upsert.ts`
- `src/lib/ingest/upsert.test.ts`

## Verify

- `npm test` green - 37 files, 341 tests passing.
- `npm run build` - compiles and typechecks cleanly.
- Manual: apply the migration, confirm `movies` drops to 20 columns with
  `status`/`countries`/`original_title` gone.

## Findings

### drop-unused-movie-columns/F-04 [P1] accepted - `movies` table holds ~20 rows, not the 5,000 build-plan feature 1 claims

**File:** blueprint/history/features/1c-tmdb-enrichment-batch-upsert.md:34-37, scripts/ingest.ts:29-77
**Found:** 2026-08-29 by /audit (scope: path - scripts/ingest.ts, src/lib/ingest/; lens: quality)
**Why it matters:** Feature 1c's own spec explicitly deferred "a full
unbounded run of all ~4795 films" as a manual follow-up after review, never
part of its automated done-when - that done-when only required
`npm run ingest -- --limit=10` to succeed once, then again to prove checkpoint
resume. The ingest pipeline itself (checkpoint, batching, upsert) is correct
and matches the archived spec; nothing in the code is broken. The evidence
lines up exactly: two `--limit=10` runs (as the Step 4 done-when requires)
land ids 1-10 then 11-20 and leave `ingest_checkpoint.last_id` parked at the
20th film - which is exactly the row count reported (20). The full run was
apparently never executed, so build-plan feature 1 ("land 5,000 released
films in the database") is checked off `[x]` while its actual acceptance
criterion is unmet in the live database, and everything downstream that
assumes a populated catalog (feature 2 embeddings, feature 3 browse, features
5/6 search, feature 14 group recommendations) is only exercising ~20 rows.
**Suggested fix:** Run `npm run ingest` with no `--limit` to process the
remaining ~4775 films (it resumes from the current checkpoint automatically,
no reset needed). Confirm `SELECT count(*) FROM movies` reaches ~5000
afterward, then re-run `npm run embed` for any films the catalog run added
since the last embedding pass.
**Resolution:** Accepted 2026-08-29 by user - the fix on this branch only
trims unused `movies` columns and doesn't touch row count; the full
`npm run ingest` run that actually resolves this is the deliberately-planned
next action right after this merge.
