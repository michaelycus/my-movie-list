-- Film sessions (build-plan feature 12) and their participants. All columns
-- from project-overview.md's full data model are created up front so
-- features 13-17 (mood, recommendations, rationale, save/revisit) never need
-- a schema change to start writing to these tables - same approach as the
-- friends migration.
create table sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  title            text not null,
  watched_on       date not null default current_date,
  chosen_movie_id  bigint references movies(id) on delete set null,
  rationale        text,
  created_at       timestamptz not null default now()
);

create index sessions_owner_id_idx on sessions (owner_id);

alter table sessions enable row level security;

create policy "sessions are managed by their owner"
  on sessions for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- One row per person in the room. `friend_id` is null for the host's own row
-- (`is_host = true`) - the host is a profile, not a friend, and has no taste
-- profile to score against. `friend_id` goes null (not row-deleted) when the
-- underlying friend is later removed, so a session's participant history
-- keeps its shape.
create table session_participants (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  friend_id    uuid references friends(id) on delete set null,
  is_host      boolean not null default false,
  mood_tags    text[] not null default '{}',
  mood_note    text,
  constraints  jsonb not null default '{}'::jsonb
);

create index session_participants_session_id_idx on session_participants (session_id);

-- A friend can only be seated once per session - not enforced for the
-- nullable host row (friend_id is null there); the app itself guarantees
-- exactly one host row per session.
create unique index session_participants_unique_friend_idx
  on session_participants (session_id, friend_id)
  where friend_id is not null;

alter table session_participants enable row level security;

-- No owner_id on this table (see project-overview.md's data model) - RLS
-- joins through the parent session's owner_id instead.
create policy "session participants are managed by their session's owner"
  on session_participants for all
  to authenticated
  using (exists (
    select 1 from sessions s
    where s.id = session_participants.session_id
      and s.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from sessions s
    where s.id = session_participants.session_id
      and s.owner_id = auth.uid()
  ));
