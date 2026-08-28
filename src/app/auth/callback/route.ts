import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { syncAdminRole } from "@/lib/auth/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = getSafeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Admin promotion (build-plan feature 19a) needs the service-role
      // client, not the request-scoped one: `profiles` intentionally has no
      // UPDATE policy for authenticated users (only the security-definer
      // signup trigger writes it), so a self-service "become admin" RLS
      // policy is never on the table to exploit. The email/user id here are
      // Supabase's own verified session-exchange result, never client input,
      // and syncAdminRole itself no-ops unless that email is on the
      // server-only ADMIN_EMAILS allowlist - this is a narrow, justified
      // exception to "never use the admin client in a route handler".
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims;
      if (claims && typeof claims.sub === "string") {
        await syncAdminRole(createAdminClient(), claims.sub, claims.email as string | undefined);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth`);
}
