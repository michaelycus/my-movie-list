# Feature: Free-text query parsing

**From build-plan:** feature 6b (sub-feature of 6. Natural-language search)
**Status:** complete

## Goal

Turn free text like "films for children under 10" or "something bittersweet
about growing up" into `{ filters, semanticQuery }` via one small, fast
OpenRouter model call - the structured half feeds Postgres full-text/filters,
the semantic half feeds embedding + vector retrieval in 6c. A parse failure
must degrade to "search the raw text," never break the request - same
resilience principle the project already applies to the rationale LLM call.

## In scope

- `parseSearchQuery(text, genres, apiKey)` in `src/lib/search/parse.ts`,
  calling OpenRouter chat completions with one small fast model, returning
  `{ filters: { genreIds, decade, runtimeBand, maxAge }, semanticQuery }`.
- Reuses the existing filter shape from `src/lib/movies/browse.ts`
  (`RuntimeBand`, `AgeCeiling`) rather than inventing a new one.
- Maps the model's genre *names* (it doesn't know internal ids) back to
  `genre_ids` using a caller-supplied genre catalog.
- Graceful degradation on any failure (network, non-JSON, schema mismatch):
  falls back to `{ filters: {genreIds: [], decade: null, runtimeBand: null,
  maxAge: null}, semanticQuery: text }` - the original text, unparsed. Never
  throws.

## Out of scope

- Calling OpenAI to embed `semanticQuery`, and caching that embedding in
  `query_cache` (built in 6a; wired up in 6c/6d).
- Full-text/vector retrieval and Reciprocal Rank Fusion merge (6c).
- The `/api/search` route handler and UI (6d).
- Rate limiting or anonymous request caps (feature 20).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - prompt, response schema, and genre mapping (pure, no
  network)** - `buildParsePrompt(text, genres)` returns the chat messages
  (system prompt describing the exact JSON shape to return, given the genre
  catalog by name); a zod schema validates the model's raw JSON
  (`{ genres: string[], decade: number|null, runtimeBand:
  "short"|"standard"|"long"|null, maxAge: number|null, semanticQuery: string
  }`, decade constrained to the same `%10 === 0`, 1920-2020 range
  `browse.ts` already enforces); `mapGenreNamesToIds(names, genres)` does a
  case-insensitive exact match against the catalog, silently dropping names
  that don't match rather than erroring. *Done when:* vitest covers schema
  validation (valid shape, invalid shape), genre mapping (exact match,
  case-insensitive match, no match dropped, empty list), and decade
  range rejection.
- [x] **Step 2 - `parseSearchQuery` OpenRouter call** - `fetchWithRetry`
  (mirrors the retry/backoff shape in `src/lib/ingest/openai.ts`, kept
  separate per that file's own precedent of not sharing retry helpers across
  feature boundaries) posts to `https://openrouter.ai/api/v1/chat/completions`
  with `response_format: { type: "json_object" }`, the model from Step 1's
  prompt, and `OPENROUTER_API_KEY` passed in as a parameter (not read from
  `process.env` inside this file - same convention as `fetchEmbeddings` in
  `openai.ts`). Parses the response with Step 1's schema + mapper; any
  failure (fetch error after retries, non-JSON body, schema mismatch) is
  caught and falls back to the raw-text result - logged via `console.error`,
  never thrown. *Done when:* vitest with a mocked `fetch` covers a
  successful parse, a malformed-JSON response falling back gracefully, and a
  fetch failure (after retries) falling back gracefully.

## Files / areas

- `src/lib/search/parse.ts` (new) + `parse.test.ts`

## Data / contracts

- `ParsedSearchQuery` (**load-bearing for 6c/6d**):
  ```ts
  interface ParsedSearchQuery {
    filters: {
      genreIds: number[];
      decade: number | null;
      runtimeBand: RuntimeBand | null;
      maxAge: AgeCeiling | null;
    };
    semanticQuery: string;
  }
  ```
  `filters` is intentionally the same shape `applyFilters` in `browse.ts`
  already knows how to apply - 6c/6d can filter with it directly.
- New server-only env var: `OPENROUTER_API_KEY` (add to `.env.local`; not
  needed for the unit tests, which mock `fetch`, but required for any manual
  end-to-end check).

## Testing

- Test runner is configured (`npm test`) - both steps are pure/mocked-network
  logic (schema validation, genre mapping, retry/fallback behavior), so both
  ship unit tests per their done-whens, mocking `fetch` the way the project's
  testing conventions call for (`vi.mock`/`vi.stubGlobal` for external
  calls - see `coding-standards.md`).
- No manual end-to-end check in this sub-feature: `parseSearchQuery` isn't
  called from any route yet (that's 6d). A quick manual smoke check (calling
  it from a scratch script with `OPENROUTER_API_KEY` set) is optional, not a
  done-when.

## Notes for the AI

- Model: use a small, fast OpenRouter model per the project plan's own
  example (`meta-llama/llama-3.1-8b-instruct`) - not a frontier model, this
  isn't latency- or quality-critical.
- Never let this function throw. A model outage or bad response degrades
  search to "unparsed text," mirroring how the group-rationale LLM call is
  designed to degrade to "no blurb" rather than "no recommendations."
- Don't call OpenAI or touch `query_cache` here - embedding `semanticQuery`
  and caching it are 6c's job, using the helpers already built in 6a
  (`src/lib/search/query-cache.ts`, `src/lib/search/match.ts`).
- Server-only: this file is never imported into a Client Component.

## Outcome

Built and verified: 16 unit tests (schema validation, genre mapping,
OpenRouter call with mocked `fetch`, graceful fallback on malformed JSON,
non-JSON body, retry exhaustion, and network rejection). A real bug caught
by its own tests along the way - with every field defaulted, the response
schema silently accepted any object; fixed by making `semanticQuery`
required while keeping filter fields lenient. Full suite 166/166, build and
lint clean. Checkpoint commit `a5de4ed` on `feature/query-cache-match-movies-rpc`.
