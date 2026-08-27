# Feature: Google sign-in

**From build-plan:** feature 7
**Status:** completed 2026-08-27

## Goal

Let a visitor sign in with Google, get a `profiles` row created automatically on
first login, and have the (not-yet-built) account-owned routes redirect an
anonymous visitor to sign in instead of loading. This is the funnel from
anonymous browsing into the authenticated "friends + sessions" flow - nothing
downstream (features 8+) can be built without it.

## In scope

- `profiles` table (per `project-overview.md`'s data model) with RLS limited to
  the owning row.
- A Postgres trigger that inserts the `profiles` row automatically when a new
  `auth.users` row is created (first Google login) - no app-code round trip,
  no race with the redirect back from Google.
- `/auth/login` page with a "Continue with Google" action.
- `/auth/callback` Route Handler that exchanges the OAuth code for a session
  and redirects on, safely, to wherever the visitor was headed.
- A sign-out Server Action.
- A minimal site header showing sign-in/sign-out state, since the feature has
  no other visible entry point.
- Root `middleware.ts`, replacing the scaffolded one that currently protects
  *every* route, so only account-owned prefixes (`/friends`, `/sessions`,
  `/admin` - the routes named in `project-overview.md` that don't exist yet)
  require a session; the public catalog and search stay open to anonymous
  visitors.

## Out of scope

- Friend CRUD, questionnaire, sessions, admin dashboard (features 8-19) - this
  feature only builds the door those walk through.
- Seeding the admin `role` from the allowlist env var - `project-overview.md`
  flags this as unresolved which step owns it; deferred to whichever of
  feature 19/22 actually needs it, so it isn't invented here.
- Editing profile fields (display name, avatar) after creation - not a listed
  feature; the trigger seeds them once from the Google account and that's all
  v1 needs.
- Linking/unlinking additional auth providers, email/password auth - Google
  only, per the plan.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `profiles` table, RLS, and auto-create trigger** - New
  migration under `supabase/migrations/`: `profiles` (`id uuid primary key
  references auth.users(id) on delete cascade`, `email text not null`,
  `display_name text`, `avatar_url text`, `role text not null default
  'user'`, `created_at timestamptz not null default now()`); RLS enabled with
  one policy, `select` where `id = auth.uid()`. A `security definer` function
  `handle_new_user()` reads `new.email`, `new.raw_user_meta_data->>'full_name'`,
  `new.raw_user_meta_data->>'avatar_url'` and inserts the row (`on conflict
  (id) do nothing`, so a re-auth never errors); an `after insert on auth.users`
  trigger calls it. *Done when:* `npx supabase db push` applies cleanly, and
  `select tgname from pg_trigger where tgname = 'on_auth_user_created'`
  (via the Supabase SQL editor or a one-off script using `createAdminClient`)
  confirms the trigger exists. Full end-to-end proof (a real login actually
  creating the row) happens in Step 4's done-when, once there's a login page
  to trigger it.

- [x] **Step 2 - Sign-in/out Server Actions** - `src/actions/auth.ts`:
  `signInWithGoogle(next?: string)` calls `supabase.auth.signInWithOAuth({
  provider: "google", options: { redirectTo: \`${origin}/auth/callback?next=
  ${encodeURIComponent(safeNext)}\`, skipBrowserRedirect: true } })` from a
  server client, then `redirect(data.url)` to send the browser to Google's
  consent screen (the Server Action can't return a normal `{success,data,
  error}` here since a successful call always redirects, matching the
  existing exception for redirect-driving actions); on error, returns
  `{success: false, error}` so the login page can show it. `signOut()` calls
  `supabase.auth.signOut()` then `redirect("/")`. Add `getSafeRedirectPath(next:
  string | null | undefined): string` in `src/lib/auth/redirect.ts` - returns
  `next` only if it starts with a single `/` and not `//` (blocks
  protocol-relative and absolute-URL open redirects), else `"/"`. *Done when:*
  `npm test` passes new unit tests for `getSafeRedirectPath` covering
  `null`/`undefined`/empty, a plain path (`/friends`), a protocol-relative
  path (`//evil.com`), and an absolute URL (`https://evil.com`).

- [x] **Step 3 - OAuth callback route** - `src/app/auth/callback/route.ts`
  (`GET`): reads `code` and `next` from the URL, calls
  `supabase.auth.exchangeCodeForSession(code)` with a server client, and
  redirects to `getSafeRedirectPath(next)` on success or to
  `/auth/login?error=auth` when `code` is missing or the exchange fails.
  *Done when:* hitting the callback with no `code` redirects to
  `/auth/login?error=auth` instead of throwing.

- [x] **Step 4 - Login page and site header** - `src/app/auth/login/page.tsx`:
  reads `?next`, shows the CineMood mark, a "Continue with Google" button
  (a `<form action={signInWithGoogle.bind(null, next)}>` submit), and an error
  message when `?error=auth` is present. Add `src/components/nav/SiteHeader.tsx`
  (server component): fetches the current user server-side, renders the
  CineMood wordmark plus, when signed in, the Google avatar/display name and a
  sign-out form button, or a "Sign in" link to `/auth/login` when signed out.
  Wire `SiteHeader` into `src/app/layout.tsx` above `{children}`. *Done when:*
  signing in with Google end-to-end lands back on the original page signed
  in, the header reflects the signed-in state, `select * from profiles` shows
  the new row with the right email/display name/avatar, signing out returns
  to signed-out state, and re-login after sign-out reuses the same profile
  row (no duplicate/error) - proving Step 1's trigger and `on conflict`
  clause hold up against a real second login.

- [x] **Step 5 - Route protection middleware** - Rewrite
  `src/lib/supabase/middleware.ts`'s `updateSession` to redirect to
  `/auth/login?next=<pathname+search>` only when there's no session *and* the
  request path matches a protected prefix (`/friends`, `/sessions`, `/admin`),
  via a small exported `isProtectedPath(pathname: string): boolean` instead of
  the current "protect everything except `/login`/`/auth`" default. Add
  `src/proxy.ts` calling `updateSession` from the `proxy` export (this
  version of Next.js renamed the `middleware` file convention to `proxy` -
  see Files/areas), with the standard matcher excluding `_next/static`,
  `_next/image`, favicon, and common image extensions. *Done when:* `npm test` passes new unit tests for
  `isProtectedPath` (matches `/friends`, `/friends/123`, `/sessions`,
  `/sessions/new`, `/admin`; does not match `/`, `/films/123`, `/api/search`,
  `/auth/login`), and, against the running app, an unauthenticated visit to
  `/friends` redirects to `/auth/login?next=%2Ffriends` while `/` and
  `/films/1` still load with no session.

## Files / areas

- `supabase/migrations/` (new migration) - `profiles` table, RLS, trigger.
- `src/actions/auth.ts` (new) - `signInWithGoogle`, `signOut`.
- `src/lib/auth/redirect.ts` (new) - `getSafeRedirectPath`.
- `src/lib/auth/redirect.test.ts` (new).
- `src/app/auth/callback/route.ts` (new).
- `src/app/auth/login/page.tsx` (new).
- `src/components/nav/SiteHeader.tsx` (new).
- `src/app/layout.tsx` - mounts `SiteHeader`.
- `src/lib/supabase/middleware.ts` - replace the blanket redirect with
  `isProtectedPath`.
- `src/lib/supabase/middleware.test.ts` (new) - `isProtectedPath` cases.
- `src/proxy.ts` (new) - invokes `updateSession`. Named `proxy.ts`, not
  `middleware.ts` - this Next.js version (16) deprecated and renamed the
  `middleware` file convention to `proxy` (confirmed against
  `node_modules/next/dist/docs`, and via a real `next build` warning).
  Lives under `src/`, not the project root, since this project's `app/`
  directory is inside `src/` and Next.js requires the file at the same level.

## Data / contracts

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by their owner"
  on public.profiles for select
  using (id = auth.uid());
```

```ts
// src/lib/auth/redirect.ts
export function getSafeRedirectPath(next: string | null | undefined): string;

// src/lib/supabase/middleware.ts
export function isProtectedPath(pathname: string): boolean;
```

`role` stays plain `'user'` for every row created by this feature - no
allowlist wiring here (see Out of scope).

## Testing

`npm test` (Vitest) is configured, so this is a gate. In-scope pure logic:
`getSafeRedirectPath` (Step 2) and `isProtectedPath` (Step 5) both ship unit
tests per their done-whens - 202/202 tests passing at completion. The trigger,
Server Actions, callback route, login page, and header all call Supabase/OAuth
directly and are integration/UI - verified against the real running app and
the live Supabase project (migration pushed with `npx supabase db push`,
trigger confirmed on `auth.users`; `npm run build` clean with no warnings).
No Playwright in this project - the dev server plus curl and a Supabase query
served as evidence, matching the precedent set in features 5-6.

**Known gap:** the full live click-through (sign in with a real Google
account, confirm the `profiles` row and header update, sign out, re-login
reusing the same row) was not performed by the agent - it requires a real
Google account in a browser. Steps 1-3 and 5 were proven independently; Step
4's live round-trip is the one piece that still wants a human `/try` pass, and
also depends on the Google provider being enabled in the Supabase Dashboard
(no `supabase/config.toml` in this repo tracks that).

## Notes for the AI

- **External prerequisite, not part of this diff:** the Google provider must
  be enabled for this Supabase project (Dashboard -> Authentication ->
  Providers -> Google, with a Google Cloud OAuth client ID/secret and the
  Supabase callback URL registered as an authorized redirect URI). There's no
  `supabase/config.toml` in this repo, so provider config isn't
  version-controlled - confirm with the user whether this is already done
  before Step 4's end-to-end done-when; if it isn't, Steps 1-3 and 5 can
  still be built and unit-tested, but Step 4's live-login proof blocks on it.
- The existing `src/lib/supabase/middleware.ts` is unused scaffold code (no
  root `middleware.ts` calls it yet) that protects *every* route by default -
  wrong for this app (anonymous browsing/search is explicitly a no-account
  feature). Step 5 fixes this rather than wiring the scaffold in as-is.
- Use the server client (`src/lib/supabase/server.ts`), never
  `createAdminClient()`, for anything in a Server Action or Route Handler
  that runs on behalf of the signed-in visitor - RLS should still apply. The
  trigger is the one place that needs to bypass RLS, and `security definer`
  handles that at the database level without touching the service-role key.
- `next` is attacker-controlled input (an OAuth redirect param) - always
  round-trip it through `getSafeRedirectPath`, never interpolate it into a
  redirect directly.
- No shadcn/ui primitives exist in this codebase yet (see feature 5's
  precedent) - hand-roll the login button and header on the existing
  Tailwind neon-dark tokens rather than installing shadcn mid-feature.
- `SiteHeader` reads the session via `supabase.auth.getClaims()`, not
  `getUser()` - `getClaims()` verifies locally against a cached JWKS, matching
  `src/proxy.ts`'s `updateSession`, while `getUser()` would add a second
  network round trip to Supabase's Auth server on every single page render
  (see Findings F-01 below).

## Findings

Resolved during this feature's `/audit` pass and closed before completion:

### 07/F-01 [P1] closed - SiteHeader duplicates the auth check proxy.ts already does, on every page

**File:** src/components/nav/SiteHeader.tsx:6-8
**Found:** 2026-08-27 by /audit (scope: current; lens: performance)
**Why it matters:** `SiteHeader` called `supabase.auth.getUser()`, which always
makes a network round trip to Supabase's Auth server to revalidate the JWT.
`src/proxy.ts`'s `updateSession` already establishes the session for the same
request via `getClaims()`, which verifies locally against a cached JWKS (no
per-request network call). Because `SiteHeader` renders in the root layout,
every page view - including the anonymous-facing catalog and search pages
this project is explicitly optimized for - paid a second, redundant
Auth-server round trip on top of the one `proxy.ts` already performs.
**Suggested fix:** Use `supabase.auth.getClaims()` in `SiteHeader` (the same
call `proxy.ts` already uses) and read `claims.email` /
`claims.user_metadata.avatar_url` / `claims.user_metadata.full_name` instead
of fetching the full `User` object again.
**Resolution:** Rewrote `SiteHeader` to call `supabase.auth.getClaims()`
instead of `getUser()`, matching `proxy.ts`'s existing pattern - no more
second Auth-server round trip per page. Re-verified: `npx tsc --noEmit` clean,
`npm test` 202/202, `npm run build` clean, and live behavior unchanged
(`/friends` still redirects, signed-out header still renders "Sign in").

### 07/F-02 [P3] closed - `full_name` rendered without the type guard `avatar_url` gets

**File:** src/components/nav/SiteHeader.tsx:27
**Found:** 2026-08-27 by /audit (scope: current; lens: quality)
**Why it matters:** `user_metadata` is typed `{ [key: string]: any }` by
supabase-js. `avatar_url` was guarded with `typeof ... === "string"` before
use, but `full_name` wasn't - a non-string value there would have passed
straight through as a React child and crashed the header.
**Suggested fix:** Guard `full_name` the same way `avatar_url` is guarded.
**Resolution:** Fixed alongside F-01 - `fullName` is now guarded with
`typeof fullName === "string"` before rendering, falling back to
`claims.email` otherwise. Re-verified in the same pass as F-01.
