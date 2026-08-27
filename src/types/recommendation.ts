/** One movie as ranked by the score_group RPC (build-plan feature 14a).
 * participantScores is ordered the same as the query embeddings passed in -
 * feature 15's per-participant fit breakdown reads it by that same index. */
export interface GroupRankedMovie {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  weightedRating: number | null;
  popularity: number | null;
  runtime: number | null;
  minAge: number | null;
  groupScore: number;
  participantScores: number[];
}
