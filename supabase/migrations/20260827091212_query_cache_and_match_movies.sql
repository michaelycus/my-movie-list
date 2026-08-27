-- query_cache: caches OpenAI query embeddings by normalized query hash, so
-- repeat natural-language searches (build-plan 6b+) don't re-pay for an
-- embedding call. Internal cost-optimization bookkeeping, not user data -
-- RLS enabled with no policies, same pattern as ingest_checkpoint.
create table query_cache (
  query_hash text primary key,
  query_text text not null,
  embedding  extensions.vector(1536) not null,
  hits       int not null default 1,
  created_at timestamptz not null default now()
);

alter table query_cache enable row level security;

-- match_movies: pgvector cosine retrieval for natural-language search
-- (build-plan 6). Returns the same columns browse.ts's applyFilters() already
-- filters a plain movies select on, plus similarity, so a later merge step
-- can filter and rank the RPC's own results without a second query.
create or replace function match_movies(
  query_embedding extensions.vector(1536),
  match_count int default 200
)
returns table (
  id              bigint,
  title           text,
  poster_path     text,
  release_date    date,
  vote_average    numeric,
  weighted_rating numeric,
  popularity      numeric,
  genre_ids       smallint[],
  runtime         int,
  min_age         smallint,
  similarity      real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    m.id,
    m.title,
    m.poster_path,
    m.release_date,
    m.vote_average,
    m.weighted_rating,
    m.popularity,
    m.genre_ids,
    m.runtime,
    m.min_age,
    (1 - (m.embedding <=> query_embedding))::real as similarity
  from movies m
  where m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- movies is already anon-readable (see 1a), so the RPC mirrors that access -
-- security invoker means it runs with the caller's own (anon/authenticated)
-- privileges, not elevated ones.
grant execute on function match_movies(extensions.vector(1536), int) to anon, authenticated;
