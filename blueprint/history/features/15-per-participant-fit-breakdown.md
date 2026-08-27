# Feature: Per-participant fit breakdown

**From build-plan:** feature 15
**Status:** complete

## Goal

Show how well each shortlisted film suits each person, and add a live
consensus-versus-adventurous control that re-ranks the shortlist as it moves
(project-overview.md §5.2's 60/40 split, exposed as a slider). Builds
entirely on 14's already-locked contracts (`GroupRankedMovie.participantScores`,
`GroupRecommendations.scoredParticipantIds`) - no schema or RPC change.

## Design reference

No mockup - extends 14c's existing poster-grid + neon-bar visual language.

## In scope

- `computeGroupScore(participantScores: number[], consensusWeight: number):
  number`: pure function reproducing 14a's SQL formula exactly
  (`consensusWeight * avg + (1 - consensusWeight) * min`), in a
  dependency-free module (`src/lib/sessions/groupScore.ts`) so it's safely
  importable from the client component doing the live re-rank - not from
  `recommendations.ts`, which pulls in server-only Supabase/OpenAI code.
- **Live re-rank is entirely client-side**, over the shortlist already
  fetched from 14c's route. Moving the slider recomputes every visible
  movie's score from its already-returned `participantScores` and re-sorts -
  no new network or OpenAI call per tick. This is what "live" has to mean
  given project-overview.md §6's cost-containment constraint; a debounced
  re-fetch per drag tick would multiply embedding-call cost for no product
  benefit, since 14c already returns every scored participant's own
  similarity.
- `ConsensusSlider`: `<input type="range">`, 0-1 step 0.05, default 0.6
  (matching 14a's RPC default, so the initial render's order doesn't jump),
  labeled "Consensus <-> Adventurous" (project-overview.md's own naming).
- `ParticipantFitList`: per movie, zips `scoredParticipantIds` (order-aligned
  with `participantScores`, per 14b's locked contract) against the session's
  participant list (passed down from the page, not re-fetched) to render one
  small avatar-emoji + thin fit bar per scored participant, reusing
  `scoreBarColor`/`clampScore` from 14c at a smaller size. A participant id
  with no match in the passed-in list (shouldn't happen, but mirrors
  `detail.ts`'s "Removed friend" defensive fallback) renders as "🎬 Someone".
- `RecommendationsPanel` gains a `participants: SessionParticipant[]` prop
  (the page already loads `session.participants` for the mood form - reused,
  not re-fetched) and recomputes + re-sorts its movie list from
  `consensusWeight` state via `computeGroupScore`, feeding the current
  (not the original fetch-time) score to both `GroupScoreBar` and
  `ParticipantFitList`.

## Out of scope

- The pick rationale (feature 16) and saving a chosen film (feature 17).
- Re-fetching a new candidate set when the slider moves - it only re-ranks
  what 14c already fetched. Moving the slider before ever fetching does
  nothing (no data yet); the slider only appears once a shortlist exists.
- `subtitlesOk` enforcement and score-bar calibration - both still-open gaps
  carried over from 14b/14c, not addressed here.
- Persisting the chosen `consensusWeight` anywhere - it's session-local UI
  state, reset on refresh, same as the rest of `RecommendationsPanel`'s state.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - `computeGroupScore`** - `src/lib/sessions/groupScore.ts`,
  no imports beyond nothing (pure math): mirrors 14a's SQL
  `consensus_weight * avg(sim) + (1 - consensus_weight) * min(sim)` exactly.
  *Done when:* unit tests reproduce the known-good value from 14a's real
  live `score_group` verification this session (`participantScores: [1,
  0.371602]`, `consensusWeight: 0.6` -> `0.560122`, the actual "Forrest
  Gump" row returned against the dev catalog during 14a), plus single-
  participant (`avg === min === score`), all-zero, and `consensusWeight` at
  the 0/1 extremes (pure average vs. pure least-misery).
- [x] **Step 2 - `ParticipantFitList`** - new component
  `src/components/sessions/ParticipantFitList.tsx`: given `scoredParticipantIds:
  string[]`, `scores: number[]`, and `participants: SessionParticipant[]`,
  zips ids to scores, looks each id up in `participants`, renders a compact
  `flex flex-col gap-0.5` list of `avatarEmoji (or 🎬) + displayName (or
  "Someone") + a small scoreBarColor-colored bar` per scored participant.
  *Done when:* `npm run build` passes; visually composes as `PosterCard`'s
  `footer` alongside `GroupScoreBar` without layout breakage (verified per
  Notes - no Playwright in this project).
- [x] **Step 3 - `ConsensusSlider` + live re-rank wiring** - new
  `src/components/sessions/ConsensusSlider.tsx` (range input, 0-1 step 0.05,
  default 0.6, `aria-label="Consensus versus adventurous"`). In
  `RecommendationsPanel`: add `consensusWeight` state (default 0.6) and a
  `participants` prop; on every successful fetch and on every slider change,
  derive the rendered movie order via `movies.map(m => ({ ...m, groupScore:
  computeGroupScore(m.participantScores, consensusWeight) })).sort((a, b) =>
  b.groupScore - a.groupScore)` and pass each recomputed score to both
  `GroupScoreBar` and `ParticipantFitList`. Only rendered once `status ===
  "success"`. Pass `session.participants` from `/sessions/[id]/page.tsx`
  into `<RecommendationsPanel>`. *Done when:* `npm run build`/`npm run lint`
  pass; a real dev-server + `curl` pass confirms the page still renders
  (redirects for an anonymous visit, same as before) with the new prop
  wired through; manual slider interaction is the one thing not verified in
  this environment - see Notes.

## Files / areas

- `src/lib/sessions/groupScore.ts` (new) + `groupScore.test.ts`
- `src/components/sessions/ParticipantFitList.tsx` (new)
- `src/components/sessions/ConsensusSlider.tsx` (new)
- `src/components/sessions/RecommendationsPanel.tsx` - `participants` prop,
  `consensusWeight` state, recompute/re-sort on render
- `src/app/sessions/[id]/page.tsx` - pass `session.participants` through

## Data / contracts

No new stored or wire shape - this feature is pure client-side rendering and
re-ranking over 14's already-locked `GroupRankedMovie`/`GroupRecommendations`
contracts. `computeGroupScore`'s signature (`(participantScores: number[],
consensusWeight: number) => number`) is the only new export, and it's
intentionally a pure mirror of 14a's SQL formula, not a new one.

## Testing

`npm test` (Vitest) is configured, so the test gate applies. In-scope logic:
`computeGroupScore` (Step 1) ships with unit tests, including a reproduction
of a real recorded RPC output as a regression check that the client math
never drifts from the SQL it mirrors. `ParticipantFitList`, `ConsensusSlider`,
and the `RecommendationsPanel` re-rank wiring (Steps 2-3) are UI/integration
surfaces per `coding-standards.md`'s testing scope rule - not unit-tested,
verified by build, lint, and the manual/API evidence the steps describe.

## Notes for the AI

- **No Playwright in this project** (carried over from 14c). The one thing
  this feature can't verify in this environment is actually dragging the
  slider and watching the grid re-sort in a real browser - flag that
  honestly in the final packet rather than claiming it happened.
- `computeGroupScore` deliberately duplicates 14a's SQL formula rather than
  refactoring the RPC to expose it differently - see 14a/14b/14c's already-
  merged contracts; changing those now would ripple across three completed
  sub-features for no product benefit.
- `ParticipantFitList`'s "Someone" fallback mirrors `getSessionDetail`'s
  existing "Removed friend" fallback pattern in `src/lib/sessions/detail.ts`
  - same defensive shape, new call site.
- Server-only concerns don't change here: no new Supabase/OpenAI calls, no
  new Route Handler. `groupScore.ts` having zero imports is what makes it
  safe in a `"use client"` bundle.

## Outcome

Built and verified:

- `npm test`: 292/292 passing (5 new for `computeGroupScore`, including a
  regression check against a real recorded `score_group` output from 14a's
  own live verification).
- `npm run build` and `npm run lint`: clean (one pre-existing, unrelated
  warning in `SiteHeader.tsx`).
- Real dev-server checks: `/sessions/[id]` still 307-redirects for an
  anonymous visit and `/api/sessions/[id]/recommendations` still 401s with
  no auth cookie, confirming the new `participants` prop wiring didn't break
  either existing path.

Checkpoint commit `b5893a1` on `feature/per-participant-fit-breakdown`.

Known follow-ups, unchanged from 14b/14c: `subtitlesOk` still unenforced;
score-bar calibration not tuned against production-scale score
distributions; no browser click-through of either 14c's or this feature's UI
has happened yet in this project (no Playwright installed) - worth a manual
`/try` pass covering both.
