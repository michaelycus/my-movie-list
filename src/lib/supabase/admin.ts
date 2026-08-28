import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely - script/server-only.
 * Never import this into a Client Component, or anywhere `client.ts`/
 * `server.ts` are already used. Avoid it in a route handler that responds to
 * the browser too, with one narrow exception: the OAuth callback's admin-role
 * sync (build-plan feature 19a), which needs a privileged write `profiles`
 * deliberately has no RLS policy for, gated entirely on server-verified
 * session data and a server-only env var, never client input.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
