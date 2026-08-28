import Image from "next/image";
import Link from "next/link";
import type { SessionListItem } from "@/types/session";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export function SessionList({ sessions }: { sessions: SessionListItem[] }) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-surface px-4 py-10 text-center">
        <p className="text-muted-foreground">No sessions yet. Start one to get a group recommendation.</p>
        <Link
          href="/sessions/new"
          className="rounded-full border border-neon-magenta px-4 py-2 text-sm text-neon-magenta transition-colors hover:bg-neon-magenta/10"
        >
          New session
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/sessions/${session.id}`}
          className="flex items-center gap-4 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-neon-cyan"
        >
          <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded bg-surface-2">
            {session.chosenMovie?.posterPath ? (
              <Image
                src={`${POSTER_BASE_URL}${session.chosenMovie.posterPath}`}
                alt={session.chosenMovie.title}
                fill
                unoptimized
                sizes="48px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg" aria-hidden>
                🎬
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{session.title}</span>
            <span className="text-xs text-muted-foreground">{session.watchedOn}</span>
            {session.chosenMovie && (
              <span className="truncate text-sm text-neon-cyan">{session.chosenMovie.title}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
