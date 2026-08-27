"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

async function getOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

/**
 * Starts the Google OAuth flow. On success this redirects the browser to
 * Google and never returns to the caller; the `{success, error}` result only
 * ever surfaces the failure case, so the login page can show it.
 */
export async function signInWithGoogle(next?: string) {
  const supabase = await createClient();
  const origin = await getOrigin();
  const safeNext = getSafeRedirectPath(next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return {
      success: false as const,
      error: error?.message ?? "Could not start Google sign-in.",
    };
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
