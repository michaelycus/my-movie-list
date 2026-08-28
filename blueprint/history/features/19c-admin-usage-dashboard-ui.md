# Current Feature

**Type:** Feature
**Build-plan item:** 19c. Admin usage dashboard UI (split from 19 - Admin usage dashboard)
**Branch:** feature/admin-usage-dashboard-ui

## Spec

19a built the table and access guard, 19b started writing real rows. This
step is the payoff: replace `/admin`'s placeholder with the actual dashboard
- signups over time, sessions created, most-chosen films, search volume
(anonymous vs authenticated), embedding/LLM call counts, and an estimated
API spend figure.

### Scope

- Pure aggregation/estimation functions in `src/lib/admin/stats.ts`, each
  independently unit-tested:
  - `groupSignupsByDay` - buckets `signup` events into the last 14 UTC days,
    zero-filled (a quiet day must show as a 0 bar, not a gap).
  - `countEventsByType` - count of events matching a given `event_type`.
  - `splitSearchVolume` - `search` events split by `user_id === null`
    (anonymous) vs not (authenticated).
  - `rankMostChosenMovieIds` - counts `film_chosen` events by their
    `meta.movieId`, returns the top N by count.
  - `estimateApiSpendUsd` - `embeddingCallCount`/`llmCallCount` -> a rough
    dollar figure from documented per-call cost assumptions (below).
- `getUsageStats(client): Promise<UsageStats>` in the same file - fetches
  every `usage_events` row (admin-only RLS from 19a already scopes this to
  "all rows, since I'm the admin"; no per-owner filter needed or possible)
  plus the top chosen films' title/poster from the public-read `movies`
  table, and composes the pure functions above into one `UsageStats` object.
- `/admin/page.tsx` renders the real dashboard: stat tiles (signups,
  sessions created, total searches, estimated spend), a 14-bar signups
  strip, an anonymous-vs-authenticated search split, and a most-chosen-films
  list with poster thumbnails. The existing admin-role guard (`notFound()`
  for non-admins) is unchanged.

### Out of scope

- Any change to `sessions` table RLS. "Most-chosen films" and "sessions
  created" both read from `usage_events` (`film_chosen`, `session_created`)
  instead of querying `sessions` directly - `sessions`' RLS is
  intentionally owner-only (feature 12), and querying it here would either
  need a new admin-wide policy (a real RLS change, out of scope for a
  read-only reporting page) or silently show only the admin's own sessions
  (wrong). `usage_events` already has everything both stats need.
- Pagination, date-range filtering, or any handling for very large event
  volumes - this project's scale (a portfolio app, not production traffic)
  makes "fetch every `usage_events` row" fine. Revisit if that stops being
  true.
- A nav link to `/admin`. Reconsidered mid-build: `SiteHeader` renders in
  the root layout on every single page, signed-in or not - a role check
  there to decide whether to show the link would mean a new Supabase query
  on every authenticated page view site-wide, just to conditionally render
  one link almost nobody needs (only the admin uses it, and rarely). That
  cost doesn't match project-overview.md's stated cost-containment
  posture, and `getClaims()`'s existing local-JWT check (no DB round trip)
  is exactly why every other page avoids this pattern. `/admin` stays
  reachable by direct URL, same as 19a shipped it - a real fix (a custom
  Supabase Auth Hook putting `role` in the JWT claims, so this becomes free)
  is a bigger, separate change, not a one-line addition to this step.
- Failed job counts - present in `project-plan.md`'s longer description but
  not in `project-overview.md`'s feature-19 one-liner or the build-plan
  entry, and there's no job/queue system in this app to have failures to
  count. Dropped as out of scope, consistent with 19a/19b treating
  `project-overview.md` as the source of truth over the older plan doc.

### Data / contracts

- `src/types/admin.ts`:
  ```ts
  export interface UsageStats {
    signupsByDay: { date: string; count: number }[]; // 14 entries, oldest first, zero-filled
    sessionsCreatedCount: number;
    mostChosenFilms: { movieId: number; title: string; posterPath: string | null; count: number }[]; // up to 5
    searchVolume: { anonymous: number; authenticated: number };
    embeddingCallCount: number;
    llmCallCount: number;
    estimatedSpendUsd: number;
  }
  ```
- Spend estimate constants (documented in `stats.ts`, sourced from a live
  pricing check during this step, both matching the models this codebase
  actually calls):
  - Embedding: OpenAI `text-embedding-3-small`, $0.02/1M tokens
    ([openrouter.ai/openai/text-embedding-3-small](https://openrouter.ai/openai/text-embedding-3-small)
    corroborates the same list price project-overview.md already cites).
    Assumed ~100 tokens/call (query/mood/taste texts are all short) - a
    documented estimate, not measured usage.
  - LLM: OpenRouter `meta-llama/llama-3.1-8b-instruct` (the model both
    `llm_call` sites use), $0.02/1M input + $0.04/1M output tokens
    ([openrouter.ai/meta-llama/llama-3.1-8b-instruct/pricing](https://openrouter.ai/meta-llama/llama-3.1-8b-instruct/pricing)).
    Assumed ~500 input + ~150 output tokens/call (search-parse and
    rationale prompt sizes) - also a documented estimate.

### Build steps

1. [x] **Pure aggregation/estimation functions + tests** - `src/lib/admin/stats.ts`'s
   five functions above, `src/lib/admin/stats.test.ts`.
   Done when: each function has passing tests covering its real edge cases
   (zero-fill for a day with no signups, an unparseable/missing `meta.movieId`
   skipped rather than crashing, anonymous vs authenticated split, the spend
   formula's arithmetic).

2. [x] **`getUsageStats` data orchestrator** - same file, wires the pure
   functions to real Supabase reads.
   Done when: run against the linked Supabase project with a handful of
   seeded `usage_events` rows (signups on different days, both search
   flavors, repeated `film_chosen` for the same movie), the returned
   `UsageStats` matches hand-computed expectations exactly; test rows
   cleaned up after.

3. [x] **Dashboard UI** - `src/types/admin.ts`, `/admin/page.tsx` rewritten
   to render `UsageStats`.
   Done when: `npm run build` is clean and the route renders (verified via
   dev server + a seeded admin session where scriptable).
   Live-verified against a fresh dev server: unauthenticated `GET /admin`
   still `307`s to `/auth/login?next=%2Fadmin`, unchanged. The actual
   signed-in-admin render wasn't clicked through (same disclosed limitation
   as every prior sub-feature's admin-only path) - confidence comes from
   `getUsageStats`' exact-match live verification in step 2 plus a careful
   read of the JSX against that proven shape.

### Testing plan

`AGENTS.md` declares `npm test` (Vitest) as the test gate. In-scope logic is
all five step-1 functions - real branching, real edge cases (empty input,
zero-fill, malformed `meta`), exactly what coding-standards.md's testing
scope rule calls out. `getUsageStats` and the page component are thin
wrappers/UI, exercised via live verification (step 2) and build/lint plus a
dev-server check (step 3), matching every prior sub-feature's precedent.

### UI/UX notes

Matches `/admin`'s existing placeholder conventions: `border-border
bg-surface` cards, neon-cyan for the signups strip (a volume metric, not a
match score), neon-lime/amber reserved for match-score bars elsewhere and
not introduced here. Stat numbers are plain `--fg` text with a
`text-muted-foreground` label underneath, mirroring `PosterCard`'s rating
badge restraint rather than inventing a new tile style. No new tokens, no
charting library - the signups strip is plain proportional-height divs, the
same hand-rolled-bar approach `scoreBar.ts` already established for match
scores.

## Outcome

Built and verified against the linked Supabase project
(`sdqupxnxeplnnlfqxycg`), not just locally:

- Seeded a realistic mix of `usage_events` rows (2 signups on different
  days, mixed anonymous/authenticated searches, repeated `film_chosen` for
  one movie, embedding/LLM calls) and ran `getUsageStats` against them -
  every returned value matched hand-computed expectations exactly,
  including the top film's title/poster resolving correctly through the
  `movies` join. Test rows cleaned up after.
- Confirmed live pricing for both models this codebase actually calls
  (OpenAI `text-embedding-3-small`, OpenRouter
  `meta-llama/llama-3.1-8b-instruct`) rather than relying on possibly-stale
  training data, and documented the sources directly in `stats.ts`.
- Unauthenticated `GET /admin` against a fresh dev server still `307`s to
  `/auth/login?next=%2Fadmin`, unchanged from 19a.
- `npx tsc --noEmit`, `npm test` (332/332, 16 new), `npm run lint` (clean,
  one pre-existing unrelated warning), `npm run build` all clean.
- Not directly exercised live: the actual signed-in-admin render of
  `/admin` (not scriptable outside a real OAuth browser session, same
  disclosed limitation as 19a's and 19b's admin-only paths). Confidence
  comes from `getUsageStats`' exact-match live verification plus a careful
  read of the JSX against that proven data shape.
- Reconsidered and dropped one originally-scoped item mid-build: a nav link
  to `/admin` in `SiteHeader` would add a Supabase query to every
  authenticated page view site-wide just to conditionally show one rarely-
  used link - out of proportion to the benefit and against the project's
  stated cost-containment posture. `/admin` stays reachable by direct URL.

Checkpoint commits on `feature/admin-usage-dashboard-ui`: `1ba3fa4`
(aggregation functions + tests), `8804470` (getUsageStats live
verification), `ad32303` (dashboard UI).

This closes out build-plan feature 19 (admin usage dashboard) - all three
sub-features (19a, 19b, 19c) are now complete.

### Notes for the AI

- When a stat is small enough to render honestly with plain divs (a signups
  strip, a two-segment search-volume bar), matching the project's existing
  hand-rolled `scoreBar.ts` approach avoids pulling in a charting library
  for one dashboard. Worth checking `package.json` for an existing chart
  dependency before assuming one is needed.
- A per-request query added to a root-layout component (like `SiteHeader`)
  runs on literally every page view, not just the pages that need it - worth
  a deliberate cost check before adding one, even for something as small as
  a role-gated nav link. This project's `getClaims()` pattern (local JWT
  decode, no DB round trip) exists specifically to avoid that per-page
  Supabase cost.
