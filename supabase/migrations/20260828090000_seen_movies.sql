-- Seen list (build-plan feature 18): films a host or one of their friends has
-- already watched, so they stop resurfacing in that group's recommendations.
-- Rows are written automatically when a session's pick is saved
-- (chooseSessionFilm), never through a manual UI - see current-feature.md.
create table seen_movies (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references profiles(id) on delete cascade,
  friend_id uuid references friends(id) on delete cascade,
  movie_id  bigint not null references movies(id) on delete cascade,
  seen_on   date not null default current_date
);

create index seen_movies_owner_id_idx on seen_movies (owner_id);

-- friend_id null means the host themself saw it (host rows have no `friends`
-- row to point at, same convention session_participants uses). Two partial
-- unique indexes, not one plain unique index, because Postgres treats every
-- null as distinct - a plain unique index on (owner_id, friend_id, movie_id)
-- would let the host "see" the same film any number of times.
create unique index seen_movies_host_unique_idx
  on seen_movies (owner_id, movie_id)
  where friend_id is null;

create unique index seen_movies_friend_unique_idx
  on seen_movies (owner_id, friend_id, movie_id)
  where friend_id is not null;

alter table seen_movies enable row level security;

create policy "seen movies are managed by their owner"
  on seen_movies for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
