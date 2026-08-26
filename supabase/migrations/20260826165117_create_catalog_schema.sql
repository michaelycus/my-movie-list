-- Film catalog schema: movies, genres, cast, crew, and ingest bookkeeping.
-- Populated by the ingest pipeline (build-plan 1b/1c); embeddings land in 2.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

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
  embedding         extensions.vector(1536),      -- populated by feature 2
  embedding_text    text,
  embedded_at       timestamptz
);
create index movies_genre_ids_idx on movies using gin (genre_ids);
create index movies_keywords_idx on movies using gin (keywords);
create index movies_search_doc_idx on movies using gin (search_doc);
create index movies_embedding_idx on movies using hnsw (embedding extensions.vector_cosine_ops);

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
-- (which bypasses RLS) can read or write it. Internal bookkeeping only, never
-- exposed to anon/authenticated.
