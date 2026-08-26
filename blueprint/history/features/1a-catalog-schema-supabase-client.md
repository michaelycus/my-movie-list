# Feature: Database schema & Supabase admin client

**From build-plan:** feature 1a (first sub-feature of 1. Film catalog ingest)
**Status:** completed 2026-08-26

## Goal

Stand up the Postgres schema the whole catalog depends on - `movies`, `genres`,
`movie_cast`, `movie_crew`, and `ingest_checkpoint` - with `pgvector` enabled and
RLS locked down correctly from the start, plus a service-role Supabase client
scripts can use to write to it. This is pure infrastructure: nothing user-facing
yet, but every later feature (browse, search, embeddings, sessions) reads or
writes through this schema, so its shape and its security posture need to be
right before any data lands.

## In scope

- Enabling the `vector` extension.
- Creating `movies`, `genres`, `movie_cast`, `movie_crew`, `ingest_checkpoint` per the shapes in `project-overview.md`.
- Enabling RLS on all five tables and adding public-read policies on the four catalog tables.
- Locking `ingest_checkpoint` to service-role-only access (no anon/authenticated policies).
- Indexes named in the overview: GIN on `genre_ids`, `keywords`, `search_doc`; HNSW on `embedding`.
- A `src/lib/supabase/admin.ts` service-role client factory for scripts (not app request code).

## Out of scope

- Populating any of these tables (feature 1b/1c).
- `friends`, `sessions`, `session_participants`, `seen_movies`, `profiles`, `query_cache`, `usage_events` - later features, once auth (7) exists.
- `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` - the `@supabase/ssr` request-scoped clients already scaffolded in the repo for the Next.js app's user-facing reads (feature 7 onward). This feature only adds the separate service-role `admin.ts` for scripts.
- shadcn/ui setup, `globals.css` theming - already scaffolded in the repo but unrelated to this feature; the neon token pass belongs to the first UI-facing feature (3).
- Any RPC functions (`match_movies`, `score_group`) - those land with embeddings (2) and group recommendations (14).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Supabase admin client** - add `tsx` (for running TS scripts directly) as a dependency (`@supabase/supabase-js` is already installed); write `src/lib/supabase/admin.ts` exporting a factory that builds a Supabase client from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (the service-role/secret key, separate from the publishable key `src/lib/supabase/client.ts` and `server.ts` already use), throwing a clear error if either is missing. Add a one-line comment marking it script/server-only - never import it into a Client Component, a route that ships to the browser, or anywhere `client.ts`/`server.ts` are used. *Done when:* `npm run build` typechecks cleanly, and calling the factory with both env vars set (real `SUPABASE_SECRET_KEY` added to `.env.local`) returns a working client.
- [x] **Step 2 - Schema migration** - run `supabase migration new create_catalog_schema` to scaffold a correctly named file under `supabase/migrations/`, then fill it in with the DDL in Data/contracts below: the `vector` extension, all five tables, RLS enabled on all five, public `select` policies on `movies`/`genres`/`movie_cast`/`movie_crew` (no policies at all on `ingest_checkpoint`), and the named indexes. *Done when:* `supabase db push` applies the migration to the linked project with no errors, and `supabase db advisors` (or the MCP `get_advisors` tool, whichever is available) reports no new security findings on these tables.

## Files / areas

- `src/lib/supabase/admin.ts` - new
- `supabase/migrations/<timestamp>_create_catalog_schema.sql` - new
- `package.json` - new dependency (`tsx`)

## Data / contracts

Locking this now because features 1b/1c/2/3/4/5/6 all read or write it.

```sql
create extension if not exists vector;

create table movies (
  id                bigint primary key,           -- TMDB id
  title             text not null,
  original_title    text,
  overview          text,
  tagline           text,
  release_date      date,
  runtime           int,
  original_language text,
  poster_path       text,
  backdrop_path     text,
  vote_average      numeric,
  vote_count        int,
  popularity        numeric,
  weighted_rating   numeric,
  min_age           smallint,                     -- null = unknown
  genre_ids         smallint[] not null default '{}',
  keywords          text[] not null default '{}',
  countries         text[] not null default '{}',
  status            text,
  search_doc        tsvector,
  embedding         vector(1536),                 -- populated by feature 2
  embedding_text    text,
  embedded_at       timestamptz
);
create index movies_genre_ids_idx on movies using gin (genre_ids);
create index movies_keywords_idx on movies using gin (keywords);
create index movies_search_doc_idx on movies using gin (search_doc);
create index movies_embedding_idx on movies using hnsw (embedding vector_cosine_ops);

create table genres (
  id   smallint primary key,
  name text not null
);

create table movie_cast (
  movie_id       bigint not null references movies(id) on delete cascade,
  person_name    text not null,
  character_name text,                            -- "character" is a reserved type name, avoid as a bare column name
  billing_order  smallint
);
create index movie_cast_movie_id_idx on movie_cast (movie_id);

create table movie_crew (
  movie_id    bigint not null references movies(id) on delete cascade,
  person_name text not null,
  job         text
);
create index movie_crew_movie_id_idx on movie_crew (movie_id);

create table ingest_checkpoint (
  source     text primary key,
  last_id    bigint,
  updated_at timestamptz not null default now()
);

alter table movies enable row level security;
alter table genres enable row level security;
alter table movie_cast enable row level security;
alter table movie_crew enable row level security;
alter table ingest_checkpoint enable row level security;

create policy "movies readable by everyone" on movies
  for select to anon, authenticated using (true);
create policy "genres readable by everyone" on genres
  for select to anon, authenticated using (true);
create policy "movie_cast readable by everyone" on movie_cast
  for select to anon, authenticated using (true);
create policy "movie_crew readable by everyone" on movie_crew
  for select to anon, authenticated using (true);
-- ingest_checkpoint: RLS enabled, no policies at all - only the service role
-- (which bypasses RLS) can read or write it. Internal bookkeeping only.
```

No insert/update/delete policies on the four catalog tables - the ingest script
writes through the service-role client, which bypasses RLS entirely, so the
public tables stay read-only from the API's perspective.

## Testing

No test command is configured yet (`AGENTS.md` Commands has no `test` entry), so
this ships on typecheck + CLI evidence, not unit tests:

- `npm run build` passes (typechecks `admin.ts` and the rest of the app).
- `supabase db push` succeeds against the linked project.
- `supabase db advisors` (or MCP `get_advisors`) run after the push, with any
  findings resolved or explicitly noted as accepted.
- A quick manual check that the four catalog tables are selectable with the
  anon key and `ingest_checkpoint` is not (e.g. via the Supabase dashboard's
  table editor or a throwaway `curl` against the REST endpoint).

## Notes for the AI

- `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from the existing SSR scaffold - public, RLS-scoped). `admin.ts` needs a third var, `SUPABASE_SECRET_KEY` (the service_role/secret key from Project Settings > API Keys) - the user is adding it. Never give it a `NEXT_PUBLIC_` prefix.
- Follow the Supabase skill's imperative-migration workflow: scaffold the file with `supabase migration new`, never hand-invent a migration filename.
- `movies.embedding` is defined now but stays `null` until feature 2 - don't try to populate it here.
- `admin.ts` is the one place `service_role` is used anywhere in the app; every other Supabase access (feature 7 onward) goes through the already-scaffolded `client.ts`/`server.ts`, using the publishable key, scoped by RLS.
- `.agents/`, shadcn/ui, and the `globals.css` rewrite were added outside this feature's scope (confirmed intentional by the user) - don't touch them here.
