"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { chooseSessionFilm } from "@/actions/sessions";
import { buttonVariants } from "@/lib/ui";
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
          className={buttonVariants({ intent: "secondary" })}
        >
          {status === "loading" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status === "loading" ? "Writing…" : "Why this pick?"}
        </button>
      </div>

      {status === "loading" && (
        <div className="flex flex-col gap-2">
          <div className="h-4 w-full rounded bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-surface-2 motion-safe:animate-pulse" />
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-muted-foreground">Couldn&apos;t write a rationale right now. Try again.</p>
      )}

      {status === "success" && rationale === null && (
        <p className="text-sm text-muted-foreground">Couldn&apos;t write a rationale right now.</p>
      )}

      {status === "success" && rationale !== null && (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          <p className="text-sm text-foreground">{rationale}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className={buttonVariants({ intent: "primary", className: "self-start" })}
            >
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save this pick"}
            </button>
            {saveStatus === "error" && <span className="text-sm text-neon-amber">Couldn&apos;t save. Try again.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
