-- Seen-list exclusion for score_group (build-plan feature 18, foreshadowed
-- in 14a's own comments): adds excluded_movie_ids as an additive named
-- parameter with a default, so existing callers that omit it are unaffected.
-- Postgres treats a changed parameter list as a distinct overload rather
-- than a true replacement - CREATE OR REPLACE would silently leave the old
-- 6-parameter signature in place alongside this one, which PostgREST cannot
-- disambiguate for named-argument RPC calls. Drop the old signature first so
-- exactly one score_group exists.
drop function if exists score_group(jsonb, int, smallint, smallint[], numeric, int);

create function score_group(
  embeddings          jsonb,
  max_runtime          int,
  min_age_ceiling      smallint,
  blocked_genres       smallint[],
  consensus_weight     numeric default 0.6,
  match_count          int default 10,
  excluded_movie_ids   bigint[] default '{}'
)
returns table (
  id                 bigint,
  title              text,
  poster_path        text,
  release_date       date,
  vote_average       numeric,
  weighted_rating    numeric,
  popularity         numeric,
  runtime            int,
  min_age            smallint,
  group_score        real,
  participant_scores real[]
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with participant_embeddings as (
    select
      ordinality as idx,
      (value::text)::extensions.vector(1536) as embedding
    from jsonb_array_elements(embeddings) with ordinality as t(value, ordinality)
  ),
  filtered as (
    select m.*
    from movies m
    where m.embedding is not null
      and (max_runtime is null or m.runtime <= max_runtime)
      and (min_age_ceiling is null or m.min_age <= min_age_ceiling)
      and not (m.genre_ids && blocked_genres)
      and not (m.id = any(excluded_movie_ids))
  ),
  scored as (
    select
      f.id,
      f.title,
      f.poster_path,
      f.release_date,
      f.vote_average,
      f.weighted_rating,
      f.popularity,
      f.runtime,
      f.min_age,
      array_agg((1 - (f.embedding <=> pe.embedding))::real order by pe.idx) as participant_scores
    from filtered f
    cross join participant_embeddings pe
    group by f.id, f.title, f.poster_path, f.release_date, f.vote_average,
             f.weighted_rating, f.popularity, f.runtime, f.min_age
  )
  select
    s.id,
    s.title,
    s.poster_path,
    s.release_date,
    s.vote_average,
    s.weighted_rating,
    s.popularity,
    s.runtime,
    s.min_age,
    -- Least-misery aggregation (project-overview.md §5.2): consensus_weight
    -- weights the room's average fit, the remainder weights the least-happy
    -- participant's fit, so a film three people love and one hates doesn't
    -- win just on the average.
    (
      consensus_weight * (
        select avg(x) from unnest(s.participant_scores) as x
      ) + (1 - consensus_weight) * (
        select min(x) from unnest(s.participant_scores) as x
      )
    )::real as group_score,
    s.participant_scores
  from scored s
  order by group_score desc, s.weighted_rating desc nulls last, s.popularity asc nulls last
  limit match_count;
$$;

grant execute on function score_group(jsonb, int, smallint, smallint[], numeric, int, bigint[]) to authenticated;
