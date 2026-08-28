import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionList } from "@/lib/sessions/list";
import { SessionList } from "@/components/sessions/SessionList";
import { buttonVariants } from "@/lib/ui";
import type { SessionListItem } from "@/types/session";

export default async function SessionsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;

  let sessions: SessionListItem[] = [];
  let loadFailed = false;
  if (typeof ownerId === "string") {
    try {
      sessions = await getSessionList(ownerId);
    } catch (error) {
      console.error("Failed to load sessions", error);
      loadFailed = true;
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Sessions</h1>
        {typeof ownerId === "string" && sessions.length > 0 && (
          <Link href="/sessions/new" className={buttonVariants({ intent: "primary" })}>
            New session
          </Link>
        )}
      </div>
      {typeof ownerId !== "string" ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Sign in to see your sessions.
        </p>
      ) : loadFailed ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load your sessions right now. Try refreshing the page.
        </p>
      ) : (
        <SessionList sessions={sessions} />
      )}
    </main>
  );
}
