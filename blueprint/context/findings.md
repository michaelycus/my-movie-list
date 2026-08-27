# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P2] unverified - `x-forwarded-host` trusted to build the OAuth redirect origin

**File:** src/actions/auth.ts:6-10
**Found:** 2026-08-27 by /audit (scope: current; lens: security)
**Why it matters:** `getOrigin()` prefers the client-supplied
`x-forwarded-host` header over `host` when building the `redirectTo` URL sent
to Supabase for the Google OAuth flow. This is Supabase's own documented
pattern for Next.js Server Actions, and it's mitigated by two layers this repo
can't verify: Vercel's edge is expected to overwrite a client-supplied
`x-forwarded-host` before the function sees it, and Supabase separately
rejects any `redirectTo` not on the project's configured Redirect URL
allowlist. Neither is confirmed from the codebase (no proxy/header-stripping
config here, no visibility into whether that allowlist includes a wildcard
pattern that would widen what an injected host could reach).
**Suggested fix:** Confirm the Supabase project's Redirect URL allowlist is
exact-match (no wildcard) for the production domain, and note that assumption
next to `getOrigin()`. No code change needed if the allowlist is already tight.
**Resolution:**
