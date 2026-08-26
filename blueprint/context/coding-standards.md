# Coding Standards

> CineMood's conventions: Next.js (App Router) + TypeScript + Tailwind v4 +
> Supabase (Postgres, `pgvector`, Auth). No Prisma - Supabase RLS is the data
> boundary. Package manager is npm.

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs)
- Use Server Actions for form submissions and simple mutations
- Use Route Handlers when you need:
  - Search and recommendation endpoints that call OpenAI/OpenRouter (natural-language search parsing, group ranking)
  - Webhooks (Supabase, TMDB, etc.)
  - Specific HTTP status codes or headers
  - Endpoints for future mobile/CLI clients
- Otherwise, fetch data directly in server components
- Dynamic routes for item/collection pages (film detail, session pages)

## File Organization

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- Route Handlers: `src/app/api/[route]/route.ts`
- Server Actions: `src/actions/[feature].ts`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts` (Supabase clients live in `src/lib/supabase/`)

## Naming

- Components: PascalCase (`ItemCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling
- Tailwind v4: CSS-first config (`@theme` in `globals.css`), no `tailwind.config.js`
- Use shadcn/ui components where applicable
- No inline styles
- Dark mode first, light mode as option

## Database

- Postgres via Supabase, with `pgvector` for embeddings (see `blueprint/project-plan.md` §4 for schema)
- Schema changes are checked-in SQL migrations under `supabase/migrations`, applied with the Supabase CLI - never edit the hosted schema by hand
- Ranking and retrieval that touch vectors run as Postgres RPC functions (`match_movies`, `score_group`), not client-side scoring, so ranking stays in the database
- Row-Level Security is on for every user-owned table (`friends`, `sessions`, `session_participants`, `seen_movies`); `movies`, `genres`, `movie_cast`, `movie_crew` are readable by `anon`

## Data Fetching

- Server components fetch directly with the Supabase server client (`@supabase/ssr`)
- Client components use Server Actions for mutations
- Validate all inputs with Zod
- Scope every user-owned query by `owner_id = auth.uid()`; never trust a client-supplied user id. RLS enforces this at the database level too, but application queries should not rely on RLS alone as the only check
- `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `TMDB_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only and must never reach a Client Component or be passed to the browser; only `NEXT_PUBLIC_SUPABASE_URL` and the anon key are public

## Error Handling

- Use try/catch in Server Actions
- Return `{ success, data, error }` pattern from actions
- Display user-friendly error messages via toast

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding: Vitest, with `vi.mock()` for external dependencies (Supabase
client, OpenAI/OpenRouter calls, TMDB API) and `vi.useFakeTimers()` for
time-dependent logic.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- If Playwright is already installed, or the Commands section of `AGENTS.md`
  declares a Playwright script, use Playwright for browser checks, screenshots,
  console-error checks, and user-flow verification.
- If Playwright is not installed, do not add it silently in the middle of an
  unrelated feature. Use the available dev server, browser screenshots, build
  output, API output, or manual verification evidence instead.
- Add Playwright only when the user asks for it, or when the current spec is
  explicitly about setting up browser automation.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
