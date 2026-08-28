-- Usage events (build-plan feature 19a, foundation for the admin usage
-- dashboard). Append-only analytics: anyone can log an event (anonymous
-- search included), only an admin can read them back. user_id is nullable so
-- an anonymous visitor's event still has somewhere to land.
create table usage_events (
  id         uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id    uuid references profiles(id) on delete set null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_event_type_idx on usage_events (event_type);
create index usage_events_created_at_idx on usage_events (created_at);

alter table usage_events enable row level security;

-- Insert-only for everyone (project-overview.md's data model): logging an
-- event must never require a role check, or anonymous search volume - one
-- of the dashboard's own headline numbers - could never be recorded.
--
-- Gotcha for callers (19b's instrumentation): never chain .select() onto an
-- insert here from anon/non-admin code. Postgres RLS applies the table's
-- SELECT policies to an INSERT's RETURNING output too, and only admins can
-- select usage_events - .select() would turn a valid, WITH-CHECK-passing
-- insert into a "new row violates row-level security policy" error, because
-- the inserting role can't see the row it just wrote. Plain
-- .insert({...}) (supabase-js's default Prefer: return=minimal, no
-- RETURNING) logs the event with no such check.
create policy "usage events can be logged by anyone"
  on usage_events for insert
  to anon, authenticated
  with check (true);

-- Same self-read pattern profiles already uses (id = auth.uid()), not a
-- security definer function - an admin reading their own profiles row to
-- check their own role satisfies that existing policy on its own.
create policy "usage events are readable by admins only"
  on usage_events for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
