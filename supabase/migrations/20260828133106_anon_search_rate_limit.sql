-- Per-IP daily cap on anonymous semantic search (build-plan feature 20).
-- query_cache (6a) only saves repeat OpenAI calls for the *same* query
-- text - it does nothing to stop one anonymous visitor from burning
-- distinct embeddings all day. This counts those instead.
create table anon_search_limits (
  ip_hash text not null,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (ip_hash, day)
);

alter table anon_search_limits enable row level security;

-- No table policies at all, same as ingest_checkpoint: this holds only
-- hashed IPs and a counter, and is touched exclusively through the RPC
-- below, never a direct table query.
--
-- The RPC itself breaks from match_movies/score_group's `security invoker`
-- convention on purpose. Those functions only ever read tables anon/
-- authenticated already have grants on (movies, friends' own embeddings,
-- ...), so running as the caller is enough. This one needs to write to a
-- table with zero anon/authenticated grants - unlike query_cache, nothing
-- client-facing needs to read raw per-IP counts back out, so the table
-- stays ungranted and the function runs as its (privileged) owner instead.
create function increment_anon_search_count(p_ip_hash text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into anon_search_limits (ip_hash, day, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day)
  do update set count = anon_search_limits.count + 1
  returning count;
$$;

revoke all on function increment_anon_search_count(text) from public;
grant execute on function increment_anon_search_count(text) to anon, authenticated;

-- `db advisors` flags this as callable by anon/authenticated as a security
-- definer function - expected, same class of warning `handle_new_user()`
-- already carries. Calling it directly with an arbitrary p_ip_hash can only
-- push a hash's counter up early (degrades that bucket to keyword-only
-- search sooner), never read or expose anything - no data to leak, no
-- privilege gained.
