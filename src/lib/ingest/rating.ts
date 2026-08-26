function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export interface GlobalVoteStats {
  /** Mean vote_average across films that have at least one vote. */
  meanVote: number;
  /** Median vote_count across all films - the Bayesian prior's weight. */
  minVotesThreshold: number;
}

export function computeGlobalVoteStats(
  films: { voteAverage: number; voteCount: number }[]
): GlobalVoteStats {
  const withVotes = films.filter((f) => f.voteCount > 0);
  const meanVote =
    withVotes.reduce((sum, f) => sum + f.voteAverage, 0) / withVotes.length;
  const minVotesThreshold = median(films.map((f) => f.voteCount));
  return { meanVote, minVotesThreshold };
}

/**
 * IMDb-style Bayesian weighted rating: WR = (v/(v+m))*R + (m/(v+m))*C.
 * A film with no votes (v=0) gets exactly the global mean (C); a film with
 * many more votes than the threshold (m) converges toward its own average (R).
 */
export function computeWeightedRating(
  voteAverage: number,
  voteCount: number,
  meanVote: number,
  minVotesThreshold: number
): number {
  const v = voteCount;
  const m = minVotesThreshold;
  return (v / (v + m)) * voteAverage + (m / (v + m)) * meanVote;
}
