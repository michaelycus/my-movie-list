# Current Feature

**Type:** Feature
**Build-plan item:** 19b. Usage-event instrumentation (split from 19 - Admin usage dashboard)
**Branch:** feature/usage-event-instrumentation

## Spec

19a built the `usage_events` table and admin access; nothing writes to it yet.
This step wires up the real touchpoints project-overview.md names: signup,
session created, film chosen, search performed, and embedding/LLM calls - so
19c's dashboard has real data to aggregate.

### Scope

- Shared `logUsageEvent(client, eventType, userId, meta?)` helper - a plain
  fire-and-forget `.insert()` (no `.select()` - see 19a's migration comment
  on why), best-effort (logged, not thrown), so a logging failure can never
  break the real action it's attached to.
- `signup` - via the existing `handle_new_user` trigger (profiles migration),
  not app code: it already fires exactly once per new account, atomically
  with the profile row, with no chance of an app-layer miss.
- `session_created` and `film_chosen` - `createSession` and
  `chooseSessionFilm` in `src/actions/sessions.ts`.
- `search` - `/api/search`'s route handler, `user_id` reflecting
  signed-in/anonymous (covers "search volume, anonymous vs authenticated").
- `embedding_call` - every real (non-cached) OpenAI embedding call: search
  and mood-blend queries (`getOrEmbedQuery`, `src/lib/search/retrieve.ts`)
  and friend taste profiles (`refreshTasteEmbedding`, `src/actions/friends.ts`,
  right after `computeTasteEmbedding` - taste embeddings have no cache
  layer, so every call there is already "real").
- `llm_call` - the two OpenRouter chat completions: search query parsing
  (`/api/search`'s route) and the group pick rationale
  (`/api/sessions/[id]/rationale`'s route).

### Out of scope

- 19c's aggregation queries and the dashboard UI itself.
- Precisely distinguishing a genuinely successful LLM call from one that
  internally failed and degraded (`parseSearchQuery`/`writeGroupRationale`
  already swallow their own errors and return a fallback/`null`, with no
  signal back to the caller either way). `llm_call` is logged unconditionally
  right after the call resolves - an "attempted" count, not a "billed"
  count. Precise billing would mean threading a Supabase client into two
  otherwise-pure prompt/HTTP modules for one log line each; not worth it for
  an *estimated* spend figure. `embedding_call` doesn't have this problem -
  `getOrEmbedQuery` and `computeTasteEmbedding` already know exactly when a
  real API call happened (vs. a cache hit), so those stay accurate.
- Any per-event `meta` beyond small, non-sensitive counters (result counts,
  participant counts, a movie id). Never raw free-text search queries or
  questionnaire answers - `usage_events` is analytics, not a request log.
- Instrumenting the offline ingest script (`npm run ingest`/`npm run embed`)
  - those are one-off local runs, not live "usage" in project-overview.md's
  sense, and they run via the admin client outside any request context.

### Data / contracts

- `logUsageEvent(client: SupabaseClient, eventType: string, userId: string |
  null, meta?: Record<string, unknown>): Promise<void>` in
  `src/lib/usage/events.ts`.
- Event types and their `meta`:
  - `signup` - `{}`, `user_id` = the new profile's id. Logged inside
    `handle_new_user` (migration `CREATE OR REPLACE FUNCTION`, same function
    name/signature so it's a true replace, not an overload).
  - `session_created` - `{ participantCount }`, `user_id` = host's
    `ownerId`.
  - `film_chosen` - `{ movieId }`, `user_id` = host's `ownerId`.
  - `search` - `{ resultCount }`, `user_id` = signed-in user's id or `null`
    for an anonymous searcher (`/api/search` gains a `getClaims()` call it
    doesn't currently make, matching every other route's pattern).
  - `embedding_call` - `user_id` = `null` on the search/mood path
    (`getOrEmbedQuery` has no owner concept - it serves both anonymous
    search and authenticated mood-blend embeddings, so attaching a real id
    there would misattribute the anonymous case); `user_id` = the friend's
    `ownerId` and `meta: { context: "taste" }` on the taste path, where the
    real id is already in scope at the call site and free to include.
  - `llm_call` - `{ context: "search_parse" | "rationale" }`, `user_id` =
    signed-in user's id for `rationale` (already required there), or the
    same value as the `search` event's `user_id` for `search_parse`.

### Build steps

1. [x] **`logUsageEvent` helper** - `src/lib/usage/events.ts` per the
   contract above.
   Done when: called against the live `usage_events` table, a successful
   insert leaves one row with the right `event_type`/`user_id`/`meta`, and a
   forced failure (bad client) is caught and logged, never thrown.

2. [x] **`signup` event** - migration updating `handle_new_user` to also
   insert into `usage_events`.
   Done when: migration applies cleanly; a fresh `auth.users` insert (or the
   existing signup flow) produces both a `profiles` row and a matching
   `signup` `usage_events` row in the same transaction.

3. [x] **`session_created` and `film_chosen` events** - `src/actions/sessions.ts`.
   Done when: creating a session logs one `session_created` row with the
   right `participantCount`; saving a pick logs one `film_chosen` row with
   the right `movieId`; a forced `usage_events` failure doesn't stop either
   action from succeeding.

4. [x] **`search` and `embedding_call` events (search path)** -
   `/api/search`'s route gains a `getClaims()` call and logs `search`;
   `getOrEmbedQuery` logs `embedding_call` on a cache miss only.
   Done when: a search request logs exactly one `search` row (`user_id` null
   when signed out); a repeated identical query (cache hit) logs no second
   `embedding_call` row, a novel query logs exactly one.

5. [x] **`embedding_call` event (taste path)** - `refreshTasteEmbedding` in
   `src/actions/friends.ts`, right after `computeTasteEmbedding` succeeds.
   Done when: saving questionnaire answers (or calibration picks) for a
   friend logs one `embedding_call` row.
   Not directly exercised live: `refreshTasteEmbedding` is a private,
   unexported function reached only through a signed-in questionnaire save
   (same "can't script a real browser session" limit noted for 19a's
   `/admin` check). Confidence comes from code review (`ownerId` is
   validated non-null by both call sites before this ever runs) plus the
   already-proven pieces: `logUsageEvent` (verified live in step 1) and
   `computeTasteEmbedding` (pre-existing, unchanged, already covered by its
   own tests). Worth a manual pass.

6. [x] **`llm_call` events** - `/api/search`'s route (context
   `"search_parse"`) and `/api/sessions/[id]/rationale`'s route (context
   `"rationale"`).
   Done when: a search request logs one `llm_call` row with
   `context: "search_parse"`; generating a rationale logs one `llm_call` row
   with `context: "rationale"`.
   `search_parse` verified live against the dev server (step 4's evidence).
   `rationale` needs a real signed-in session with a saved session/movie -
   not scriptable here (same limitation as step 5); confidence comes from
   code review plus the already-proven `logUsageEvent`.

### Testing plan

`AGENTS.md` declares `npm test` (Vitest) as the test gate. In-scope logic:

- `getOrEmbedQuery`'s cache-miss-only logging - extends the existing
  `retrieve.test.ts` suite (mocking `logUsageEvent` the same way
  `cacheQueryEmbedding` is already mocked there): asserts it's called on a
  miss and not on a hit.

`logUsageEvent` itself, the trigger migration, and the remaining call sites
(`createSession`, `chooseSessionFilm`, `refreshTasteEmbedding`, both routes)
are thin fire-and-forget side effects with no branching logic worth asserting
in isolation, matching the existing convention (`markParticipantsAsSeen`,
`syncAdminRole`) - exercised via live verification against the linked
Supabase project plus build/lint/typecheck, same as 18 and 19a's precedent.

### UI/UX notes

None - no UI changes in this step.

## Outcome

Built and verified against the linked Supabase project
(`sdqupxnxeplnnlfqxycg`), not just locally:

- `logUsageEvent` proven live: a real insert lands correctly, a forced
  failure (broken client) is caught and logged, never thrown.
- Signup trigger migration applied; creating a real `auth.users` row via the
  Supabase admin API produced both a `profiles` row and a matching `signup`
  `usage_events` row atomically. Cleaned up after.
- Search path proven live against the dev server with two real requests:
  first request logged `llm_call` -> `embedding_call` -> `search` in order;
  the repeated (cache-hit) request logged `llm_call`/`search` again but no
  second `embedding_call`, confirming the cache-miss-only logic. Test rows
  cleaned up.
- `npx tsc --noEmit`, `npm test` (316/316, existing suites extended),
  `npm run lint` (clean, one pre-existing unrelated warning), `npm run
  build` all clean.
- Not directly exercised live: `session_created`/`film_chosen` (host+friend
  attribution), taste-path `embedding_call`, and rationale `llm_call` - all
  three sit behind a real signed-in session, not scriptable outside a
  browser OAuth flow. Confidence comes from code review (ownerId is
  validated non-null at every call site before these run) plus the
  already-proven `logUsageEvent` and unchanged upstream functions
  (`computeTasteEmbedding`, `writeGroupRationale`).

Checkpoint commits on `feature/usage-event-instrumentation`: `6511408`
(logUsageEvent helper), `923df85` (signup event), `2f92da2`
(session_created/film_chosen), `030f98b` (search/embedding_call), `e788a3d`
(taste embedding_call), `73e5bee` (rationale llm_call).

Known follow-up for 19c: `usage_events` now has real rows to aggregate for
signups, sessions, film picks, search volume, and embedding/LLM call counts;
no dashboard reads any of it yet.

### Notes for the AI

- A route/action test whose mocked Supabase client lacks a `usage_events`
  chain doesn't need updating just because `logUsageEvent` was added to that
  code path - it's best-effort and swallows the resulting error internally,
  so existing tests keep passing unchanged (confirmed for the rationale
  route's test suite). Only add mocks/assertions where the new logging
  behavior is itself worth asserting (as done for `getOrEmbedQuery`'s
  cache-miss-only logging).
- `vi.mock()` factories are hoisted above a test file's own `const`
  declarations - a shared mock object referenced inside a factory needs
  `vi.hoisted()`, or the file throws "Cannot access '...' before
  initialization" (hit and fixed in `route.test.ts` for `/api/search`).
