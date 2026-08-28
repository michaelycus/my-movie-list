# Current Feature

**Type:** Feature
**Build-plan item:** 19a. Usage-events schema & admin access (split from 19 - Admin usage dashboard)
**Branch:** feature/usage-events-admin-access

## Spec

Feature 19 (admin usage dashboard) needs a place to log events, a way to
become an admin, and a route only admins can reach - before any dashboard
content can exist. This step builds that foundation only. It's split the same
way 6 and 14 were: 19a lays the schema/access groundwork, 19b instruments the
real touchpoints, 19c builds the dashboard itself on top of both.

`role`'s admin-seeding mechanism was left as an explicit open question in
`project-overview.md` ("seeded from an allowlist env var... which build step
wires it up isn't explicit - likely folds into feature 19 or 22") and flagged
again in the `profiles` migration's own comment. This step resolves it: an
`ADMIN_EMAILS` env var, checked on sign-in.

### Scope

- `usage_events` table matching `project-overview.md`'s data model
  (`id`, `event_type`, `user_id` nullable, `meta jsonb`, `created_at`).
  RLS: insert allowed for everyone (`anon` and `authenticated` - anonymous
  search events need to log too), select restricted to `role = 'admin'`.
- `ADMIN_EMAILS` server-only env var: a comma-separated allowlist of emails.
  A pure `isAdminEmail(email, allowlist)` helper, wired into the OAuth
  callback route right after `exchangeCodeForSession` succeeds - promotes the
  signed-in user's `profiles.role` to `'admin'` when their email matches,
  self-healing on every login rather than only at first signup (so adding an
  email to the allowlist later still takes effect without a manual DB edit).
- `/admin` role-gated page. The route is already in `PROTECTED_PREFIXES`
  (`src/lib/supabase/middleware.ts`), so signed-out visitors already redirect
  to `/auth/login` - this step adds the missing role check for signed-in
  non-admins, and a minimal placeholder body proving the guard works. Real
  dashboard content is 19c.

### Out of scope

- Writing any `usage_events` rows from real app events (signup, session
  creation, search, film picks, LLM/embedding calls) - that's 19b.
- Any dashboard content, charts, or aggregation queries - that's 19c.
- A nav link to `/admin` - added once there's a real dashboard to link to
  (19c), not a guarded placeholder.
- Setting `ADMIN_EMAILS` itself in `.env.local` - that's the user's call
  (whose email(s) get admin access), not this step's to decide. The code
  defaults safely to "no admins" when the var is unset or empty.

### Data / contracts

- New table `usage_events`:
  `id uuid PK default gen_random_uuid()`, `event_type text not null`,
  `user_id uuid FK profiles nullable, on delete set null` (null covers
  anonymous events), `meta jsonb not null default '{}'`,
  `created_at timestamptz not null default now()`.
  RLS: `for insert to anon, authenticated with check (true)`;
  `for select to authenticated using (exists (select 1 from profiles p where
  p.id = auth.uid() and p.role = 'admin'))` - matches the self-read policy
  already on `profiles`, so no `security definer` needed.
- `isAdminEmail(email: string, allowlist: string | undefined): boolean` in
  `src/lib/auth/admin.ts` - splits `allowlist` on commas, trims, compares
  case-insensitively; empty/missing allowlist or email always returns false.
- `syncAdminRole(client, userId: string, email: string): Promise<void>` in
  the same file - best-effort (logged, not thrown, matching `seen.ts`'s
  pattern): when `isAdminEmail` matches and the stored role isn't already
  `'admin'`, updates `profiles.role`.
- `src/app/auth/callback/route.ts` calls `syncAdminRole` right after a
  successful `exchangeCodeForSession`, using the exchanged session's own
  claims (email, user id) - never a client-supplied value.
- `src/app/admin/page.tsx`: Server Component. No claims -> handled by
  middleware already. Claims but `profiles.role !== 'admin'` -> `notFound()`
  (matches `/sessions/[id]`'s existing convention of `notFound()` for a
  wrong-owner/missing session, rather than a redirect that would confirm the
  route exists to a non-admin poking at it). Admin -> renders a minimal
  placeholder heading.

### Build steps

1. [x] **`usage_events` migration** - table + RLS per the contract above.
   Done when: migration applies cleanly; an anon-key insert succeeds; an
   anon-key select returns 0 rows (or is denied); an authenticated non-admin
   select returns 0 rows; an authenticated admin select can see rows.
   Live-verified an important gotcha along the way: an anon `.insert()`
   chained with `.select()` fails RLS (Postgres applies SELECT policies to
   `RETURNING`, and anon has none here) even though the insert itself is
   valid - documented directly in the migration for 19b.

2. [x] **Admin role seeding on sign-in** - `isAdminEmail` + `syncAdminRole` in
   `src/lib/auth/admin.ts`, wired into the callback route.
   Done when: signing in with an email on `ADMIN_EMAILS` sets that profile's
   `role` to `'admin'`; signing in with an email not on the list leaves
   `role` at `'user'`; an unset/empty `ADMIN_EMAILS` promotes no one.
   `syncAdminRole` takes the service-role client, not the request-scoped one
   - `profiles` deliberately has no UPDATE policy for authenticated users, so
   a self-service "become admin" RLS path never exists to exploit; the actual
   security boundary is the server-only `ADMIN_EMAILS` check plus
   Supabase's own verified session-exchange result, never client input.

3. [x] **`/admin` route guard** - role check + placeholder page.
   Done when: a signed-out visitor hitting `/admin` still redirects to
   `/auth/login` (existing middleware behavior, unchanged); a signed-in
   non-admin gets a 404; a signed-in admin sees the placeholder page.
   Live-verified against the dev server: unauthenticated `GET /admin` ->
   `307` to `/auth/login?next=%2Fadmin`, matching `/friends`/`/sessions`
   exactly, no regression. The signed-in branches reuse the exact
   `getClaims()` + `notFound()` pattern already proven live on
   `/sessions/[id]`, plus the profiles self-read RLS and role-sync path
   already verified live in step 2 - no full OAuth session was scripted to
   click through the signed-in cases directly (not practical outside a real
   browser), so that's the one item on the manual try path below.

### Testing plan

`AGENTS.md` declares `npm test` (Vitest) as the test gate. In-scope logic:

- `isAdminEmail` (new pure function - allowlist parsing, trimming, case
  sensitivity, and the empty/missing cases are exactly the edge cases worth
  asserting) - new `src/lib/auth/admin.test.ts`.

`syncAdminRole` and the `/admin` page's role check are thin Supabase-query
wrappers with no branching logic worth asserting in isolation, matching the
existing convention (`saveTonightsMood`, `markParticipantsAsSeen`) -
exercised via live verification against the linked Supabase project (RLS and
the role-promotion path) plus a build/lint/typecheck pass, same as feature
18's precedent.

### UI/UX notes

`/admin`'s placeholder body only needs to prove the guard - plain heading and
a one-line "Dashboard coming soon" note, `border-border bg-surface` card
matching every other page's empty/placeholder state. No new tokens, no new
components.

## Outcome

Built and verified against the linked Supabase project
(`sdqupxnxeplnnlfqxycg`), not just locally:

- Migration applied cleanly via `npx supabase db push --linked`.
- `usage_events` RLS confirmed live: anon fire-and-forget insert succeeds,
  anon select returns 0 rows, service-role sees the row. A chained
  `.insert().select()` from anon correctly fails RLS (Postgres applies
  SELECT-policy visibility to `RETURNING`) - documented in the migration.
- `syncAdminRole` run against a real profile: no-op for a non-matching
  allowlist, promotes to `'admin'` on a match, idempotent on repeat, then the
  profile's original role was restored (no residual state left behind).
- Unauthenticated `GET /admin` against the dev server: `307` to
  `/auth/login?next=%2Fadmin`, identical to `/friends`/`/sessions`.
- `npx tsc --noEmit`, `npm test` (316/316, 7 new), `npm run lint` (clean, one
  pre-existing unrelated warning), `npm run build` all clean.
- Not directly exercised: a real signed-in browser session clicking through
  the admin/non-admin render branches of `/admin` (not practical to script
  outside a real OAuth flow). Those branches reuse the exact
  `getClaims()` + `notFound()` pattern already live on `/sessions/[id]`, plus
  the profiles self-read RLS and role-sync path verified above.

Checkpoint commits on `feature/usage-events-admin-access`: `bb98294`
(usage_events table + RLS), `e899896` (admin role seeding on sign-in),
`609719d` (admin route guard + placeholder page).

Known follow-up for 19b: don't chain `.select()` onto a `usage_events`
insert from anon/non-admin code - see the migration's own comment.

### Notes for the AI

Two real gotchas caught by live-verifying against the pushed migration and
real profile data, not just reading the code:

- **Postgres applies a table's SELECT policies to `INSERT ... RETURNING`.**
  supabase-js's `.insert().select()` requests `RETURNING`; without a matching
  SELECT policy for the caller's role, that fails with "new row violates row
  level security policy" even though the `WITH CHECK` on the insert itself
  passed. Plain `.insert({...})` (no `.select()`) uses
  `Prefer: return=minimal` and skips `RETURNING` entirely, avoiding the
  problem - the right shape for `usage_events`' fire-and-forget writes.
- **A privileged write with no client-safe RLS policy is a legitimate,
  narrow reason to use the service-role client from a route handler** - not
  a blanket exception, but specifically when the input driving the write is
  server-verified (here: Supabase's own session-exchange result plus a
  server-only env var), never client-controlled. Documented at both the call
  site and the admin client's own doc comment so the exception stays visible
  and doesn't quietly widen later.
