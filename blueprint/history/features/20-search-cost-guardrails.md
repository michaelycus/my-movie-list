# Feature: Search cost guardrails

**From build-plan:** feature 20
**Status:** complete

## Goal

Cap how much anonymous natural-language search can cost per day. Query
embedding caching (the first guardrail in the plan's description) already
shipped in 6a/6c - `query_cache` plus `getOrEmbedQuery` mean repeat searches
for the same text never re-pay for an OpenAI embedding. What's still missing
is a ceiling on *distinct* free-text queries from one anonymous visitor: cap
anonymous semantic search per IP per day, and once the cap is hit, degrade to
keyword-only results instead of erroring or blocking search entirely.

## In scope

- A Postgres table plus a `security definer` RPC that atomically counts
  today's anonymous searches per hashed IP, so the check-and-increment can't
  race under concurrent requests.
- A small helper module that hashes the request's IP and asks "still under
  the cap?", failing open (never blocking search) if the RPC itself errors.
- Wiring `/api/search` so an anonymous request over the cap skips the
  OpenAI embedding call and vector retrieval entirely (the actual cost
  saving) and returns lexical-only results, the same degrade path
  `searchMovies` already uses when embedding genuinely fails.
- Authenticated requests are never capped - only anonymous ones cost the
  project money without an accountable user behind them.

## Out of scope

- Query embedding caching itself - already done (6a's `query_cache`, used by
  `getOrEmbedQuery` in `retrieve.ts`). Nothing to add here.
- Rate-limiting authenticated search, or keyword/filter search (feature 5) -
  only anonymous natural-language search spends an OpenAI/OpenRouter call.
- Any UI change. Degraded results still render through the exact same
  `NaturalLanguageSearchBar` states; a "you've hit today's limit" banner is a
  nice-to-have, not required by the plan's wording.
- A new `usage_events` event type - piggybacks on the existing `"search"`
  event's `meta` instead, so 19c's dashboard aggregation isn't touched.
- IP geolocation, CAPTCHA, or anti-abuse beyond a simple per-day counter.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `anon_search_limits` table + `increment_anon_search_count`
  RPC** - scaffold with `npx supabase migration new
  anon_search_rate_limit`. Table: `anon_search_limits (ip_hash text not
  null, day date not null default current_date, count int not null default
  0, primary key (ip_hash, day))`, RLS enabled, zero table policies (same
  `ingest_checkpoint` pattern - internal bookkeeping, never queried
  directly). `increment_anon_search_count(p_ip_hash text) returns int`:
  `security definer`, `set search_path = public`, atomically upserts
  `(p_ip_hash, current_date)` incrementing `count`, returns the new count;
  `revoke all ... from public`, then `grant execute ... to anon,
  authenticated`. Comment explaining why this one RPC breaks from
  `match_movies`/`score_group`'s `security invoker` convention: the table
  has no anon grants on purpose (unlike `query_cache`, exposing raw counts
  per IP hash isn't needed by anything client-facing), so the function needs
  definer privileges to write to it. *Done when:* `npx supabase db push`
  applies cleanly, calling the RPC twice via the SQL editor for the same
  `p_ip_hash` returns `1` then `2`, and `npx supabase db advisors --linked
  --type security` reports no new findings.
- [x] **Step 2 - IP hash + cap-check helper** - new
  `src/lib/search/anon-rate-limit.ts`: `ipHash(request: Request): string`
  (sha256 of the first `x-forwarded-for` entry, `"unknown"` when the header
  is absent - same `node:crypto` pattern as `query-cache.ts`'s `hashQuery`);
  `ANON_SEMANTIC_SEARCH_DAILY_CAP = 50`; `underAnonSemanticSearchCap(client,
  hash): Promise<boolean>` calling the new RPC and comparing the returned
  count to the cap, catching an RPC error to fail open (`true`) since a
  rate-limit outage must never take real search down with it. *Done when:* a
  vitest unit test (mocked Supabase client, same style as `match.test.ts`)
  covers under-cap (true), over-cap (false), the RPC-error fail-open path,
  and `ipHash`'s header-present / header-missing / two-different-IPs-hash-differently
  cases.
- [x] **Step 3 - wire into retrieval + the route** - add an `allowSemantic =
  true` parameter to `searchMovies` (`retrieve.ts`): when `false`, the
  vector-retrieval branch resolves to `[]` immediately, without calling
  `getOrEmbedQuery`/`fetchEmbeddings` at all (the actual cost saved, not
  just a filtered response) - `lexicalSearch` runs exactly as before. In
  `route.ts`, compute `allowSemantic` as `true` when `userId` is set,
  otherwise `await underAnonSemanticSearchCap(client, ipHash(request))`;
  pass it into `searchMovies`; when it resolves `false`, add `rateLimited:
  true` to the existing `"search"` usage-event's `meta` (no new event
  type). *Done when:* `retrieve.test.ts` covers `allowSemantic: false`
  skipping the embedding call and returning lexical-only results;
  `route.test.ts` covers an authenticated request never calling the
  cap-check, an anonymous under-cap request allowing semantic search, and an
  anonymous over-cap request calling `searchMovies` with `allowSemantic:
  false` and logging `rateLimited: true`. Full suite, build, and lint stay
  green.

## Files / areas

- `supabase/migrations/<timestamp>_anon_search_rate_limit.sql` (new)
- `src/lib/search/anon-rate-limit.ts` (new) + `anon-rate-limit.test.ts`
- `src/lib/search/retrieve.ts` - `searchMovies`'s new `allowSemantic` param
- `src/lib/search/retrieve.test.ts` - cover the new param
- `src/app/api/search/route.ts` - compute and pass `allowSemantic`, extend
  the `"search"` usage-event's `meta`
- `src/app/api/search/route.test.ts` - cover the three `allowSemantic` paths

## Data / contracts

- `anon_search_limits(ip_hash text, day date, count int, primary key
  (ip_hash, day))` - RLS enabled, no table policies; written only through
  the RPC below.
- `increment_anon_search_count(p_ip_hash text) returns int` - `security
  definer`, atomic upsert-and-increment, granted to `anon, authenticated`.
- `ANON_SEMANTIC_SEARCH_DAILY_CAP = 50` searches per IP hash per UTC day
  (Postgres `current_date` on the linked project, which runs UTC).
- `searchMovies(client, apiKey, parsed, limit = PAGE_SIZE, allowSemantic =
  true)` - `allowSemantic: false` short-circuits the vector/embedding branch
  to `[]`; the merge and response shape are unchanged, `matchedVia` is just
  always `"keyword"` for that request.

## Testing

Test runner is configured (`npm test`) - every step here is pure logic
(SQL aside) or a thin, already-mocked orchestration wrapper, the same
category as this feature's existing search code, so each step ships with a
unit test per its done-when. Step 1's migration is verified manually via
`npx supabase db push` and a direct RPC call, matching every prior schema
step in this project (6a, 12, 14a, 19a, ...).

## Notes for the AI

- Trusting `x-forwarded-for` for the IP hash is a deliberate low-stakes
  trade, the same shape as `findings.md`'s F-03 on `x-forwarded-host`: a
  spoofed value only lets someone dodge or share a rate-limit bucket
  (availability/cost), never an auth bypass. Worth one short comment next to
  `ipHash`, not a bigger mitigation.
- Don't touch `query_cache`, `getOrEmbedQuery`, or anything in 6a/6c - that
  guardrail is already built. This feature is additive: one new table, one
  new RPC, one new parameter threaded through existing functions.
- Keep `searchMovies`'s existing degrade-on-embedding-failure path
  (`vectorPromise`'s try/catch) intact; `allowSemantic: false` is a second,
  earlier way to reach the same "vector = []" outcome, not a replacement for
  it.
- Don't add a new `usage_events` event type or touch the admin dashboard
  (19c) - fold the signal into the existing `"search"` event's `meta` per
  the Out of scope note.

## Outcome

Built and verified end-to-end against the live, linked Supabase project, not
just mocks: `npx supabase db push --linked` applied the migration cleanly;
calling `increment_anon_search_count` twice via a direct anon-key REST call
returned `1` then `2`; `npx supabase db advisors --linked --type security`
surfaced two new WARNs (the RPC being `security definer`-callable by
`anon`/`authenticated`), both expected and documented in the migration's own
comment - same risk class as the pre-existing `handle_new_user()` warning,
no data exposure or privilege gain possible. A live `npm run dev` + `curl`
against `/api/search` returned real hybrid results, and a follow-up
service-role read of `anon_search_limits` confirmed the request actually
incremented the counter; test rows cleaned up after.

Full suite 341/341 (up from 338), build clean (one TS fix needed in the new
test file's `Headers` typing, caught by `npm run build`), lint clean (one
pre-existing unrelated warning). No P0/P1 findings raised or open;
`findings.md`'s existing F-03 (from feature 7, unrelated) was left
untouched. Checkpoint commits `00b0b94`, `b957e64`, `7f52133` on
`feature/search-cost-guardrails`.
