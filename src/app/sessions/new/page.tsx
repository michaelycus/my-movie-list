import { createClient } from "@/lib/supabase/server";
import { getFriends } from "@/lib/friends/list";
import { NewSessionForm } from "@/components/sessions/NewSessionForm";
import type { Friend } from "@/types/friend";

export default async function NewSessionPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;

  let friends: Friend[] = [];
  let loadFailed = false;
  if (typeof ownerId === "string") {
    try {
      friends = await getFriends(ownerId);
    } catch (error) {
      console.error("Failed to load friends", error);
      loadFailed = true;
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">New session</h1>
      {typeof ownerId !== "string" ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Sign in to start a session.
        </p>
      ) : loadFailed ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load your friends right now. Try refreshing the page.
        </p>
      ) : (
        <NewSessionForm friends={friends} />
      )}
    </main>
  );
}
