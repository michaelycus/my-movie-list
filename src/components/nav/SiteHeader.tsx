import Link from "next/link";
import { signOut } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  // getClaims(), not getUser(): src/proxy.ts already verifies the session
  // this way (locally, against a cached JWKS) for every request - getUser()
  // would add a second, redundant network round trip to Supabase's Auth
  // server on every page view, including the anonymous catalog/search pages.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const avatarUrl = claims?.user_metadata?.avatar_url;
  const fullName = claims?.user_metadata?.full_name;

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-8">
      <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
        CineMood
      </Link>
      {claims ? (
        <form action={signOut} className="flex items-center gap-3">
          <Link
            href="/friends"
            className="text-sm text-muted-foreground transition-colors hover:text-neon-cyan"
          >
            Friends
          </Link>
          <Link
            href="/sessions/new"
            className="text-sm text-muted-foreground transition-colors hover:text-neon-cyan"
          >
            Sessions
          </Link>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* Plain <img>, not next/image: Google serves avatars from several
                lh*.googleusercontent.com subdomains, not worth widening
                next.config's remotePatterns for one small header image. */}
            {typeof avatarUrl === "string" && (
              <img src={avatarUrl} alt="" width={24} height={24} className="rounded-full" />
            )}
            {typeof fullName === "string" ? fullName : claims.email}
          </span>
          <button
            type="submit"
            className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-neon-cyan hover:text-neon-cyan"
          >
            Sign out
          </button>
        </form>
      ) : (
        <Link
          href="/auth/login"
          className="rounded-full border border-neon-cyan px-3 py-1.5 text-sm text-neon-cyan transition-colors hover:bg-neon-cyan/10"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
