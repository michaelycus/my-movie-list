/** Mirrors 14a's SQL group_score formula exactly (project-overview.md §5.2):
 * consensusWeight weights the room's average fit, the remainder weights the
 * least-happy participant's fit. Deliberately dependency-free - safe to
 * import from a client component doing a live re-rank, unlike
 * recommendations.ts, which pulls in server-only Supabase/OpenAI code. */
export function computeGroupScore(participantScores: number[], consensusWeight: number): number {
  if (participantScores.length === 0) return 0;

  const average = participantScores.reduce((sum, score) => sum + score, 0) / participantScores.length;
  const min = Math.min(...participantScores);

  return consensusWeight * average + (1 - consensusWeight) * min;
}
