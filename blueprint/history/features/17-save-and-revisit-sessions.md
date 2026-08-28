# Current Feature

**Type:** Feature
**Build-plan item:** 17. Save and revisit sessions
**Branch:** feature/save-and-revisit-sessions

## Spec

Persist the session's chosen film and rationale (columns already exist on
`sessions` from the feature-12 migration, never written to yet), and add the
`/sessions` history list so a host can find past sessions again.

### Scope

- A server action that saves `chosen_movie_id` + `rationale` onto a session
  the caller owns.
- A "Save this pick" control wired to that action from the recommendations
  flow, once a rationale exists for the top pick.
- The session detail page shows a persisted "Tonight's pick" section when
  `chosenMovieId` is set, instead of re-asking to see recommendations.
- A new `/sessions` route: every session owned by the signed-in host, newest
  first, with title, date, and chosen film (poster + title) when set. Links to
  `/sessions/[id]`. Empty state + a "New session" CTA.
- Nav's "Sessions" link points at `/sessions` (the history) instead of
  `/sessions/new`; the list page itself carries the "New session" CTA.

### Out of scope

- Editing or un-choosing a saved pick (ship the one-way save; revisiting to
  change it is a later ask if it comes up).
- Feature 18 (seen list) - not touched here, though a chosen film is exactly
  the kind of fact that feature will want later.
- Any schema change - `sessions.chosen_movie_id` and `sessions.rationale`
  already exist.

### Data / contracts

- `chooseSessionFilm(sessionId: string, movieId: number, rationale: string | null): ActionResult`
  in `src/actions/sessions.ts`, matching the existing `ActionResult` shape.
  Verifies the session belongs to the caller (`owner_id = ownerId`, same
  pattern as `saveTonightsMood`) before updating. Revalidates
  `/sessions/${sessionId}` and `/sessions`.
- `getSessionList(ownerId: string): Promise<SessionListItem[]>` in
  `src/lib/sessions/list.ts`, a new `SessionListItem` type in
  `src/types/session.ts` (id, title, watchedOn, chosen film's id/title/poster
  path or null).

### Build steps

1. [x] **`chooseSessionFilm` server action** - ownership-checked update of
   `chosen_movie_id` + `rationale` on the `sessions` row; returns the shared
   `ActionResult` shape.
   Done when: calling it with a valid session/movie the caller owns persists
   both columns; a session owned by someone else, or a bad id, returns
   `{ success: false }` and writes nothing.

2. [x] **Wire "Save this pick" into the rationale UI** - `GroupPickRationale`
   gains a save button that appears once a rationale has been written for the
   shown movie, calls the action, and reflects a saved/error state. Session
   detail page renders a "Tonight's pick" section instead of
   `RecommendationsPanel` once `session.chosenMovieId` is set.
   Done when: generating a rationale then clicking save marks that session
   chosen in the database, and reloading `/sessions/[id]` shows the persisted
   pick instead of the "see recommendations" flow.

3. [x] **`/sessions` history list** - `getSessionList` query, `SessionListItem`
   type, and the `/sessions/page.tsx` route rendering the list (or an empty
   state) with a "New session" link; repoint the header's "Sessions" nav link
   from `/sessions/new` to `/sessions`.
   Done when: `/sessions` shows every session the signed-in host owns, newest
   first, each linking to its detail page; a host with no sessions sees the
   empty state and CTA instead of a blank page.

### Testing plan

`AGENTS.md` declares `npm test` (Vitest) as the test gate. In-scope logic here
is the ownership-checked update and the list-shaping query - both follow the
existing pattern in this codebase (`saveTonightsMood`, `getSessionDetail`)
which are exercised via integration/build evidence, not unit tests, because
they're thin Supabase-query wrappers with no branching logic worth asserting
in isolation. No new pure-logic module is introduced, so no new test file is
expected; steps ride on running `npm run build` plus a manual/browser check of
the save-then-list flow.

### UI/UX notes

Match existing session-page conventions: `border-border bg-surface` cards,
neon-cyan for the rationale/save affordance (mirrors the existing "Why this
pick?" button), neon-lime/amber only for score bars elsewhere - not
introduced here. List rows follow the poster-grid card pattern already used
by `PosterCard` where a chosen film exists.
