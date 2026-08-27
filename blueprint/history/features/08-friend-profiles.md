# Feature: Friend profiles

**From build-plan:** feature 8
**Status:** completed 2026-08-27

## Goal

Let a signed-in host create, rename, edit, and delete friend records under
their own account, from a new `/friends` page. This is the first piece of the
"friends + sessions" flow (features 9-18 all hang friend data off the rows
created here) - nothing past this point can be built without somewhere to
store a friend.

## In scope

- `friends` table (per `project-overview.md`'s data model) with RLS scoped to
  `owner_id = auth.uid()` for every operation (select/insert/update/delete).
- Only the fields this feature actually populates: `display_name`,
  `avatar_emoji`. The remaining columns in the full data model
  (`answers`, `hard_filters`, `taste_embedding`, `taste_text`) are created now
  (later features need the columns to exist) but stay `null`/default until
  features 9-11 write to them.
- Server Actions to create, rename/edit, and delete a friend, each requiring
  an authenticated owner and scoping every query by `owner_id` in the
  application code, not just relying on RLS (per `coding-standards.md`).
- `/friends` page: list of the signed-in host's friends, an add-friend form,
  inline rename/edit, and delete with confirmation.
- A "Friends" link in `SiteHeader` for signed-in visitors, so the page is
  reachable (`/friends` is already a protected prefix in
  `src/lib/supabase/middleware.ts` from feature 7 - no middleware change
  needed here).

## Out of scope

- Preference questionnaire, poster calibration, taste embedding (features
  9-11) - this feature only creates the friend row those write onto.
- Any use of `answers`/`hard_filters`/`taste_embedding`/`taste_text` beyond
  creating the columns.
- Sessions, mood, recommendations (features 12+).
- An emoji picker UI - `avatar_emoji` is a plain optional text input in this
  feature; a curated picker isn't in the feature description and would be
  scope creep.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - `friends` table and RLS** - New migration under
  `supabase/migrations/`: `friends` (`id uuid primary key default
  gen_random_uuid()`, `owner_id uuid not null references profiles(id) on
  delete cascade`, `display_name text not null`, `avatar_emoji text`,
  `answers jsonb not null default '{}'::jsonb`, `hard_filters jsonb not null
  default '{}'::jsonb`, `taste_embedding extensions.vector(1536)`,
  `taste_text text`, `updated_at timestamptz not null default now()`), plus
  an index on `owner_id`. RLS enabled with one `for all` policy scoped to
  `owner_id = auth.uid()` (`using` and `with check` both), matching
  `project-overview.md`'s stated policy shape. *Done when:* `npx supabase db
  push` applies cleanly, and a query against `pg_policies` (via the Supabase
  SQL editor or a one-off script using `createAdminClient`) confirms RLS is
  enabled on `friends` with the owner-scoped policy.

- [x] **Step 2 - Validation and types** - `src/lib/friends/validation.ts`:
  `parseFriendInput(raw: { displayName: unknown; avatarEmoji: unknown })`
  using a Zod schema (`displayName`: trimmed string, 1-40 chars;
  `avatarEmoji`: optional trimmed string, max 8 chars, empty string treated
  as absent), returning `{success:true, data} | {success:false, error}` with
  a user-facing message on failure. `src/types/friend.ts`: `Friend` interface
  (`id`, `displayName`, `avatarEmoji: string | null`, `updatedAt`). *Done
  when:* `npm test` passes new unit tests for `parseFriendInput` covering a
  valid name, a blank/whitespace-only name, a name over 40 chars, trimming,
  and an over-length emoji field.

- [x] **Step 3 - Server Actions and list query** - `src/actions/friends.ts`:
  `createFriend(formData)`, `updateFriend(friendId, formData)`,
  `deleteFriend(friendId)`, each reading the current user via
  `supabase.auth.getClaims()`, returning `{success:false, error:"Sign in to
  manage friends."}` when there's no session, validating input with
  `parseFriendInput` (and `friendId` as a UUID) before any query, scoping
  every insert/update/delete by `owner_id` explicitly in the query (not just
  via RLS), and calling `revalidatePath("/friends")` on success. Return
  `{success, data, error}` per `coding-standards.md`. `src/lib/friends/list.ts`:
  `getFriends(ownerId)` selects `id, display_name, avatar_emoji, updated_at`
  scoped by `owner_id`, ordered by `display_name`, mapped to `Friend[]`.
  *Done when:* `npx tsc --noEmit` is clean and a manual check (Supabase SQL
  editor or a one-off script) confirms a row inserted for one owner is not
  returned by a `getFriends` call scoped to a different owner id.

- [x] **Step 4 - `/friends` page and components** - `src/app/friends/page.tsx`
  (server component): reads the session, calls `getFriends(ownerId)`, renders
  an add-friend form and the friend list. `src/components/friends/AddFriendForm.tsx`
  (client component): name + optional emoji inputs, calls `createFriend` via
  `useActionState`, shows the validation error inline, clears on success.
  `src/components/friends/FriendList.tsx` and `FriendCard.tsx` (client):
  each card shows the name/emoji with an edit toggle (reuses the same fields
  as the add form, calls `updateFriend`) and a delete button that confirms
  before calling `deleteFriend`. Add a "Friends" link to
  `src/components/nav/SiteHeader.tsx`, shown only when signed in. *Done
  when:* `npm run build` is clean, and against the running app: signing in
  and visiting `/friends` shows an empty state, adding a friend shows it in
  the list, renaming and deleting both update the list without a full reload
  glitch, and an invalid name (blank) shows the validation error instead of
  submitting.

## Files / areas

- `supabase/migrations/` (new migration) - `friends` table, RLS.
- `src/types/friend.ts` (new).
- `src/lib/friends/validation.ts` (new), `validation.test.ts` (new).
- `src/lib/friends/list.ts` (new) - `getFriends`.
- `src/actions/friends.ts` (new) - `createFriend`, `updateFriend`, `deleteFriend`.
- `src/app/friends/page.tsx` (new).
- `src/components/friends/AddFriendForm.tsx` (new).
- `src/components/friends/FriendList.tsx` (new).
- `src/components/friends/FriendCard.tsx` (new).
- `src/components/nav/SiteHeader.tsx` - add the "Friends" link.

## Data / contracts

```sql
create table public.friends (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  display_name     text not null,
  avatar_emoji     text,
  answers          jsonb not null default '{}'::jsonb,
  hard_filters     jsonb not null default '{}'::jsonb,
  taste_embedding  extensions.vector(1536),
  taste_text       text,
  updated_at       timestamptz not null default now()
);

create index friends_owner_id_idx on public.friends (owner_id);

alter table public.friends enable row level security;

create policy "friends are managed by their owner"
  on public.friends for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

```ts
// src/lib/friends/validation.ts
export function parseFriendInput(raw: { displayName: unknown; avatarEmoji: unknown }):
  | { success: true; data: { displayName: string; avatarEmoji: string | null } }
  | { success: false; error: string };

// src/lib/friends/list.ts
export async function getFriends(ownerId: string): Promise<Friend[]>;

// src/actions/friends.ts
export async function createFriend(formData: FormData): Promise<{success:boolean; data?:{id:string}; error?:string}>;
export async function updateFriend(friendId: string, formData: FormData): Promise<{success:boolean; error?:string}>;
export async function deleteFriend(friendId: string): Promise<{success:boolean; error?:string}>;
```

## Testing

`npm test` (Vitest) is configured, so this is a gate. In-scope pure logic:
`parseFriendInput` (Step 2) shipped 7 unit tests per its done-when -
209/209 tests passing at completion. The migration, Server Actions, list
query, and UI are integration/DB/UI - verified against the real running app
and the live Supabase project: migration pushed with `npx supabase db push`;
RLS confirmed via `pg_policies` (`rowsecurity = true`, owner-scoped `for all`
policy present); owner-scoping confirmed with a temporary admin-client script
that inserted a row for the real owner and showed it invisible to a query
scoped to a different owner id, then cleaned the row up. `npx tsc --noEmit`
and `npm run build` both clean. No Playwright in this project - the dev
server plus curl and build output served as evidence, matching the precedent
set in features 5-7.

**Known gap:** the full signed-in click-through (add/rename/delete a friend
as a real Google-authenticated user, confirm the list updates, confirm the
inline validation error) was not performed by the agent - it requires a real
Google session in a browser, same limitation noted in feature 7's archive.
The unauthenticated path was verified live: `GET /friends` returns `307` to
`/auth/login?next=%2Ffriends`, matching feature 7's route protection.

## Notes for the AI

- Use the server client (`src/lib/supabase/server.ts`) in Server Actions and
  the page, never `createAdminClient()` - RLS should still apply. Explicit
  `owner_id` scoping in every query is defense in depth on top of RLS, per
  `coding-standards.md`, not a replacement for it.
- Read the session the same way `SiteHeader` does - `supabase.auth.getClaims()`,
  not `getUser()` - to avoid the redundant Auth-server round trip flagged in
  finding 07/F-01.
- `friendId` arrives as a Server Action argument from client-rendered
  markup - validate it's a UUID before using it in a query, same discipline
  as `parseMovieId` in `src/lib/movies/detail.ts`.
- No shadcn/ui primitives exist in this codebase (feature 5/7 precedent) -
  hand-roll the forms and cards on the existing Tailwind neon-dark tokens.
- `middleware.ts`/`src/proxy.ts` already protects `/friends` (feature 7) -
  no changes needed there.
