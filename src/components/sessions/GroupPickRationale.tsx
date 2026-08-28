"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chooseSessionFilm } from "@/actions/sessions";
import type { GroupRankedMovie } from "@/types/recommendation";

type Status = "idle" | "loading" | "error" | "success";
type SaveStatus = "idle" | "saving" | "saved" | "error";

// Keyed by movie.id at the call site (RecommendationsPanel) so a slider-
// driven change of the top pick remounts this component fresh instead of
// carrying a stale paragraph about a different film.
export function GroupPickRationale({ sessionId, movie }: { sessionId: string; movie: GroupRankedMovie }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [rationale, setRationale] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

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

  async function handleSave() {
    if (saveStatus === "saving") return;
    setSaveStatus("saving");
    const result = await chooseSessionFilm(sessionId, movie.id, rationale);
    if (!result.success) {
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saved");
    // Session detail page swaps to the persisted "Tonight's pick" section
    // once chosenMovieId is set - that's server data, so it needs a refresh.
    router.refresh();
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

      {status === "success" && rationale !== null && (
        <>
          <p className="text-sm text-foreground">{rationale}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className="shrink-0 self-start rounded-full border border-neon-magenta px-4 py-2 text-sm text-neon-magenta transition-colors hover:bg-neon-magenta/10 disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save this pick"}
            </button>
            {saveStatus === "error" && <span className="text-sm text-neon-amber">Couldn&apos;t save. Try again.</span>}
          </div>
        </>
      )}
    </div>
  );
}
