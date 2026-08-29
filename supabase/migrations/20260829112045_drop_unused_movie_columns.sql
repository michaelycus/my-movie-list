-- status is always 'Released' after ingest's own filter (see catalog.ts),
-- countries and original_title are captured at ingest but never read by any
-- app feature - confirmed via /audit before the full catalog ingest.
alter table movies
  drop column status,
  drop column countries,
  drop column original_title;
