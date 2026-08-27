import { clampScore, scoreBarColor } from "@/lib/sessions/scoreBar";
import type { SessionParticipant } from "@/types/session";

/** One row per scored participant for a film: avatar, name, and a thin fit
 * bar. scoredParticipantIds/scores are order-aligned per 14b's locked
 * contract. A missing participant (shouldn't happen) falls back the same
 * defensive way getSessionDetail's "Removed friend" does. */
export function ParticipantFitList({
  scoredParticipantIds,
  scores,
  participants,
}: {
  scoredParticipantIds: string[];
  scores: number[];
  participants: SessionParticipant[];
}) {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {scoredParticipantIds.map((participantId, index) => {
        const participant = byId.get(participantId);
        const score = scores[index];
        const pct = clampScore(score) * 100;

        return (
          <div key={participantId} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="w-3.5 shrink-0 text-[10px] leading-none"
              title={participant?.displayName ?? "Someone"}
            >
              {participant?.avatarEmoji || "🎬"}
            </span>
            <div
              role="img"
              aria-label={`${participant?.displayName ?? "Someone"}'s fit: ${Math.round(pct)}%`}
              className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: scoreBarColor(score) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
