-- Logs a 'signup' usage_events row from the same trigger that creates a
-- new account's profiles row (build-plan feature 19b) - same function name
-- and signature (a trigger function always takes zero arguments), so this
-- is a true CREATE OR REPLACE, not a new overload (see the score_group
-- migration's comment on that exact pitfall). Both inserts run in the same
-- trigger invocation, so a signup and its usage event are never out of sync.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count int;
begin
  insert into profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Only log a signup when a profile row was actually created - the
  -- on conflict above is defensive against a hypothetical duplicate trigger
  -- fire, and that edge case should never produce a phantom second signup.
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    insert into usage_events (event_type, user_id, meta)
    values ('signup', new.id, '{}'::jsonb);
  end if;

  return new;
end;
$$;
