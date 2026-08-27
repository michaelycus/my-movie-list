# Feature: Preference questionnaire

**From build-plan:** feature 9
**Status:** completed 2026-08-27

## Goal

Give a signed-in host a guided questionnaire for one friend that collects the
free-text and structured answers `project-overview.md` names for a taste
profile, and saves them to that friend's `answers` and `hard_filters` columns
(both already present on the `friends` table from feature 8, currently `{}`).
This is the input feature 11 (taste embedding) synthesises into a paragraph
and feature 14 (group recommendations) applies as hard filters - nothing past
this point can score or filter candidates without these answers existing.

## In scope

- New route `/friends/[id]/questionnaire`, matching the route inferred in
  `project-overview.md`.
- Nine questions from `project-plan.md` §9 (Q1-Q9; Q10 poster calibration is
  feature 10, out of scope here):
  - Q1 "What's a film you love, and why?" - required free text.
  - Q2 "Describe your perfect movie night in one sentence." - required free
    text.
  - Q3 "Anything you never want to watch?" - required free text + a "hard no"
    toggle.
  - Q4 mood you usually want - multi-select (fun, serious, inspiring, scary,
    action, romantic, mind-bending, feel-good, dark, weird).
  - Q5 new or classic - three-way (mostly recent / no preference / love the
    classics).
  - Q6 genres you love / genres you'd rather avoid - two multi-selects over
    the real `genres` table (via the existing `getGenres()`).
  - Q7 how long is too long - three-way (under 100 min / around 2h is fine /
    happily 3 hours).
  - Q8 subtitles - two-way (happy to read them / prefer dubbed-or-English).
  - Q9 content tolerance - three-way (keep it light / no strong preference /
    fine with heavy themes).
  - Q1-Q3 are required to submit; Q4-Q9 are optional.
- Deriving `hard_filters` from the structured answers at save time, per
  `project-overview.md`'s stated shape
  (`{max_runtime, min_age_ceiling, blocked_genres[], subtitles_ok}`):
  - Q7 -> `max_runtime` minutes: under 100 -> `100`, around 2h -> `150`,
    happily 3h -> `null` (no cap).
  - Q9 -> `min_age_ceiling`: keep it light -> `12`, the other two -> `null`
    (no ceiling), mirroring the `maxAge` filter shape features 5/6 already use.
  - Q6 avoid list -> `blocked_genres` (genre ids), directly, no LLM step.
  - Q8 -> `subtitles_ok` boolean.
- A pure, unit-tested `deriveHardFilters(answers)` function so the mapping
  above is tested logic, not buried in a Server Action.
- A `saveQuestionnaire` Server Action that validates input with Zod, computes
  `hard_filters`, and updates the friend's `answers`/`hard_filters`/
  `updated_at`, scoped by `owner_id` explicitly (not just RLS), matching the
  existing `friends.ts` actions.
- Loading a friend's existing answers (if any) to pre-fill the form on
  revisit.
- A link from each `FriendCard` to its questionnaire page.

## Out of scope

- Q10 poster calibration (feature 10) and the taste embedding / paragraph
  synthesis (feature 11) - this feature only stores raw answers and the
  directly-derivable hard filters.
- Mapping Q3's free-text "hard no" into blocked genres/keywords via an LLM
  call, which `project-plan.md` §9 mentions as a possible enhancement. That
  free text and its toggle are stored in `answers` for a later feature to use;
  adding an LLM parsing step here would be scope creep beyond what
  `project-overview.md`'s feature list and data model require. Noted as an
  open item, not built.
- Session-level questions (tonight's mood, tonight's note, youngest viewer) -
  those are feature 13, asked fresh each session, never stored on the friend.
- Any schema change - `friends.answers`/`hard_filters` already exist and are
  `{}` by default.
- Q6 "love" genres, Q4 mood, and Q5 recency are stored only in `answers` for
  now (they become score adjustments/embedding input in features 11 and 14),
  not part of `hard_filters`.

## Build steps

- [x] **Step 1 - Types, validation, and hard-filter derivation** -
  `src/types/questionnaire.ts`: `QuestionnaireAnswers` interface covering Q1-Q9
  (`lovedFilm: string`, `perfectNight: string`, `hardNo: string`,
  `hardNoIsBlocking: boolean`, `moods: string[]`, `recency: "recent" |
  "no-preference" | "classics"`, `lovedGenreIds: number[]`,
  `avoidGenreIds: number[]`, `runtimeTolerance: "under100" | "around2h" |
  "longOk"`, `subtitlesOk: boolean`, `contentTolerance: "light" |
  "no-preference" | "heavy"`) and a `HardFilters` interface matching
  `project-overview.md` (`maxRuntime: number | null`, `minAgeCeiling: number |
  null`, `blockedGenres: number[]`, `subtitlesOk: boolean`).
  `src/lib/friends/questionnaire.ts`: a Zod schema parsing raw `FormData`
  entries into `QuestionnaireAnswers` (Q1-Q3 required non-blank, capped at a
  reasonable length e.g. 500 chars; Q4-Q9 optional with defaults), exported as
  `parseQuestionnaireInput(raw)` returning the same `{success, data} |
  {success, error}` shape as `parseFriendInput`; and a pure
  `deriveHardFilters(answers: QuestionnaireAnswers): HardFilters` implementing
  the Q6/Q7/Q8/Q9 mapping above. *Done when:* `npm test` passes new unit
  tests for `deriveHardFilters` (all three runtime bands, all three content
  bands, avoid-genre passthrough, subtitles both ways) and for
  `parseQuestionnaireInput` (accepts a full valid submission, rejects each
  blank required field, accepts optional fields omitted).

- [x] **Step 2 - Friend detail loader** - `src/lib/friends/list.ts`: add
  `getFriend(id, ownerId)` selecting `id, display_name, avatar_emoji, answers`
  scoped by both `id` and `owner_id`, returning `null` when not found (wrong
  owner or missing id look the same, matching RLS's own behavior), mapped to
  a `FriendDetail` type (`Friend` fields + `answers: QuestionnaireAnswers |
  null`, treating a stored `{}` as `null`). *Done when:* `npx tsc --noEmit` is
  clean and a one-off script confirms `getFriend` scoped to one owner returns
  `null` for a friend id that belongs to a different owner.

- [x] **Step 3 - `saveQuestionnaire` Server Action** - `src/actions/friends.ts`:
  `saveQuestionnaire(friendId, formData)` following the existing
  `requireOwnerId` / UUID-validate / `{success, data, error}` pattern in this
  file, parsing with `parseQuestionnaireInput`, computing `hard_filters` with
  `deriveHardFilters`, and updating `answers`, `hard_filters`, `updated_at` on
  the row matched by `id` and `owner_id`. Calls `revalidatePath` on the
  friend's questionnaire route on success. *Done when:* `npx tsc --noEmit` is
  clean and `npm test` still passes.

- [x] **Step 4 - Questionnaire page and form UI** -
  `src/app/friends/[id]/questionnaire/page.tsx` (server component): reads the
  session the same way `/friends/page.tsx` does, loads the friend via
  `getFriend`, redirects/shows a not-found message when the friend doesn't
  belong to the signed-in host, loads `getGenres()` for the two genre
  multi-selects, and renders `QuestionnaireForm`.
  `src/components/friends/QuestionnaireForm.tsx` (client component): all nine
  questions grouped in required/optional sections, pre-filled from existing
  `answers` when present, submits via `useActionState` calling
  `saveQuestionnaire`, shows the validation error inline, shows a saved
  confirmation on success. Add a "Take questionnaire" / "Edit answers" link
  (depending on whether `answers` already exist) on each `FriendCard` pointing
  at `/friends/[id]/questionnaire`. *Done when:* `npm run build` is clean,
  and against the running app: opening the questionnaire for a friend with no
  answers shows blank required fields, submitting with a required field blank
  shows the validation error without saving, a full valid submission saves
  and revisiting the page shows the same answers pre-filled, and the
  `FriendCard` link text reflects whether answers already exist.

## Files / areas

- `src/types/questionnaire.ts` (new).
- `src/lib/friends/questionnaire.ts` (new), `questionnaire.test.ts` (new).
- `src/lib/friends/list.ts` - add `getFriend`.
- `src/actions/friends.ts` - add `saveQuestionnaire`.
- `src/app/friends/[id]/questionnaire/page.tsx` (new).
- `src/components/friends/QuestionnaireForm.tsx` (new).
- `src/components/friends/FriendCard.tsx` - add the questionnaire link.

## Testing

`npm test` (Vitest) is configured, so this is a gate. In-scope pure logic:
`deriveHardFilters` and `parseQuestionnaireInput` (Step 1) shipped 16 unit
tests in the same diff - 220/220 tests passing at completion. The
friend-detail loader's owner-scoping (Step 2), the Server Action (Step 3), and
the page/UI (Step 4) are integration/DB/UI, verified against the running app
and the live Supabase project: a temporary admin-client script inserted a
friend under one owner and confirmed the same query shape `getFriend` uses
returned `null` when scoped to a different owner id and the row when scoped
correctly, then cleaned up. `npx tsc --noEmit` and `npm run build` both clean,
with the new `/friends/[id]/questionnaire` route registered. `GET` to that
route unauthenticated returned `307` to `/auth/login?next=...`, matching
features 7/8's route-protection precedent. No Playwright in this project -
the dev server plus curl and build output served as evidence.

**Known gap:** the full signed-in click-through (opening the questionnaire,
submitting Q1-Q3, seeing the saved confirmation, revisiting to confirm
pre-fill, and the `FriendCard` link text changing to "Edit answers") was not
performed by the agent - it requires a real Google-authenticated browser
session, the same limitation noted in features 7 and 8's archives.

## Notes for the AI

- `friends.answers`/`hard_filters` already existed as `{}`-default jsonb
  columns from feature 8 - no migration was needed.
- `hasAnswers` is derived by checking `Object.keys(answers).length > 0`, since
  a saved submission always writes a full `QuestionnaireAnswers` object (every
  optional field gets a Zod default), so `{}` only ever means "never saved".
- Q3's free-text "hard no" is stored in `answers` but is **not** mapped to
  `blocked_genres`/keywords via an LLM call - that's an enhancement
  `project-plan.md` §9 floats, not a requirement of `project-overview.md`'s
  feature list or data model. A future feature can add that mapping without
  touching this feature's contract.
- Runtime/age-ceiling bucket boundaries (100/150 min, age 12) are a
  documented design choice in this archive, not derived from any other file -
  revisit them if feature 14's scoring needs different cut points.

## Findings

_No findings resolved by this feature._
