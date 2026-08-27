import type { createClient } from "@/lib/supabase/server";

// getClaims(), not getUser(): verifies locally against a cached JWKS, same
// call src/proxy.ts and SiteHeader already use - no redundant Auth-server
// round trip per action call. Shared by every Server Action that mutates
// owner-scoped data (friends, sessions, ...).
export async function requireOwnerId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}
