-- Friend profiles owned by a signed-in host (build-plan feature 8). Only
-- display_name/avatar_emoji are written by this feature; the remaining
-- columns match project-overview.md's full data model up front so features
-- 9-11 (questionnaire, calibration, taste embedding) never need a schema
-- change to start writing to this table.
create table friends (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles(id) on delete cascade,
  display_name     text not null,
  avatar_emoji     text,
  answers          jsonb not null default '{}'::jsonb,
  hard_filters     jsonb not null default '{}'::jsonb,
  taste_embedding  extensions.vector(1536),
  taste_text       text,
  updated_at       timestamptz not null default now()
);

create index friends_owner_id_idx on friends (owner_id);

alter table friends enable row level security;

-- Single for-all policy: a friend is only ever read, created, edited, or
-- deleted by its owning host - no other role needs any access to this table.
create policy "friends are managed by their owner"
  on friends for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
