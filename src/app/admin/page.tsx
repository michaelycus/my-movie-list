import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  // getClaims(), not getUser(): matches every other protected route's
  // pattern (src/proxy.ts already verified there's a session for /admin).
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (typeof ownerId !== "string") notFound();

  // The self-read policy on profiles (id = auth.uid()) covers this - no
  // admin-only policy needed just to check your own role.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile role for /admin", error);
    notFound();
  }

  // notFound(), not a redirect: a non-admin poking at this route shouldn't
  // get confirmation the route exists, matching /sessions/[id]'s existing
  // convention for missing/wrong-owner access.
  if (profile?.role !== "admin") notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Admin</h1>
      <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-muted-foreground">
        Usage dashboard coming soon.
      </p>
    </main>
  );
}
