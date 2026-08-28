import type { SupabaseClient } from "@supabase/supabase-js";

/** Checks a signed-in email against the ADMIN_EMAILS allowlist (comma-
 * separated, case-insensitive). Missing/empty allowlist or email always
 * returns false - the safe default is no admins, not "open to everyone". */
export function isAdminEmail(email: string | null | undefined, allowlist: string | undefined): boolean {
  if (!email || !allowlist) return false;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(normalizedEmail);
}

/** Promotes a signed-in user's stored role to 'admin' when their email is on
 * ADMIN_EMAILS - called on every sign-in (not just first signup) so adding
 * an email to the allowlist later takes effect on that person's next login,
 * no manual DB edit needed. Best-effort: errors are logged, never thrown,
 * matching seen.ts's pattern - a role-sync failure must never break sign-in. */
export async function syncAdminRole(
  client: SupabaseClient,
  userId: string,
  email: string | null | undefined
): Promise<void> {
  if (!isAdminEmail(email, process.env.ADMIN_EMAILS)) return;

  try {
    const { error } = await client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId)
      .neq("role", "admin");

    if (error) throw error;
  } catch (error) {
    console.error("syncAdminRole failed", error);
  }
}
