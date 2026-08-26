# CineMood - Project Overview

> Pick a film a whole group will actually enjoy, in under a minute.

## Problem

Choosing a film with friends is slow and socially awkward: everyone scrolls a
different catalog, nobody wants to be the one who picks badly, and the decision
often takes longer than the opening act. Existing recommenders optimise for one
person's profile, not a group in the room tonight. Even solo, searching by vibe
("something funny but not stupid", "films for kids under 10") is not something a
keyword box handles - that needs semantic search over film descriptions.

## Users

- **Anonymous visitor** - browses and searches the catalog in natural language, no account. Also the funnel into signing up.
- **Account holder (the host)** - signs in with Google via Supabase Auth. Owns everything hanging off the account: friend profiles and film sessions. Exactly one real authenticated identity per account.
- **Friends (non-users)** - no logins. Records created and owned by the host, each carrying a taste profile. A friend belongs to exactly one host account - this removes onboarding friction (add four friends in three minutes at the start of movie night).
- **Admin** - a single operator, identified by a `role` flag on the profile, seeded from an allowlist env var (not self-service). Sees usage statistics only.

## Features

The headline feature is **group recommendations** (14) - taking stored friend
tastes plus tonight's mood and ranking the catalog so the pick is a good
compromise, not one loud person's favourite.

1. **Film catalog ingest** - stream-parse the TMDB CSVs, join on TMDB id, enrich with poster path and age certification from the TMDB API, land 5,000 released films in the database.
2. **Film embeddings** - build one embedding document per film (title, tagline, overview, keywords, top-billed cast, director), embed in resumable batches, store vectors alongside the source text.
3. **Browse the catalog** - poster grid, sort by popularity/rating/release date, paginated, no account needed.
4. **Film detail page** - poster, backdrop, overview, genres, runtime, cast, director, rating, age certification.
5. **Keyword and filter search** - title, cast, genre, decade, runtime band, age ceiling via full-text and structured filters.
6. **Natural-language search** - free text parsed into filters plus a semantic query, lexical and vector results merged, "why this matched" shown per result.
7. **Google sign-in** - Supabase Auth, profile row created on first login, session routes protected.
8. **Friend profiles** - create, rename, edit, delete friends owned by the signed-in account.
9. **Preference questionnaire** - guided flow collecting the free-text and structured answers that become a friend's taste profile.
10. **Poster calibration step** - tap loved it / not for me on eight popular films to enrich a profile without typing.
11. **Friend taste embedding** - synthesise answers into a paragraph, embed it, blend in calibration picks, refresh whenever answers change.
12. **Create a film session** - name a session, pick participants from existing friends, inline friend creation without losing the session.
13. **Tonight's mood** - capture each participant's mood, tonight's constraints, and the youngest viewer in the room at session start.
14. **Group recommendations** - apply the room's combined hard filters, score every candidate per participant, rank with least-misery aggregation. *(Headline feature.)*
15. **Per-participant fit breakdown** - per-film fit bar per person, plus a live consensus-versus-adventurous slider that re-ranks.
16. **Group pick rationale** - one LLM-written paragraph naming each participant and why the chosen film works for them.
17. **Save and revisit sessions** - record date, participants, chosen film, rationale; list past sessions.
18. **Seen list** - mark films as watched so they stop resurfacing for that group.
19. **Admin usage dashboard** - signups, sessions, most-chosen films, search volume, estimated API spend; visible only to the admin role.
20. **Search cost guardrails** - cache query embeddings, rate-limit anonymous semantic search per IP, fall back to keyword search when the daily cap is hit.
21. **Installable PWA** - manifest, icons, offline shell, cached posters.
22. **Deployment readiness** - Vercel + Supabase production config, RLS on every user-owned table, TMDB attribution, verified production build.

**Explicitly out of scope for v1:** streaming-provider availability, friend
logins, social sharing, watchlists beyond the seen list, user-written ratings,
multi-language UI beyond pt-BR, notifications.

## Data model

Postgres (Supabase) with `pgvector`. Embeddings are 1536-dim
(`text-embedding-3-small`).

### movies
- `id` (bigint, PK) - TMDB id
- `title`, `original_title`, `overview`, `tagline` (text)
- `release_date` (date), `runtime` (int), `original_language` (text)
- `poster_path`, `backdrop_path` (text) - path only; full URL built at render time from `image.tmdb.org`
- `vote_average` (numeric), `vote_count` (int), `popularity` (numeric)
- `weighted_rating` (numeric) - computed at ingest, Bayesian-weighted so a 10.0 with 4 votes doesn't win
- `min_age` (smallint, nullable) - normalised age certification (BR, fallback US)
- `genre_ids` (smallint[], GIN indexed), `keywords` (text[], GIN indexed), `countries` (text[])
- `status` (text) - only `Released` films are ingested
- `search_doc` (tsvector, GIN indexed) - title + cast + director
- `embedding` (vector(1536), HNSW indexed, cosine)
- `embedding_text` (text) - exact string embedded, for debugging/re-embeds
- `embedded_at` (timestamptz)

### genres
- `id` (smallint, PK), `name` (text)

### movie_cast
- `movie_id` (FK -> movies), `person_name` (text), `character` (text), `billing_order` (smallint) - `billing_order < 8` taken at ingest

### movie_crew
- `movie_id` (FK -> movies), `person_name` (text), `job` (text) - filtered to Director (and optionally Writer, Original Music Composer) at ingest

### profiles
- `id` (uuid, PK = `auth.users.id`), `email`, `display_name`, `avatar_url`
- `role` (text, default `'user'`) - `'admin'` seeded from an allowlist env var
- `created_at` (timestamptz)

### friends
- `id` (uuid, PK), `owner_id` (uuid, FK -> profiles)
- `display_name` (text), `avatar_emoji` (text)
- `answers` (jsonb) - raw questionnaire answers
- `hard_filters` (jsonb) - derived: `{max_runtime, min_age_ceiling, blocked_genres[], subtitles_ok}`
- `taste_embedding` (vector(1536)), `taste_text` (text) - the synthesised paragraph that was embedded
- `updated_at` (timestamptz)
- belongs to exactly one owner (profile); a friend is never shared across accounts

### sessions
- `id` (uuid, PK), `owner_id` (uuid, FK -> profiles), `title` (text)
- `watched_on` (date), `chosen_movie_id` (bigint, FK -> movies, nullable)
- `rationale` (text, nullable), `created_at` (timestamptz)

### session_participants
- `session_id` (FK -> sessions), `friend_id` (FK -> friends, nullable), `is_host` (bool)
- `mood_tags` (text[]) - tonight's overlay on the friend's stored mood default
- `mood_note` (text) - optional free text, embedded into the session query
- `constraints` (jsonb) - tonight's overrides (e.g. "nothing over 2h")

### seen_movies
- `owner_id` (FK -> profiles), `friend_id` (FK -> friends, nullable), `movie_id` (FK -> movies), `seen_on` (date)

### query_cache
- `query_hash` (text, PK), `query_text` (text), `embedding` (vector(1536)), `hits` (int), `created_at` (timestamptz)

### usage_events
- `id`, `event_type`, `user_id` (nullable), `meta` (jsonb), `created_at` - powers the admin dashboard

### ingest_checkpoint
- `source` (text), `last_id` (bigint), `updated_at` (timestamptz) - makes ingest resumable

> **Row-Level Security is on for every user-owned table.** Policy shape:
> `owner_id = auth.uid()` for `friends`, `sessions`, `seen_movies`;
> `session_participants` joins through `sessions.owner_id`. `movies`, `genres`,
> `movie_cast`, `movie_crew` are readable by `anon`. `usage_events` is
> insert-only for everyone, readable only by `role = 'admin'`.
>
> Size stays well inside Supabase's free-tier 500 MB: ~31 MB of vectors for
> 5,000 films (roughly doubling with the HNSW index), ~60k cast/crew rows.

## Tech stack

- **Next.js (App Router) + TypeScript** - Server Components for catalog pages, Route Handlers for search/recommendations, Server Actions for mutations.
- **Supabase** - Postgres + `pgvector` + Auth (Google) + RLS, accessed via `@supabase/ssr`. Vector search and group scoring run as Postgres RPC functions (`match_movies`, `score_group`) so ranking stays in the database.
- **Tailwind + shadcn/ui** - component base, retheme via CSS variables.
- **OpenAI `text-embedding-3-small`** (1536 dims) - all embeddings (films, friend taste profiles, search queries). Server-only key.
- **OpenRouter** - chat completions only: parsing free-text search into filters + a semantic query, and writing the group pick rationale. A small fast model is sufficient for both.
- **TMDB API** - ingest-time enrichment (images, certifications) and optional catalog top-up past 2016. Requires attribution in the footer.
- **Vercel** - hosting, cron for any scheduled catalog top-up.

Embeddings go directly to OpenAI (not OpenRouter, which has no embeddings
endpoint) - the one place the stack touches two LLM vendors.

### Search mechanics
Hybrid retrieval, because pure vector search misses proper nouns: free text ->
LLM parse -> `{filters, semantic_query}` (cached by query hash) -> parallel
Postgres full-text (`search_doc`) and pgvector cosine retrieval -> merge with
Reciprocal Rank Fusion -> mild `weighted_rating` boost.

### Group recommendation mechanics
1. Hard filters first (strictest `min_age` and runtime cap in the room, union of blocked genres, already-seen films removed) - a `WHERE` clause, never overridden by score.
2. Candidate retrieval: top-N per participant by cosine against `taste_embedding` blended with tonight's mood vector, capped at ~300 union.
3. Per-participant score: cosine similarity + mood-tag bonus - disliked-genre penalty.
4. Aggregate: `group_score = 0.6 * mean(scores) + 0.4 * min(scores)` - the `min` term protects against picking a film three people love and one hates. The 60/40 split is exposed as a "Consensus <-> Adventurous" slider (feature 15).
5. Tiebreak on `weighted_rating`, then novelty (slight penalty for very high `popularity`).
6. One LLM call writes the rationale for the top pick, naming each friend. The LLM never decides ranking - a model outage degrades to "no blurb," not "no recommendations."

## Monetization

Not commercial - a portfolio project demonstrating embedding-based retrieval,
hybrid search, and group preference aggregation. The design constraint in place
of revenue is **cost containment**: run within free tiers plus a few dollars of
one-off embedding spend (~$0.10 for 5,000 films).

## UI/UX

Vibrant neon on a dark base - cinema-lobby-at-night, not developer-terminal.
Single token layer, motion signals state changes rather than decorating.

**Tokens:**
- `--bg` #08070F, `--surface` #131024, `--surface-2` #1D1836, `--fg` #F2EEFF, `--muted` #9A93B8
- `--neon-magenta` #FF2E9A (primary action, selected state)
- `--neon-cyan` #22E6FF (secondary, links, focus ring)
- `--neon-lime` #B6FF3A (positive / high match score)
- `--neon-amber` #FFB020 (warnings, low match score)

**Routes (inferred from the feature list):**
- `/` - poster grid catalog, sort + filters (features 3, 5, 6)
- `/films/[id]` - film detail page (feature 4)
- `/friends` - friend list and CRUD (feature 8)
- `/friends/[id]/questionnaire` - preference questionnaire + calibration (features 9, 10)
- `/sessions/new` - stepper: *Who's here -> How's everyone feeling -> Here's your film* (features 12, 13, 14, 15, 16)
- `/sessions/[id]` - saved session detail (feature 17)
- `/sessions` - session history list (feature 17)
- `/admin` - usage dashboard, admin role only (feature 19)

Match scores render as thin neon bars, magenta -> lime by strength, never a
bare percentage. Glow via low-opacity `box-shadow` on interactive elements
only. Body text stays `--fg` on `--surface`, never neon-on-dark. One geometric
display face for titles, system stack for body. `prefers-reduced-motion`
disables glow/pulse animation. WCAG AA contrast throughout; focus rings in
`--neon-cyan`, always visible. Each session step must be completable one-handed
on a phone.

## Deployment

- **Host:** Vercel (Hobby), Next.js app, preview deploys per branch. 10s default function timeout - every request path (one embedding call + one SQL query for search; pure SQL for group ranking; one small-model completion for the rationale) is designed to stay well under it.
- **Database:** Supabase hosted Postgres, migrations checked into `supabase/migrations`. Free tier (~500 MB, ~5 GB egress) is enough; projects pause after a week idle, so the first request after idle is slow.
- **Images:** proxied, never stored. Only `poster_path`/`backdrop_path` persisted; URLs built as `https://image.tmdb.org/t/p/w342{poster_path}`. `image.tmdb.org` added to `next.config` `images.remotePatterns`; poster images use `unoptimized` to avoid burning Next/Image's Hobby transform quota re-optimising already-sized TMDB JPEGs.
- **Ingest:** a local script (`pnpm ingest` per the plan; adjust to `npm run ingest` to match this project's package manager), not a serverless function - reads the CSVs from `references/`, enriches via TMDB, embeds in batches of 100, upserts, and checkpoints after each batch so a crash resumes instead of re-billing. Never runs on Vercel.
- **Env vars (server-only):** `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Public:** `NEXT_PUBLIC_SUPABASE_URL`, the Supabase anon key.
- **TMDB terms:** attribution required in the footer; app is not endorsed or certified by TMDB.

## Open questions

- **Source CSVs not yet in the repo.** The plan expects `references/tmdb_5000_movies.csv` and `references/tmdb_5000_credits.csv` committed at the start of ingest (feature 1); they aren't present yet.
- **Catalog vintage.** The CSVs stop around 2016. Decide before ingest whether to top up from TMDB `/discover/movie` for 2016-today, or set that expectation in the UI - the plan leaves this open.
- **pt-BR language decision.** The plan flags that shipping the UI in pt-BR means choosing at ingest time whether to embed `language=pt-BR` overviews or accept a mixed-language experience, since changing later means re-embedding the whole catalog. Not resolved in either plan.
- **Admin role seeding mechanism** is named (an allowlist env var) but which build step wires it up isn't explicit - likely folds into feature 19 or 22; worth confirming when those are spec'd.
- **Package manager mismatch.** The plan's deployment section says `pnpm ingest`; the actual repo uses npm (`package-lock.json`, no pnpm lockfile). Noted above as `npm run ingest` - confirm this is intentional before the ingest feature is spec'd.
