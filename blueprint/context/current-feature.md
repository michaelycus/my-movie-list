# Feature: Group pick rationale

**From build-plan:** feature 16
**Status:** in progress

## Goal

One short LLM-written paragraph naming each participant and explaining why
the current top-ranked film works for them (project-overview.md's "Group
pick rationale mechanics", step 6). Generated on demand for the current top
pick from 14/15's already-working shortlist - not automatic, and not yet
persisted (that's feature 17, "Save and revisit sessions"). A model outage
degrades to "no blurb," never to "no recommendations" - the existing
shortlist and its scores are untouched either way.

## Design reference

No mockup - one more panel in 14c/15's existing `RecommendationsPanel`,
reusing its neon-surface card language (`border-border bg-surface`, magenta
accent button matching the existing "See recommendations" trigger).

## In scope

- `src/lib/sessions/rationale.ts`:
  - `RationaleParticipant` (`Pick<SessionParticipant, "displayName" |
    "moodTags" | "moodNote">`) and a small `RationaleMovie` shape (title,
    overview, genre names, top cast names, director) built from the existing
    `MovieDetail` type - no new movie fields fetched.
  - `buildRationalePrompt(movie, participants)`: system + user chat messages
    instructing the model to write ONE short paragraph (3-5 sentences),
    plain prose (no markdown, no preamble), naming every participant and
    tying the film to their mood/taste when given.
  - `writeGroupRationale(movie, participants, apiKey): Promise<string |
    null>`: one OpenRouter chat completion (same small model as
    `search/parse.ts`'s `parseSearchQuery`, `meta-llama/llama-3.1-8b-instruct`),
    with its own `fetchWithRetry` mirroring `search/parse.ts`'s (that file
    already duplicates rather than shares ingest's version - same call here,
    third copy is consistent with the established precedent, not a new
    decision). Never throws: a network failure, empty content, or empty
    participant list all degrade to `null`, exactly like `parseSearchQuery`
    degrades to raw-text search on failure.
- `src/app/api/sessions/[id]/rationale/route.ts` (POST): validates the
  session id (uuid) and a `{ movieId: number }` body (zod), authenticates via
  `getClaims()` (same pattern as the recommendations route), loads the
  session + participants via the existing `getSessionDetail` and the movie
  via the existing `getMovieDetail` - both already-tested reads, no new
  Supabase queries written - 404s when either is missing, then calls
  `writeGroupRationale` and returns `{ rationale: string | null }`. Never a
  500 for an LLM failure; only for an unexpected thrown error.
- `src/components/sessions/GroupPickRationale.tsx` (new client component):
  takes `sessionId` and the current top-ranked `GroupRankedMovie`. A "Why
  this pick?" button posts to the new route and renders the returned
  paragraph, a small "Couldn't write a rationale right now." fallback when
  `rationale` is `null`, or an error state on request failure. Resets to
  idle whenever the passed-in movie's `id` changes (the slider can change
  the top pick), so a stale paragraph never lingers under a different title.
- `RecommendationsPanel` renders `<GroupPickRationale>` for
  `rankedMovies[0]` once `status === "success"`, between the
  `ConsensusSlider` and the poster grid.

## Out of scope

- Persisting the rationale or a chosen film anywhere (`sessions.rationale`,
  `sessions.chosen_movie_id`) - feature 17's job.
- A rationale per card, or auto-generating one on every slider tick - stays
  a single manual, user-triggered call for the current top pick, same
  cost-containment posture as the existing "See recommendations" button.
- Any change to ranking, scoring, or `score_group` - the LLM only writes
  prose here, per project-overview.md ("The LLM never decides ranking").

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - `rationale.ts` prompt + OpenRouter call** -
  `src/lib/sessions/rationale.ts` with `RationaleParticipant`,
  `buildRationalePrompt`, and `writeGroupRationale`, plus
  `rationale.test.ts` mirroring `search/parse.test.ts`'s mocked-`fetch`
  style. *Done when:* unit tests cover the prompt including every
  participant's name and mood, an empty-participants call returning `null`
  without a network call, a successful completion returning the trimmed
  paragraph, and a failed/empty-content response degrading to `null`;
  `npm test` passes.
- [x] **Step 2 - rationale route** -
  `src/app/api/sessions/[id]/rationale/route.ts` plus `route.test.ts`
  mirroring the recommendations route's mocked-dependency style (mocking
  `getSessionDetail`, `getMovieDetail`, `writeGroupRationale`). *Done when:*
  tests cover invalid id (400), missing auth (401), missing session or movie
  (404), and a happy path returning `{ rationale }`; `npm test` and
  `npm run build` pass.
- [ ] **Step 3 - `GroupPickRationale` + wiring** - new component plus its
  `RecommendationsPanel` wiring. *Done when:* `npm run build` and
  `npm run lint` pass; a real dev-server check confirms the route still
  401s with no auth cookie (same smoke check 14c/15 used); UI/integration
  surface per `coding-standards.md`, verified by build plus manual review,
  not a unit test.

## Files / areas

- `src/lib/sessions/rationale.ts` (new) + `rationale.test.ts`
- `src/app/api/sessions/[id]/rationale/route.ts` (new) + `route.test.ts`
- `src/components/sessions/GroupPickRationale.tsx` (new)
- `src/components/sessions/RecommendationsPanel.tsx` - render the new panel
  for `rankedMovies[0]`

## Data / contracts

No schema change. New wire shape: `POST /api/sessions/[id]/rationale` takes
`{ movieId: number }`, returns `{ rationale: string | null }`. Reuses
`SessionParticipant`, `MovieDetail`, and `GroupRankedMovie` - no changes to
any of those three.

## Testing

`npm test` (Vitest) is configured, so the test gate applies. In-scope logic:
`buildRationalePrompt` and `writeGroupRationale`'s degrade-to-null paths
(Step 1), and the route's status-code branches (Step 2), both ship with unit
tests mirroring the existing `search/parse.ts` and
`recommendations/route.ts` test styles. `GroupPickRationale` and the
`RecommendationsPanel` wiring (Step 3) are a UI/integration surface per
`coding-standards.md`'s testing scope rule - verified by build, lint, and
the manual/API evidence Step 3 describes.

## Notes for the AI

- Reuse `getSessionDetail` and `getMovieDetail` as-is for the route's two
  reads - both already exist, already tested, and already return exactly
  the fields the prompt needs (participant names/moods; movie title,
  overview, genres, cast, director). No new Supabase query code in this
  feature.
- `writeGroupRationale` must never throw - mirror `parseSearchQuery`'s
  try/catch-and-degrade shape exactly, including the `console.error` before
  returning the fallback (`null` here, raw text there).
- No Playwright in this project (carried over from 14c/15) - clicking "Why
  this pick?" in a real browser isn't verified in this environment; say so
  plainly in the final packet.

## Outcome

_Filled in by /complete._
