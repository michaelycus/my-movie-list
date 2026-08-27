# Feature: Group recommendation assembly

**From build-plan:** feature 14b (split from 14 - Group recommendations)
**Status:** complete

## Goal

Turn a real session into the inputs 14a's `score_group` RPC needs: one query
embedding per scored participant, plus the room's combined hard filters. Then
call it and return a typed ranked shortlist. This is the "gather real data"
layer between 14a (proven ranking math) and 14c (rendering).

## Design reference

None - no UI in this sub-feature.

## In scope

- **Host/untasted-participant rule (confirmed with the user this run):** any
  participant with no stored `taste_embedding` - the host (no `friends` row at
  all) or a friend who hasn't finished the questionnaire/embedding yet -
  contributes a query embedding built from tonight's mood alone (mood tags +
  mood note, embedded directly) when they gave one. If they gave neither, they
  are seated and visible but excluded from scoring entirely; `group_score` is
  computed only over the participants who did contribute.
- `buildMoodQueryText(moodTags, moodNote)`: pure function turning tonight's
  mood into embeddable text, or `null` when there's nothing to embed.
- A participant **with** a `taste_embedding`: if they also gave a mood,
  blend the mood embedding into their taste embedding (reusing
  `blendTasteEmbedding` from `src/lib/friends/taste.ts` - see Notes for why);
  otherwise use their `taste_embedding` unchanged.
- `combineHardFilters`: pure function unioning every seated participant's hard
  filters (not just scored ones - a runtime cap should apply room-wide even
  for someone contributing no personal score) into the room's `maxRuntime`
  (strictest non-null), `minAgeCeiling` (strictest of every friend's
  `hard_filters.minAgeCeiling` and the session's `youngest_viewer_age`), and
  `blockedGenres` (union). Each participant's own `constraints.maxRuntime`
  (tonight's override, feature 13) wins over their stored
  `hard_filters.maxRuntime` when set.
- `resolveParticipantEmbeddings`: assembles the scored participants' query
  embeddings per the rule above, using `getOrEmbedQuery` (reused from
  `src/lib/search/retrieve.ts`, so a mood text shared across friends/sessions
  hits the same `query_cache` row) for any embedding calls. Returns the
  embeddings **and** the `session_participants.id` each one belongs to, in the
  same order - load-bearing for 14c/15, which need to map `participant_scores`
  back to a name and avatar.
- `getGroupRecommendations(client, apiKey, sessionId, ownerId)`: the
  orchestrator - fetches the session (owner-scoped, same explicit check as
  `getSessionDetail`), its participants, and their friends' `taste_embedding` +
  `hard_filters`; builds the per-participant inputs; calls the two functions
  above; calls `scoreGroup`; returns `{ scoredParticipantIds, movies }`.

## Out of scope

- `subtitlesOk` is **not** enforced. 14a's `score_group` contract (already
  merged) has no language/subtitle parameter - extending it is a real schema
  change and a second review checkpoint, not something to fold in here
  silently. Flagged as a known gap for a follow-up `/fix` or a 14d, not fixed
  in this step.
- Rendering, triggering (button vs. auto-load), and the group-score bar (14c).
- The consensus/adventurous slider (feature 15) - `getGroupRecommendations`
  doesn't take a `consensusWeight` param yet; 14c can add one when it wires
  the UI, or 15 can when it builds the slider.
- The pick rationale (feature 16) and seen-list exclusion (feature 18 - table
  doesn't exist).
- Extending the host to have their own stored taste profile - that's a
  materially bigger feature (host questionnaire access, new `profiles`
  columns), not this step's job.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - `buildMoodQueryText`** - in
  `src/lib/sessions/recommendations.ts`: turns `moodTags: string[]` +
  `moodNote: string | null` into one embeddable string (e.g. "Tonight's mood:
  fun, feel-good. <note>"), or `null` when both are empty, mirroring
  `taste.ts`'s skip-empty-clause pattern. *Done when:* unit tests cover both
  tags and note present, only one present, and neither present (`null`).
- [x] **Step 2 - `combineHardFilters`** - pure function combining an array of
  `{ maxRuntimeOverride: number | null; hardFilters: HardFilters }` (the
  `HardFilters` type from `src/types/questionnaire.ts`, reused not
  redefined) plus `youngestViewerAge: number | null` into `{ maxRuntime,
  minAgeCeiling, blockedGenres }`. Also add `parseHardFilters(raw: unknown):
  HardFilters` (defensive parse of the `friends.hard_filters` jsonb column,
  same pattern as `mood.ts`'s `toSessionConstraints` - a friend who never
  finished the questionnaire has `hard_filters: {}`, which parses to a fully
  permissive `HardFilters`, contributing no restriction). *Done when:* unit
  tests cover strictest-wins for `maxRuntime` and `minAgeCeiling` (including
  the per-participant override beating their stored value, and
  `youngestViewerAge` participating in the `minAgeCeiling` strictest-of),
  `blockedGenres` union/dedup, all-null inputs producing `{ maxRuntime: null,
  minAgeCeiling: null, blockedGenres: [] }`, and `parseHardFilters({})`
  returning the permissive default.
- [x] **Step 3 - `resolveParticipantEmbeddings`** - async function
  implementing the host/untasted-participant rule: for each input with a
  `tasteEmbedding`, blend in a mood embedding via `blendTasteEmbedding` when
  `buildMoodQueryText` returns non-null, else use the taste embedding as-is;
  for each input with no `tasteEmbedding`, embed the mood text alone via
  `getOrEmbedQuery` when present, else exclude entirely. Returns
  `{ scoredParticipantIds: string[], embeddings: number[][] }`, both ordered
  the same way, excluded participants simply absent from both. *Done when:*
  vitest tests (mocking `getOrEmbedQuery` the way `retrieve.test.ts` mocks
  `fetchEmbeddings`/cache) cover all four branches - taste+mood blended,
  taste-only unchanged, mood-only embedded standalone, neither excluded - plus
  that ids and embeddings stay aligned when a middle participant is excluded.
- [x] **Step 4 - `getGroupRecommendations` orchestrator** - fetches the
  session row (`id, youngest_viewer_age`, scoped by `id` **and**
  `owner_id`, `.maybeSingle()`, returning nothing found the same way
  `getSessionDetail` does), its `session_participants` rows, and (for rows
  with a `friend_id`) the corresponding `friends.taste_embedding` +
  `hard_filters` in one `.in()` query; parses each embedding with
  `parseEmbeddingVector` (reused from `taste.ts`); builds one
  `ParticipantScoringInput` per participant (host rows get `tasteEmbedding:
  null` and the permissive default `HardFilters`); calls
  `combineHardFilters` and `resolveParticipantEmbeddings`; calls `scoreGroup`
  with the assembled params; returns `{ scoredParticipantIds, movies }`.
  Following the `getSessionDetail`/integration-code precedent, this
  orchestrator itself is not unit-tested (it is glue over already-tested
  pieces plus three Supabase queries); it's verified by `npm run build`
  typechecking clean and a manual run against the linked dev project with a
  real (throwaway) session. *Done when:* `npm run build` passes, and a manual
  script/query run against a real session in the dev DB returns a
  `GroupRecommendations` shape whose `movies` are ordered by `group_score`
  descending and whose `scoredParticipantIds` length matches
  `movies[0].participantScores.length`.

## Files / areas

- `src/lib/sessions/recommendations.ts` (new)
- `src/lib/sessions/recommendations.test.ts` (new)

## Data / contracts

```ts
export interface ParticipantScoringInput {
  participantId: string;       // session_participants.id
  moodTags: string[];
  moodNote: string | null;
  maxRuntimeOverride: number | null;
  tasteEmbedding: number[] | null;
  hardFilters: HardFilters;    // never null - parseHardFilters always returns a permissive default
}

export interface GroupRecommendations {
  scoredParticipantIds: string[];  // session_participants.id, ordered to match each movie's participantScores
  movies: GroupRankedMovie[];      // from src/types/recommendation.ts (14a)
}

// getGroupRecommendations returns GroupRecommendations | null - null when
// the session id doesn't exist or doesn't belong to ownerId, mirroring
// getSessionDetail's not-found handling.
```

`GroupRecommendations.scoredParticipantIds` is **load-bearing for 14c and
15**: it's the only way to map `GroupRankedMovie.participantScores[i]` back to
a participant's name/avatar for the fit breakdown, since excluded participants
(no taste, no mood) don't appear in either array.

## Testing

`npm test` (Vitest) is configured, so the test gate applies. In-scope logic:
`buildMoodQueryText`, `combineHardFilters`/`parseHardFilters`, and
`resolveParticipantEmbeddings` (Steps 1-3) all ship with unit tests.
`getGroupRecommendations` (Step 4) is integration-level glue over already-unit-
tested pieces plus three Supabase queries - not unit-tested, per the same
precedent as `src/lib/sessions/detail.ts`; verified by build + a manual run
against real dev data instead.

## Notes for the AI

- Reusing `blendTasteEmbedding(taste, [{ embedding: moodEmbedding, liked:
  true }])` for the mood blend rather than writing a second blend function:
  with one pick, its existing `BASE_WEIGHT`/`CALIBRATION_WEIGHT` (0.7/0.3) math
  reduces to exactly "blend 70/30 toward the mood vector, then L2-normalize" -
  the same "blended with tonight's mood vector" behavior project-overview.md
  §5.2 describes, with no new weighting constant to invent.
- Reusing `getOrEmbedQuery` from `src/lib/search/retrieve.ts` for mood-text
  embedding calls (not a second embedding path) - it's already
  cache-by-query-hash via `query_cache`, so identical mood text across
  friends/sessions is free after the first call.
- `hardFilters` on `ParticipantScoringInput` is always a concrete
  `HardFilters`, never `null` - `parseHardFilters` collapses "friend never
  answered" into the permissive default, so `combineHardFilters` has one
  fewer null case to handle.
- Server-only: this whole module is called from server code (Server
  Component/Action), same as every other Supabase- and OpenAI-touching module
  in this project.
- Cross-checked ownership: `getGroupRecommendations` scopes the session query
  by both `id` and `owner_id` explicitly, not RLS alone, matching
  `getSessionDetail`'s existing pattern.

## Outcome

Built and verified:

- `npm test`: 275/275 passing (17 new for `recommendations.ts`).
- `npm run build` and `npm run lint`: clean (one pre-existing, unrelated
  warning in `SiteHeader.tsx`).
- Real end-to-end run against the linked dev project (`sdqupxnxeplnnlfqxycg`):
  created a throwaway session with a host (mood tags + note, no taste
  profile) and the one real dev friend (hard filters set, but no
  `taste_embedding` and no mood given for this run), called
  `getGroupRecommendations` directly, confirmed the untasted friend was
  correctly excluded from `scoredParticipantIds` while their `hard_filters`
  (blocked genre, runtime cap) still constrained the candidate set alongside
  the room's `youngest_viewer_age`, and that `group_score` matched the single
  scored participant's own similarity exactly (as expected for n=1). Deleted
  the throwaway session and script afterward.

Checkpoint commit `6f4332f` on `feature/group-recommendation-assembly`.

Known follow-ups: `subtitlesOk` is not enforced anywhere in scoring (flagged,
not fixed - would require extending 14a's already-merged RPC contract); 14c
needs to decide how/when `getGroupRecommendations` gets triggered from a page
(auto-load vs. a button), given it makes real OpenAI calls.
