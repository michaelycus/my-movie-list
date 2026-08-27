-- Profiles for authenticated account holders (build-plan feature 7). One row
-- per Google-signed-in user, created automatically on first login by a
-- trigger on auth.users - no app-code round trip, no race with the OAuth
-- callback redirect. `role` stays plain 'user' here; seeding 'admin' from the
-- allowlist env var is deferred to whichever later feature (19/22) wires it
-- up, per project-overview.md's open question.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  role         text not null default 'user',
  created_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are readable by their owner"
  on profiles for select
  to authenticated
  using (id = auth.uid());

-- security definer: runs as the function owner, bypassing RLS, so the
-- trigger can insert into profiles on behalf of a brand-new auth.users row
-- that has no session yet to satisfy the owner-only select policy above.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
