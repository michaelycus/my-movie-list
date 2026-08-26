# Project Plan

**Project name (working):** CineMood
**One-liner:** Pick a film a whole group will actually enjoy, in under a minute.

---

## 1. Problem — What problem are we solving?

Choosing a film with friends is slow and socially awkward. Everyone scrolls a different catalog, nobody wants to be the one who picks badly, and the decision often takes longer than the opening act. Existing recommenders optimise for one person and one profile.

This app solves the **group** version of the problem: it takes the stored tastes of several people, plus the mood each of them happens to be in tonight, and ranks the catalog so the chosen film is a good compromise rather than one loud person's favourite.

Secondary problem: even solo, searching by *vibe* ("something funny but not stupid", "films for kids under 10") is not something a keyword search box handles. Semantic search over film descriptions fixes that.

---

## 2. Users — Who is this for?

**Anonymous visitor.** Lands on the site, browses and searches films in natural language. No account, no friction. This is also the funnel into signing up.

**Account holder (the host).** Signs in with Google. Owns the account and everything hanging off it: the friend profiles they create, and the film sessions they run. There is exactly one real authenticated identity per account.

**Friends (non-users).** Friends do **not** have logins. They are records created and owned by the host, each carrying a taste profile. This is deliberate — it removes onboarding friction entirely (the host can add four friends in three minutes at the start of movie night) and keeps the auth model trivial. A friend belongs to exactly one host account.

**Admin.** A single operator (the project owner) who can see usage statistics. Identified by a role flag on the profile, seeded from an allowlist env var — not a self-service role.

---

## 3. Features — What does the MVP need?

### Public (no account)
- Browse the film catalog: poster grid, sorting by popularity / rating / release date.
- Film detail page: poster, backdrop, overview, genres, runtime, cast, director, rating, age certification.
- Structured search and filters: title, cast member, genre, decade, runtime band, minimum rating, age certification ceiling.
- **Natural-language search**: free text like "films with Tom Hanks", "films for children under 10", "something scary but not gory" is interpreted into a mix of hard filters and a semantic vector query, with a short "why this matched" line on each result.

### Authenticated (the "Film session with friends" flow)
- Google sign-in via Supabase Auth; a profile row is created on first login.
- Friend CRUD: create, edit, delete friend profiles.
- **Preference questionnaire**: a short guided flow (see §9) that turns answers into a stored taste profile and a taste embedding.
- Session creation: name a session, pick participants from existing friends, or add a new friend inline without losing the session.
- **Tonight's mood**: per participant, captured at session start; it overlays the stored profile for this session only.
- **Group recommendations**: a ranked shortlist with a per-participant fit breakdown.
- **Pick rationale**: one LLM-written paragraph naming each participant and why the film works for them.
- Save the session: date, participants, chosen film, rationale. Session history list.
- Seen list: mark films as already watched so they stop resurfacing for that group.

### Admin
- Dashboard: signups over time, sessions created, films chosen most often, search volume (anonymous vs authenticated), embedding/LLM call counts and estimated spend, failed job counts.

### Platform
- PWA: installable, app icon, offline shell, cached poster images, works acceptably on a phone passed around a living room.

### Explicitly out of scope for MVP
Streaming-provider availability, friend logins, social sharing, watchlists beyond the seen list, ratings written back by users, multi-language UI (pt-BR only is fine to start, but see §10), notifications.

---

## 4. Data — What are we storing?

### 4.1 Source data analysis

**Source files — these are the real inputs the build must read:**

| Path | Rows | Notes |
|---|---|---|
| `references/tmdb_5000_movies.csv` | 5,000+ | Film metadata, 20 columns |
| `references/tmdb_5000_credits.csv` | 5,000+ | Cast and crew, 4 columns, joined on `movie_id` |

Both files are committed to the repo under `references/` and are the starting point of the ingest pipeline. The column analysis below was derived from a two-row sample of each file; the schema is the standard TMDB 5000 export and holds at full size.

**Practical note on file size:** `tmdb_5000_credits.csv` is heavy — the `cast` and `crew` cells are large JSON blobs, and at 5,000 rows the file runs to roughly 40 MB with individual cells in the tens of kilobytes. Parse it as a **stream**, row by row, rather than loading the whole file into memory, and expect quoted fields containing commas and embedded newlines — use a real RFC-4180 CSV parser (`csv-parse` / `papaparse` in streaming mode), never a `split(',')`.

Column-by-column, here is what each file is good for:

**`tmdb_movies.csv` — 20 columns**

| Column | Type | Use |
|---|---|---|
| `id` | int | **TMDB id. Primary key and the join key to credits and to the TMDB API.** |
| `title`, `original_title` | text | Embed + full-text index + display |
| `overview` | text | **Highest-value embedding input** — the plot/vibe paragraph |
| `tagline` | text | Embed — often carries tone ("Enter the World of Pandora") |
| `genres` | JSON array `{id,name}` | Normalise to a lookup table; **embed the names** *and* keep as a filterable array |
| `keywords` | JSON array `{id,name}` | **Second-highest embedding value** — "space war", "culture clash", "based on novel". Take top ~10 |
| `release_date` | date | Filter (decade, new vs classic), display |
| `runtime` | int | Hard filter (someone hates 3-hour films) |
| `original_language` | text | Filter (subtitle tolerance) |
| `spoken_languages` | JSON | Filter, minor embedding value |
| `vote_average`, `vote_count` | float/int | Quality prior + tiebreaker. Use a Bayesian-weighted rating so a 10.0 with 4 votes doesn't win |
| `popularity` | float | Tiebreaker, default browse sort |
| `production_countries` | JSON | Filter (e.g. "not Hollywood"), light embedding value |
| `production_companies` | JSON | Weak signal — store, do not embed (studio names add noise) |
| `budget`, `revenue` | int | Not user-facing. Useful as a blockbuster-vs-indie proxy |
| `status` | text | Filter out anything not `Released` at ingest |
| `homepage` | text | Store, low value |

**`tmdb_credits.csv` — 4 columns**

| Column | Type | Use |
|---|---|---|
| `movie_id` | int | Join key to `tmdb_movies.id` |
| `title` | text | Redundant, drop |
| `cast` | JSON array `{name, character, order, gender, id}` | **Critical.** `order` is billing position — take `order < 8`. Names go into the embedding *and* a full-text index, so "films with Tom Hanks" works both lexically and semantically |
| `crew` | JSON array `{name, job, department}` | Filter to `job == "Director"` (and optionally Writer, Original Music Composer). Directors are a strong taste signal |

**Two gaps these CSVs cannot fill, both of which must come from the TMDB API at ingest:**

1. **No `poster_path` / `backdrop_path`.** Every image comes from `GET /3/movie/{id}`.
2. **No age certification.** "Films for children under 10" is a headline feature and it cannot be answered from `genres` alone. Pull `GET /3/movie/{id}/release_dates` and take the BR certification, falling back to US, and map both onto a single internal `min_age` integer (e.g. BR `Livre`→0, `10`→10, `12`→12, `14`→14, `16`→16, `18`→18; US `G`→0, `PG`→8, `PG-13`→13, `R`→17, `NC-17`→18).

**Also note:** this dataset stops around 2016. If a modern catalog matters, top it up at ingest with `GET /3/discover/movie` sorted by popularity for 2016→today. The pipeline is identical; the CSVs simply become one of two sources.

### 4.2 Schema (Postgres / Supabase)

```
movies
  id              bigint PK          -- TMDB id
  title, original_title, overview, tagline
  release_date    date
  runtime         int
  original_language text
  poster_path     text               -- path only, e.g. "/kyeqWdyUXW608qlYkRqosgbbJyK.jpg"
  backdrop_path   text
  vote_average    numeric
  vote_count      int
  popularity      numeric
  weighted_rating numeric            -- computed at ingest, IMDb-style Bayesian
  min_age         smallint           -- normalised certification, NULL = unknown
  genre_ids       smallint[]         -- GIN indexed
  keywords        text[]             -- GIN indexed
  countries       text[]
  status          text
  search_doc      tsvector           -- title + cast + director, GIN indexed
  embedding       vector(1536)       -- HNSW indexed, cosine
  embedding_text  text               -- exact string that was embedded (for debugging/re-embeds)
  embedded_at     timestamptz

genres            (id smallint PK, name text)
movie_cast        (movie_id FK, person_name text, character text, billing_order smallint)
movie_crew        (movie_id FK, person_name text, job text)

profiles          (id uuid PK = auth.users.id, email, display_name, avatar_url, role text default 'user', created_at)

friends
  id uuid PK, owner_id uuid FK -> profiles
  display_name text, avatar_emoji text
  answers jsonb                      -- raw questionnaire answers
  hard_filters jsonb                 -- derived: {max_runtime, min_age_ceiling, blocked_genres[], subtitles_ok}
  taste_embedding vector(1536)
  taste_text text                    -- the synthesised paragraph that was embedded
  updated_at timestamptz

sessions
  id uuid PK, owner_id uuid FK, title text
  watched_on date, chosen_movie_id bigint FK -> movies NULL
  rationale text NULL
  created_at timestamptz

session_participants
  session_id FK, friend_id FK NULL, is_host bool
  mood_tags text[]                   -- tonight's overlay
  mood_note text                     -- optional free text, embedded into the session query
  constraints jsonb                  -- tonight's overrides (e.g. "nothing over 2h")

seen_movies       (owner_id FK, friend_id FK NULL, movie_id FK, seen_on date)

query_cache       (query_hash text PK, query_text text, embedding vector(1536), hits int, created_at)
usage_events      (id, event_type, user_id NULL, meta jsonb, created_at)   -- powers the admin dashboard
ingest_checkpoint (source text, last_id bigint, updated_at)                -- resumable ingest
```

**Row-level security** is on for every user-owned table. Policy shape: `owner_id = auth.uid()` for `friends`, `sessions`, `seen_movies`; `sessions` children join through to `sessions.owner_id`. `movies`, `genres`, `movie_cast`, `movie_crew` are readable by `anon`. `usage_events` is insert-only for everyone, readable only by `role = 'admin'`.

### 4.3 Size estimate

5,000 films × 1536 dims × 4 bytes ≈ **31 MB** of vectors, roughly doubling with the HNSW index. Cast/crew rows ≈ 60k rows. Total comfortably inside a 500 MB Postgres. **No images are stored** (see §6).

---

## 5. Tech — What stack are we using?

- **Next.js (App Router) + TypeScript** — Server Components for catalog pages, Route Handlers for search and recommendations, Server Actions for mutations.
- **Supabase** — Postgres + `pgvector` + Auth (Google) + RLS. Accessed via `@supabase/ssr`. Vector search runs as Postgres RPC functions (`match_movies`, `score_group`) so ranking stays in the database, not in Node.
- **Tailwind + shadcn/ui** — component base, retheme via CSS variables (see §7).
- **OpenAI `text-embedding-3-small`** (1536 dims) for all embeddings — films, friend taste profiles, and search queries. ~5,000 films is roughly **$0.10** one-off. Called only from server code; the key never reaches the browser.
- **OpenRouter** — chat completions only, for (a) parsing free-text search into structured filters + a clean semantic query, and (b) writing the group pick rationale. A small fast model (Llama 3.1 8B / Gemini Flash class) is enough for both; neither is on a latency-critical path that justifies a frontier model.
- **TMDB API** — ingest-time enrichment (images, certifications) and optional catalog top-up. Requires attribution in the footer per TMDB terms.
- **Vercel** — hosting, cron for any scheduled top-up.

**Why not OpenRouter for embeddings:** OpenRouter exposes chat-completions only; it has no embeddings endpoint. Embeddings therefore go direct to OpenAI. This is the one place the stack has two LLM vendors, and it is unavoidable.

### 5.1 How search actually works

**Anonymous / solo search** is *hybrid*, because pure vector search is bad at proper nouns:

1. Free text → LLM parse → `{ filters: {...}, semantic_query: "..." }`. Cheap, cached by query hash.
2. Two retrievals run in parallel against the filtered set: Postgres full-text over `search_doc` (catches "Tom Hanks"), and pgvector cosine over `embedding` (catches "something bittersweet about growing up").
3. Merge with **Reciprocal Rank Fusion** — no score normalisation needed, and it degrades gracefully when one arm returns nothing.
4. Apply the quality prior (`weighted_rating`) as a mild boost, not a hard sort.

`query_cache` stores the embedding for repeated queries so the second person searching "kids movies" costs nothing.

### 5.2 How the group recommendation works

Per-person scoring with an aggregation rule that protects the least-happy participant:

1. **Hard filters first.** Union of every participant's constraints: `min_age` ceiling is the *strictest* in the room, runtime cap is the strictest, blocked genres are the union, already-seen films are removed. This is a `WHERE` clause — it cannot be overridden by a good vector score.
2. **Candidate retrieval.** For each participant, top-N by cosine against their `taste_embedding` (blended with tonight's mood vector). Union the candidate sets, cap at ~300.
3. **Per-participant score.** For each candidate × participant: cosine similarity, plus a mood-tag match bonus, minus a small penalty for the participant's disliked genres.
4. **Aggregate.**
   `group_score = 0.6 × mean(scores) + 0.4 × min(scores)`
   The `min` term is the important half. Pure averaging picks films that three people love and one person hates; the least-misery floor pushes toward the film nobody objects to. The 60/40 split is a tunable constant — expose it as a "Consensus ↔ Adventurous" slider in the session UI.
5. **Tiebreak** on `weighted_rating`, then novelty (penalise very high `popularity` slightly, so the app suggests something they haven't already considered).
6. **Explain.** Top 10 go to the UI with a per-participant fit bar. The user's chosen film (or the top pick) gets one LLM call to write the rationale naming each friend.

The ranking is fully deterministic and inspectable — you can show the exact numbers when a suggestion looks wrong. The LLM never decides the ranking, so a model outage degrades the feature to "no blurb" rather than "no recommendations".

---

## 6. Monetize — How will this make money?

Not commercial. This is a portfolio / skills project for AI engineering, built to demonstrate embedding-based retrieval, hybrid search, and group preference aggregation. The design constraint that replaces revenue is **cost containment**: the whole thing must run within free tiers plus a few dollars of one-off embedding spend.

---

## 7. UI/UX — How should this look and feel?

Vibrant neon on a dark base — cinema-lobby-at-night, not developer-terminal. Built with the UI UX Pro Max Design Intelligence approach: a single token layer, applied consistently, with motion used to signal state changes rather than to decorate.

**Tokens** (CSS variables consumed by Tailwind + shadcn):

```
--bg           #08070F   near-black, slight violet cast
--surface      #131024   raised cards
--surface-2    #1D1836
--fg           #F2EEFF
--muted        #9A93B8
--neon-magenta #FF2E9A   primary action, selected state
--neon-cyan    #22E6FF   secondary, links, focus ring
--neon-lime    #B6FF3A   positive / high match score
--neon-amber   #FFB020   warnings, low match score
```

- Posters carry the colour; chrome stays dark so the grid reads as the content.
- Match scores render as thin neon bars, magenta→lime by strength. Never a bare percentage.
- Glow via layered `box-shadow` on interactive elements only, at low opacity — neon must not cost legibility. Body text stays `--fg` on `--surface`, never neon-on-dark.
- Type: one geometric display face for titles, system stack for body.
- Session flow is a horizontal stepper: *Who's here → How's everyone feeling → Here's your film*. Each step must be completable one-handed on a phone.
- Respect `prefers-reduced-motion`; all glow/pulse animations become static.
- WCAG AA contrast on all text. Focus rings in `--neon-cyan`, always visible.

---

## 8. Deployment — Where and how will this ship?

- **Vercel** for the Next.js app (Hobby). Preview deploys per branch.
- **Supabase** hosted Postgres for data, auth, and vectors. Migrations checked into `supabase/migrations`.
- **Images are proxied, not stored.** Only `poster_path` is persisted; URLs are built as `https://image.tmdb.org/t/p/w342{poster_path}` and served straight from TMDB's CDN. `image.tmdb.org` goes in `next.config` `images.remotePatterns`. Note that Next/Image optimisation has a monthly transform quota on Hobby — since TMDB already serves fixed sizes (`w185`/`w342`/`w500`/`original`), request the right size from TMDB and set `unoptimized` on poster images to avoid burning that quota re-optimising already-optimised JPEGs.
- **Ingest is a local script, not a serverless function.** `pnpm ingest` runs on a laptop and reads `references/tmdb_5000_movies.csv` and `references/tmdb_5000_credits.csv` from the repo: stream-parse both CSVs → join on `movie_id` → enrich via TMDB → embed in batches of 100 → upsert. It writes to `ingest_checkpoint` after each batch so a crash resumes rather than re-billing. This avoids every serverless timeout question entirely.
- **Secrets:** `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are server-only. Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key reach the client.

---

## 9. Friend preference questionnaire

The questionnaire has two jobs: produce **free text worth embedding**, and produce **hard filters worth enforcing**. Free-text answers are the ones that make the vector search good — a genre checkbox tells you far less than one sentence about why someone loves a film.

Target: under 90 seconds. Only Q1–Q3 are required; the rest are optional and can be filled in later.

**Embedding inputs (free text / rich):**
1. **"What's a film you love, and why?"** — free text, the single most valuable field. The *why* matters more than the title; "Arrival, because I like sci-fi that's actually about grief" is worth more than any tag list.
2. **"Describe your perfect movie night in one sentence."** — free text, captures tone and setting.
3. **"Anything you never want to watch?"** — free text + a "hard no" toggle. If toggled, the LLM maps it to blocked genres/keywords at save time and it becomes a filter, not a penalty.

**Structured (become filters or score adjustments):**
4. **Mood you usually want** — multi-select: fun, serious, inspiring, scary, action, romantic, mind-bending, feel-good, dark, weird.
5. **New or classic?** — three-way: mostly recent / no preference / love the classics. Maps to a release-year weighting, not a hard cut.
6. **Genres you love** and **genres you'd rather avoid** — multi-select from TMDB genres. "Love" boosts, "avoid" penalises; only the Q3 hard-no blocks.
7. **How long is too long?** — under 100 min / around 2h is fine / I'll happily watch 3 hours. Hard filter.
8. **Subtitles?** — happy to read them / prefer dubbed or English-language. Hard filter on `original_language`.
9. **Content tolerance** — "I'm fine with gore and heavy themes" ↔ "keep it light". Maps to a `min_age` ceiling.
10. **Quick calibration (optional):** show 8 well-known popular films as poster cards; tap *loved it* / *not for me* / *haven't seen*. Cheap, fun, and the "loved it" films' embeddings get averaged into the taste vector — this is often more accurate than anything they self-report.

**Session-level, asked fresh each time (not stored on the friend):**
- **"What's the mood tonight?"** — same multi-select as Q4, overriding the stored default.
- **"Anything special about tonight?"** — optional free text, embedded into the session query ("it's raining and we're all exhausted").
- **"Youngest person watching?"** — asked once per session, sets the room's `min_age` ceiling.

**Building the taste vector:** concatenate answers 1, 2, 3 and the label expansions of 4–6 into one paragraph (`taste_text`), embed it, and average with the "loved it" film vectors from Q10 if present. Store both the paragraph and the vector, so profiles can be re-embedded if the model changes without re-asking anyone anything.

---

## 10. Constraints and risks

- **Supabase free tier** — ~500 MB database, ~5 GB egress, and projects pause after a week of inactivity. Vectors fit easily; the pause is the real annoyance for a demo, so the first request after idle will be slow. Verify current limits before launch.
- **Vercel Hobby** — 10s default function timeout. Every request path is designed to stay well under it: search is one embedding call plus one SQL query; the group ranking is pure SQL; the rationale is a single small-model completion. **Ingest never runs on Vercel.**
- **Catalog vintage** — CSVs end around 2016. Decide before ingest whether to top up from TMDB `/discover`; if not, set expectations in the UI.
- **Cold-start quality** — a friend with only Q1 answered gets a thin vector. Fall back to genre/mood matching when `taste_text` is under a length threshold, and surface a "add more to improve suggestions" nudge.
- **Cost drift** — anonymous natural-language search means unbounded embedding calls from strangers. Mitigate with `query_cache`, a per-IP rate limit, and a daily cap that degrades gracefully to keyword-only search rather than erroring.
- **TMDB terms** — attribution required; the app is not endorsed or certified by TMDB. Footer notice plus logo.
- **Language** — film metadata is English. If the UI ships in pt-BR, either request `language=pt-BR` overviews from TMDB at ingest (and embed those instead) or accept a mixed-language experience. Pick one at ingest time; changing later means re-embedding the catalog.
