import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRankedMovie } from "@/types/recommendation";

export interface ScoreGroupParams {
  embeddings: number[][];
  maxRuntime: number | null;
  minAgeCeiling: number | null;
  blockedGenres: number[];
  consensusWeight?: number;
  matchCount?: number;
  excludedMovieIds?: number[];
}

interface ScoreGroupRow {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  weighted_rating: number | null;
  popularity: number | null;
  runtime: number | null;
  min_age: number | null;
  group_score: number;
  participant_scores: number[];
}

function toGroupRankedMovie(row: ScoreGroupRow): GroupRankedMovie {
  return {
    id: row.id,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    voteAverage: row.vote_average,
    weightedRating: row.weighted_rating,
    popularity: row.popularity,
    runtime: row.runtime,
    minAge: row.min_age,
    groupScore: row.group_score,
    participantScores: row.participant_scores,
  };
}

/** Ranks the catalog for a room via 14a's score_group RPC (vector scoring
 * and least-misery aggregation stay in the database). Returns [] without
 * calling the RPC when there are no scored participants - avg/min over zero
 * rows is undefined in SQL, so this is handled here rather than there. */
export async function scoreGroup(
  client: SupabaseClient,
  params: ScoreGroupParams
): Promise<GroupRankedMovie[]> {
  if (params.embeddings.length === 0) return [];

  // Not chaining .returns<T>() here - same reasoning as matchMovies in
  // src/lib/search/match.ts: supabase-js's rpc() typing has no generated
  // Database types to check a SETOF return shape against.
  const { data, error } = await client.rpc("score_group", {
    embeddings: params.embeddings,
    max_runtime: params.maxRuntime,
    min_age_ceiling: params.minAgeCeiling,
    blocked_genres: params.blockedGenres,
    consensus_weight: params.consensusWeight ?? 0.6,
    match_count: params.matchCount ?? 10,
    excluded_movie_ids: params.excludedMovieIds ?? [],
  });

  if (error) throw error;

  return ((data ?? []) as ScoreGroupRow[]).map(toGroupRankedMovie);
}
