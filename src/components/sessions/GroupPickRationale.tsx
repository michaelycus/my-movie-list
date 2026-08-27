"use client";

import { useState } from "react";
import type { GroupRankedMovie } from "@/types/recommendation";

type Status = "idle" | "loading" | "error" | "success";

// Keyed by movie.id at the call site (RecommendationsPanel) so a slider-
// driven change of the top pick remounts this component fresh instead of
// carrying a stale paragraph about a different film.
export function GroupPickRationale({ sessionId, movie }: { sessionId: string; movie: GroupRankedMovie }) {
  const [status, setStatus] = useState<Status>("idle");
  const [rationale, setRationale] = useState<string | null>(null);

  async function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/rationale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: movie.id }),
      });
      if (!response.ok) throw new Error("rationale request failed");

      const body: { rationale: string | null } = await response.json();
      setRationale(body.rationale);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neon-cyan/30 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">Why {movie.title}?</h3>
        <button
          type="button"
          onClick={handleClick}
          disabled={status === "loading"}
          className="shrink-0 rounded-full border border-neon-cyan px-4 py-2 text-sm text-neon-cyan transition-colors hover:bg-neon-cyan/10 disabled:opacity-50"
        >
          {status === "loading" ? "Writing…" : "Why this pick?"}
        </button>
      </div>

      {status === "error" && (
        <p className="text-sm text-muted-foreground">Couldn&apos;t write a rationale right now. Try again.</p>
      )}

      {status === "success" && rationale === null && (
        <p className="text-sm text-muted-foreground">Couldn&apos;t write a rationale right now.</p>
      )}

      {status === "success" && rationale !== null && <p className="text-sm text-foreground">{rationale}</p>}
    </div>
  );
}
