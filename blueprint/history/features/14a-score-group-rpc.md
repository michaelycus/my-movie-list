# Feature: Score-group RPC

**From build-plan:** feature 14a (split from 14 - Group recommendations)
**Status:** complete

## Goal

A Postgres function, `score_group`, that ranks the catalog for a room of
participants given each participant's query embedding and the room's combined
hard filters, using the project's 60/40 consensus/least-misery aggregation
(project-overview.md §5.2). Plus a typed TS wrapper mirroring `match.ts`'s
pattern for `match_movies`. This step proves the ranking math in isolation,
against inputs the caller assembles - it does not gather those inputs from a
real session (14b) or render anything (14c).

## Design reference

None - no UI in this sub-feature.

## In scope

- `score_group` SQL function: takes one query embedding per scored
  participant, the room's combined hard filters, and a consensus/least-misery
  weight; applies hard filters as a `WHERE` clause; computes per-participant
  cosine similarity; aggregates `group_score = consensus_weight * avg(sim) +
  (1 - consensus_weight) * min(sim)`; orders by `group_score` desc, tiebreak
  `weighted_rating` desc, then `popularity` asc (mild novelty preference per
  §5.2); returns the top `match_count` rows.
- `participant_scores`: an array of each scored participant's own cosine
  similarity, in the same order as the input embeddings - locked now because
  feature 15's per-participant fit breakdown needs this exact shape later and
  this is the step that decides it.
- `consensus_weight` as a real function parameter (default `0.6`), not a
  hardcoded constant - feature 15's consensus/adventurous slider needs to vary
  it later without another migration.
- TS wrapper (`src/lib/sessions/scoreGroup.ts`) and result type
  (`src/types/recommendation.ts`) that call the RPC and map its rows to
  camelCase, mirroring `src/lib/search/match.ts`.
- Empty-input handling: zero scored participants (embeddings `[]`) returns an
  empty result without calling the RPC - `avg`/`min` over zero rows is
  undefined in SQL, so short-circuiting in TS avoids relying on Postgres's
  empty-aggregate behavior.

## Out of scope

- Deciding *which* participants get a query embedding, or how the host (who
  has no `friends` row and so no stored `taste_embedding`) is scored - that
  belongs to 14b, which owns gathering real session data. This step accepts
  whatever embeddings array it's given.
- Blending tonight's mood into a participant's embedding (14b).
- Rendering results, the session page, and the group-score bar (14c).
- The consensus/adventurous slider UI (feature 15) - only the parameter it
  will drive is added here.
- The pick rationale (feature 16) and seen-list exclusion (feature 18 - the
  `seen_movies` table doesn't exist yet).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - `score_group` migration** - add a Postgres migration creating
  the `score_group(embeddings jsonb, max_runtime int, min_age_ceiling
  smallint, blocked_genres smallint[], consensus_weight numeric default 0.6,
  match_count int default 10)` function and `grant execute ... to
  authenticated` (this only ever runs for a signed-in host's own session,
  unlike the anon-readable `match_movies`). `embeddings` is `jsonb` (an array
  of number arrays), not `vector(1536)[]` - PostgREST's JSON coercion for a
  vector array parameter isn't a supported, documented path, while casting
  each `jsonb_array_elements` entry's text form to `vector` inside the
  function is a standard pgvector pattern. Hard filters mirror `browse.ts`'s
  `applyFilters` null semantics exactly: `max_runtime`/`min_age_ceiling` null
  means no cap, and a movie with an unknown `runtime`/`min_age` fails an
  active cap rather than passing it (Postgres `NULL <= x` is not true, same as
  the existing `applyFilters` comment already documents). *Done when:* the
  migration applies cleanly (`supabase db reset` or `migration up`), and a
  manual `select * from score_group('[[...]]'::jsonb, null, null, '{}', 0.6,
  5)` against dev data returns up to 5 rows with a `group_score` and a
  `participant_scores` array of the same length as the input, ordered
  descending by `group_score`.
- [x] **Step 2 - TS wrapper and types** - add `src/types/recommendation.ts`
  (`GroupRankedMovie`) and `src/lib/sessions/scoreGroup.ts`
  (`ScoreGroupParams`, `scoreGroup(client, params)`), following `match.ts`'s
  shape: snake_case RPC params in, camelCase typed rows out, RPC errors
  rethrown. `scoreGroup` returns `[]` immediately (no RPC call) when
  `params.embeddings.length === 0`. *Done when:* `npm run build` typechecks
  clean and the wrapper is callable from a scratch script or test with a
  mocked client.
- [x] **Step 3 - unit tests** - `src/lib/sessions/scoreGroup.test.ts`
  mirroring `match.test.ts`: asserts the RPC is called with the right
  snake_case params (including `consensus_weight`/`match_count` defaults),
  asserts the empty-embeddings short-circuit never calls `client.rpc`, asserts
  row mapping to camelCase (including `participantScores`), and asserts an
  RPC error is rethrown. *Done when:* `npm test` passes including these.

## Files / areas

- `supabase/migrations/20260827180000_score_group_rpc.sql` (new)
- `src/types/recommendation.ts` (new)
- `src/lib/sessions/scoreGroup.ts` (new)
- `src/lib/sessions/scoreGroup.test.ts` (new)

## Data / contracts

`score_group(embeddings jsonb, max_runtime int, min_age_ceiling smallint,
blocked_genres smallint[], consensus_weight numeric default 0.6, match_count
int default 10)` returns:

```
id bigint, title text, poster_path text, release_date date,
vote_average numeric, weighted_rating numeric, popularity numeric,
runtime int, min_age smallint,
group_score real,
participant_scores real[]   -- one per input embedding, same order
```

TS side (`src/types/recommendation.ts`):

```ts
export interface GroupRankedMovie {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  weightedRating: number | null;
  popularity: number | null;
  runtime: number | null;
  minAge: number | null;
  groupScore: number;
  participantScores: number[];
}
```

`ScoreGroupParams` (`src/lib/sessions/scoreGroup.ts`):

```ts
export interface ScoreGroupParams {
  embeddings: number[][];
  maxRuntime: number | null;
  minAgeCeiling: number | null;
  blockedGenres: number[];
  consensusWeight?: number; // default 0.6
  matchCount?: number;      // default 10
}
```

This contract is load-bearing for 14b (calls `scoreGroup`), 14c (renders
`GroupRankedMovie[]`), and feature 15 (reads `participantScores` for the fit
breakdown, varies `consensusWeight` for the slider).

## Testing

`npm test` (Vitest) is configured, so the test gate applies. In-scope logic
here is the TS wrapper's param-building, empty-input short-circuit, and row
mapping - all covered by Step 3. The SQL function itself has no unit-test
harness (no DB in the test runner, same as `match_movies` before it) and is
verified with the manual query in Step 1's done-when instead.

## Notes for the AI

- Server-only: `score_group` is called from server code (a Server Component
  or Server Action), never the browser, same as every other Supabase RPC in
  this project.
- `security invoker`, `set search_path = public, extensions`, matching
  `match_movies`'s existing pattern in
  `20260827091212_query_cache_and_match_movies.sql`.
- Grant to `authenticated` only, not `anon` - group sessions require a
  signed-in host, unlike catalog search.
- Don't try to solve the host's missing taste profile here. 14b decides how
  (or whether) an untasted participant contributes a query embedding; this
  step just needs to not crash on a short embeddings array.

## Outcome

Built and verified against the linked dev Supabase project (`sdqupxnxeplnnlfqxycg`):

- `npx supabase db push` applied the migration cleanly.
- Manual `score_group` calls with real movie embeddings confirmed: correct
  `group_score` math (0.6 * avg + 0.4 * min, checked by hand against returned
  `participant_scores`), `participant_scores` ordered to match input embedding
  order, and each hard filter (`max_runtime`, `min_age_ceiling`,
  `blocked_genres`) independently verified to exclude the right rows against
  the dev catalog.
- `npx supabase db advisors --linked --type security` reported no new
  findings - the 3 present (`handle_new_user`, leaked-password protection)
  all pre-date this migration.
- `npm test`: 258/258 passing (5 new for `scoreGroup`).
- `npm run build` and `npm run lint`: clean (one pre-existing, unrelated
  warning in `SiteHeader.tsx`).

Checkpoint commit `a03faa5` on `feature/score-group-rpc`.

Known follow-up for 14b: the host participant has no `friends` row and so no
stored `taste_embedding` - 14b must decide how (or whether) the host
contributes a scored query embedding.
