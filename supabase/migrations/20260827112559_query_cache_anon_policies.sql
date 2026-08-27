-- Corrects an oversight from the query_cache_and_match_movies migration
-- (build-plan 6a): query_cache was given zero RLS policies, mirroring
-- ingest_checkpoint's "service-role only" pattern. That's right for
-- ingest_checkpoint (touched only by the offline ingest script via the
-- admin client), but wrong here - query_cache is read and written by the
-- live, anonymous-facing /api/search route (build-plan 6d), which uses the
-- ordinary request-scoped Supabase client, never the admin client (see
-- src/lib/supabase/admin.ts's own doc comment on why not). The fix is
-- granting anon/authenticated access on query_cache itself, the same way
-- movies/genres already are - it holds no PII, just query text, an
-- embedding, and a hit count, so public read/write on this one cache table
-- is a low-risk, appropriate trade.
create policy "query_cache readable by everyone" on query_cache
  for select to anon, authenticated using (true);
create policy "query_cache insertable by everyone" on query_cache
  for insert to anon, authenticated with check (true);
create policy "query_cache updatable by everyone" on query_cache
  for update to anon, authenticated using (true) with check (true);
