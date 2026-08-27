"use client";

import { useState } from "react";
import { PosterCard } from "@/components/catalog/PosterCard";
import { GroupScoreBar } from "@/components/sessions/GroupScoreBar";
import type { GroupRankedMovie } from "@/types/recommendation";

type Status = "idle" | "loading" | "error" | "empty" | "success";

export function RecommendationsPanel({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [movies, setMovies] = useState<GroupRankedMovie[]>([]);

  async function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/recommendations`);
      if (!response.ok) throw new Error("recommendations request failed");

      const body: { movies: GroupRankedMovie[] } = await response.json();
      setMovies(body.movies);
      setStatus(body.movies.length > 0 ? "success" : "empty");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">Here&apos;s your film</h2>
        <button
          type="button"
          onClick={handleClick}
          disabled={status === "loading"}
          className="shrink-0 rounded-full border border-neon-magenta px-4 py-2 text-sm text-neon-magenta transition-colors hover:bg-neon-magenta/10 disabled:opacity-50"
        >
          {status === "loading" ? "Finding films…" : "See recommendations"}
        </button>
      </div>

      {status === "error" && (
        <p className="rounded-lg border border-neon-amber/40 bg-background px-4 py-3 text-sm text-muted-foreground">
          Couldn&apos;t get recommendations right now. Try again.
        </p>
      )}

      {status === "empty" && (
        <p className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
          No films match tonight&apos;s mix of moods and filters yet. Try loosening a filter or adding a mood.
        </p>
      )}

      {status === "success" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {movies.map((movie) => (
            <PosterCard
              key={movie.id}
              movie={movie}
              footer={<GroupScoreBar score={movie.groupScore} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}
