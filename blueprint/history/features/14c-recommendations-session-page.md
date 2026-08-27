# Feature: Recommendations on the session page

**From build-plan:** feature 14c (split from 14 - Group recommendations)
**Status:** complete

## Goal

Wire 14b's `getGroupRecommendations` into `/sessions/[id]`, replacing the
"Recommendations are coming in a later feature" placeholder with a real,
triggerable ranked shortlist: poster cards plus a neon group-score bar per
film, per project-overview.md's UI spec ("Match scores render as thin neon
bars, magenta -> lime by strength, never a bare percentage").

## Design reference

No mockup - reuses the existing `PosterCard`/poster-grid visual language and
the documented neon token palette (`--neon-magenta` -> `--neon-lime`) from
project-overview.md §7. No new visual system to invent.

## In scope

- **Route Handler, not a Server Action.** `coding-standards.md` is explicit:
  "recommendation endpoints that call OpenAI/OpenRouter" belong in a Route
  Handler. `getGroupRecommendations` calls OpenAI (via `getOrEmbedQuery`), so
  this is `GET /api/sessions/[id]/recommendations`, auth-scoped the same way
  the session detail page is (`getClaims()`, then the query itself scoped by
  `id` **and** `owner_id`).
- **Button-triggered, not auto-loaded.** Every request can burn one or more
  real OpenAI embedding calls; project-overview.md §6 names cost containment
  as a hard design constraint. A page view/refresh must not silently spend
  money - the host clicks "See recommendations" once they're happy with
  tonight's mood.
- `GroupScoreBar`: a thin neon bar, width and color both driven by
  `groupScore` (magenta at 0, lime at 1, linearly interpolated in RGB space),
  with an `aria-label` percentage for screen readers (the visual is never a
  bare number, but the accessible name still needs one).
- `PosterCard` gets a small additive `footer?: ReactNode` prop, rendered
  below the title/year, so the score bar can slot in without duplicating its
  poster/link/fallback markup for a second card component.
- `RecommendationsPanel` (client component): a button plus idle / loading /
  error / empty / success states, mirroring `NaturalLanguageSearchBar`'s
  existing fetch pattern. Success renders a poster grid (`PosterGrid`-style
  layout) of `GroupRankedMovie`s, each with a `GroupScoreBar` footer.
- Wired into `/sessions/[id]/page.tsx` in place of the current placeholder
  paragraph.

## Out of scope

- The consensus/adventurous slider and per-participant fit breakdown
  (feature 15) - only the room's overall `groupScore` is shown here, not
  `participantScores` per person.
- The pick rationale (feature 16), saving a chosen film (feature 17), and
  seen-list exclusion (feature 18).
- Calibrating the score-to-bar mapping against production-scale score
  distributions - see Notes. `subtitlesOk` remains unenforced (carried over
  from 14b, still not fixed here).
- Re-fetching automatically when mood/filters change after a first fetch -
  the host re-clicks the button; no live subscription or polling.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

## Build steps

- [x] **Step 1 - score-bar color math** - `src/lib/sessions/scoreBar.ts`:
  `clampScore(score: number): number` (clamps to `[0, 1]`) and
  `scoreBarColor(score: number): string` (linear RGB interpolation from
  `--neon-magenta` `#FF2E9A` to `--neon-lime` `#B6FF3A`, using the project's
  documented hex values directly rather than reading CSS variables in JS).
  *Done when:* unit tests cover `score=0` -> exact magenta rgb, `score=1` ->
  exact lime rgb, a midpoint value, and out-of-range inputs (`-1`, `2`)
  clamping before interpolating.
- [x] **Step 2 - `GroupScoreBar` + `PosterCard` footer slot** - add
  `footer?: React.ReactNode` to `PosterCard`'s props, rendered after the
  existing badge in its bottom `flex flex-col` block (no change to any
  existing caller's output, since the prop is optional). Add
  `src/components/sessions/GroupScoreBar.tsx`: a `h-1.5 w-full rounded-full
  bg-surface-2` track with an inner bar sized to `clampScore(score) * 100%`
  and colored via `scoreBarColor(score)`, `role="img"` and
  `aria-label={"Group fit: " + Math.round(clampScore(score) * 100) + "%"}`.
  *Done when:* `npm run build` passes; existing `PosterCard` call sites
  (browse grid, search results) render unchanged since `footer` is optional.
- [x] **Step 3 - `/api/sessions/[id]/recommendations` Route Handler** - `GET`
  handler: validates the `id` param (`z.string().uuid()`), reads
  `supabase.auth.getClaims()` the same way `/sessions/[id]/page.tsx` does,
  401s with no session, calls `getGroupRecommendations(client,
  process.env.OPENAI_API_KEY!, id, ownerId)`, 404s when it returns `null`,
  otherwise `Response.json` the `GroupRecommendations` result as-is (already
  camelCase, no mapping needed unlike `/api/search`'s `toSearchResultMovie`).
  Catches and 500s on thrown errors, logging server-side, same pattern as
  `/api/search/route.ts`. *Done when:* `route.test.ts` (mocking
  `@/lib/supabase/server` and `@/lib/sessions/recommendations`, mirroring
  `api/search/route.test.ts`'s structure) covers invalid id (400), no session
  (401), session not found/wrong owner (404), success (200 with the mocked
  body), and a thrown error (500) - plus a real `curl` against the running
  dev server confirming the route 401s with no auth cookie (can't fully
  browser-test the authenticated path without Playwright - see Notes).
- [x] **Step 4 - `RecommendationsPanel` + page wiring** - client component:
  a "See recommendations" button; on click, `fetch` the Step 3 route,
  `idle | loading | error | empty | success` states exactly mirroring
  `NaturalLanguageSearchBar`'s pattern (same button/error/empty copy style).
  Success renders a `grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4
  lg:grid-cols-6` of `PosterCard`s (movie mapped from `GroupRankedMovie`,
  which already carries every field `PosterCard` needs) with a
  `<GroupScoreBar score={movie.groupScore} />` footer. Replace the
  placeholder paragraph in `/sessions/[id]/page.tsx` with
  `<RecommendationsPanel sessionId={session.id} />`. *Done when:* `npm run
  build` and `npm run lint` pass; manual verification per Notes (no
  Playwright in this project - see `coding-standards.md`'s Browser
  Verification section).

## Files / areas

- `src/lib/sessions/scoreBar.ts` (new) + `scoreBar.test.ts`
- `src/components/catalog/PosterCard.tsx` - add optional `footer` prop
- `src/components/sessions/GroupScoreBar.tsx` (new)
- `src/app/api/sessions/[id]/recommendations/route.ts` (new) + `route.test.ts`
- `src/components/sessions/RecommendationsPanel.tsx` (new)
- `src/app/sessions/[id]/page.tsx` - replace the placeholder paragraph

## Data / contracts

`GET /api/sessions/[id]/recommendations` -> `GroupRecommendations` (from
14b, `src/lib/sessions/recommendations.ts`) as JSON, unchanged shape:

```ts
{ scoredParticipantIds: string[]; movies: GroupRankedMovie[] }
```

No new stored shape - this step is read-only rendering over 14a/14b's already
locked contracts. `PosterCard`'s new `footer` prop is additive and optional,
so it isn't a breaking contract change for existing callers.

## Testing

`npm test` (Vitest) is configured, so the test gate applies. In-scope logic:
`scoreBar.ts`'s color math (Step 1) and the route handler's auth/status-code
branching (Step 3) both ship with unit tests, the latter mirroring
`api/search/route.test.ts`'s existing mocking pattern. `PosterCard`'s footer
slot, `GroupScoreBar`, and `RecommendationsPanel` (Steps 2 and 4) are UI/
integration surfaces per `coding-standards.md`'s testing scope rule - not
unit-tested, verified by build, lint, and the manual/API evidence Step 3/4
describe.

## Notes for the AI

- **No Playwright in this project** (`coding-standards.md`'s Browser
  Verification section: don't add it silently mid-feature). Verification for
  the client-side flow relies on: build/lint passing, the route handler's own
  unit tests, a real `curl` confirming the route's auth guard works against
  the running dev server, and careful self-review of `RecommendationsPanel`
  against `NaturalLanguageSearchBar`'s already-shipped, working version of
  the exact same fetch/status pattern. Flag this honestly in the final packet
  rather than claiming a manual click-through that didn't happen.
- **Score-bar calibration is a known simplification.** Real cosine
  similarities between OpenAI `text-embedding-3-small` vectors for
  loosely-related text commonly sit well below 1.0 in practice (confirmed
  against live dev data during 14a/14b: observed `group_score` values around
  0.10-0.56) - a bar whose width is the raw score will often look sparse even
  for a comparatively strong match. Ship the raw, honest `[0, 1]` mapping
  now rather than invent an uncalibrated curve; revisit if/when feature 15's
  per-participant fit breakdown shows this needs recalibrating against real
  production-scale score distributions.
- Reuses `PosterGrid`'s exact grid classes inline in `RecommendationsPanel`
  rather than importing `PosterGrid` itself, because `PosterGrid` takes
  `BrowseMovie[]` with no way to attach a per-card footer -
  `NaturalLanguageSearchBar` already does the same thing (inlines the grid,
  passes `badge` to `PosterCard`) for the same reason.
- Server-only: `OPENAI_API_KEY` stays server-side inside the Route Handler,
  never passed to the client - the client only ever calls the route by URL.
- Cross-checked ownership: the route re-derives `ownerId` from
  `getClaims()` server-side; it never trusts a client-supplied id.

## Outcome

Built and verified:

- `npm test`: 287/287 passing (12 new this step: 7 for `scoreBar.ts`, 5 for
  the route handler).
- `npm run build` and `npm run lint`: clean (one pre-existing, unrelated
  warning in `SiteHeader.tsx`).
- Real dev-server checks: `curl` confirmed the new route 401s with no auth
  cookie and 400s on an invalid session id; confirmed `/sessions/[id]` still
  307-redirects (not a crash) for an anonymous visit with the new component
  wired in.
- **Gap:** no Playwright in this project, so no actual browser click-through
  of "See recommendations" happened. Verified instead via the route's unit
  tests, the curl checks above, and self-review against
  `NaturalLanguageSearchBar`'s already-shipped, working version of the same
  fetch/status pattern.

Checkpoint commit `3e74f57` on `feature/recommendations-session-page`.

This closes out all three sub-features of build-plan item 14 (Group
recommendations) - 14a, 14b, and 14c.

Known follow-ups: `subtitlesOk` still unenforced; score-bar calibration not
tuned against production-scale score distributions; a manual browser
click-through of the new "See recommendations" button is still owed.
