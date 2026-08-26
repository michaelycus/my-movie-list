-- Backfill movies.search_doc (build-plan 5). The column and its GIN index
-- were created in 1a but never populated. 'simple' (no stemming) is
-- deliberate - the content is mostly proper nouns (titles, people), where
-- English stemming does more harm than good.
--
-- One-time UPDATE: the catalog is a static local ingest, not a live table.
-- A future top-up ingest (see project-overview.md's open questions) will
-- need to populate search_doc itself for any rows it adds.

update movies m
set search_doc = to_tsvector('simple',
  coalesce(m.title, '') || ' ' ||
  coalesce(
    (select string_agg(mc.person_name, ' ') from movie_cast mc where mc.movie_id = m.id),
    ''
  ) || ' ' ||
  coalesce(
    (select string_agg(cr.person_name, ' ') from movie_crew cr where cr.movie_id = m.id),
    ''
  )
);
