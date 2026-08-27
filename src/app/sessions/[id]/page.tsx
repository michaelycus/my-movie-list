import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/detail";
import { TonightsMoodForm } from "@/components/sessions/TonightsMoodForm";
import { RecommendationsPanel } from "@/components/sessions/RecommendationsPanel";
import type { SessionDetail } from "@/types/session";

const sessionIdSchema = z.string().uuid();

export default async function SessionDetailPage({ params }: PageProps<"/sessions/[id]">) {
  const { id: rawId } = await params;
  const idResult = sessionIdSchema.safeParse(rawId);
  if (!idResult.success) notFound();

  const supabase = await createClient();
  // getClaims(), not getUser(): src/proxy.ts already verifies the session
  // this way for every request to this protected route.
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (typeof ownerId !== "string") notFound();

  let session: SessionDetail | null;
  try {
    session = await getSessionDetail(idResult.data, ownerId);
  } catch (error) {
    console.error("Failed to load session detail", error);
    return (
      <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load this session right now. Try refreshing the page.
        </p>
      </main>
    );
  }

  if (!session) notFound();

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{session.title}</h1>
        <p className="text-sm text-muted-foreground">{session.watchedOn}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-foreground">Who&apos;s here</h2>
        <ul className="flex flex-col gap-2">
          {session.participants.map((participant) => (
            <li key={participant.id} className="flex items-center gap-2 text-sm text-foreground">
              <span aria-hidden>{participant.avatarEmoji || "🎬"}</span>
              {participant.displayName}
              {participant.isHost && <span className="text-xs text-muted-foreground">(host)</span>}
            </li>
          ))}
        </ul>
      </section>

      <TonightsMoodForm
        sessionId={session.id}
        participants={session.participants}
        youngestViewerAge={session.youngestViewerAge}
      />

      <RecommendationsPanel sessionId={session.id} participants={session.participants} />
    </main>
  );
}
