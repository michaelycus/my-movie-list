"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PosterCard } from "@/components/catalog/PosterCard";
import { GroupScoreBar } from "@/components/sessions/GroupScoreBar";
import { ParticipantFitList } from "@/components/sessions/ParticipantFitList";
import { ConsensusSlider } from "@/components/sessions/ConsensusSlider";
import { GroupPickRationale } from "@/components/sessions/GroupPickRationale";
import { computeGroupScore } from "@/lib/sessions/groupScore";
import { buttonVariants } from "@/lib/ui";
import type { GroupRankedMovie } from "@/types/recommendation";
import type { SessionParticipant } from "@/types/session";

type Status = "idle" | "loading" | "error" | "empty" | "success";

const DEFAULT_CONSENSUS_WEIGHT = 0.6; // matches 14a's score_group RPC default

function RecommendationsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-2/3 rounded-lg bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-1.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function RecommendationsPanel({
  sessionId,
  participants,
}: {
  sessionId: string;
  participants: SessionParticipant[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [movies, setMovies] = useState<GroupRankedMovie[]>([]);
  const [scoredParticipantIds, setScoredParticipantIds] = useState<string[]>([]);
  const [consensusWeight, setConsensusWeight] = useState(DEFAULT_CONSENSUS_WEIGHT);

  async function handleClick() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/recommendations`);
      if (!response.ok) throw new Error("recommendations request failed");

      const body: { scoredParticipantIds: string[]; movies: GroupRankedMovie[] } =
        await response.json();
      setMovies(body.movies);
      setScoredParticipantIds(body.scoredParticipantIds);
      setStatus(body.movies.length > 0 ? "success" : "empty");
    } catch {
      setStatus("error");
    }
  }

  // Live re-rank: entirely local, no network call. Every visible movie
  // already carries every scored participant's own similarity
  // (participantScores), so moving the slider just re-derives group_score
  // from data already in hand and re-sorts - re-fetching per tick would
  // multiply OpenAI cost for no product benefit.
  const rankedMovies = useMemo(
    () =>
      movies
        .map((movie) => ({
          ...movie,
          groupScore: computeGroupScore(movie.participantScores, consensusWeight),
        }))
        .sort((a, b) => b.groupScore - a.groupScore),
    [movies, consensusWeight]
  );

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">Here&apos;s your film</h2>
        <button
          type="button"
          onClick={handleClick}
          disabled={status === "loading"}
          className={buttonVariants({ intent: "primary" })}
        >
          {status === "loading" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status === "loading" ? "Finding films…" : "See recommendations"}
        </button>
      </div>

      {status === "loading" && <RecommendationsSkeleton />}

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
        <>
          <ConsensusSlider value={consensusWeight} onChange={setConsensusWeight} />
          {rankedMovies[0] && (
            <GroupPickRationale key={rankedMovies[0].id} sessionId={sessionId} movie={rankedMovies[0]} />
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {rankedMovies.map((movie, index) => (
              <div
                key={movie.id}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards"
                style={{ animationDuration: "300ms", animationDelay: `${Math.min(index, 11) * 30}ms` }}
              >
                <PosterCard
                  movie={movie}
                  footer={
                    <>
                      <GroupScoreBar score={movie.groupScore} />
                      <ParticipantFitList
                        scoredParticipantIds={scoredParticipantIds}
                        scores={movie.participantScores}
                        participants={participants}
                      />
                    </>
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
