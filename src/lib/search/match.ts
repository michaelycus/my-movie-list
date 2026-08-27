import type { SupabaseClient } from "@supabase/supabase-js";
import type { MovieRow } from "@/lib/movies/browse";

/** One row from the match_movies RPC: browse.ts's MovieRow display columns
 * plus the columns applyFilters needs to filter on, plus cosine similarity -
 * mirrors the return table in the query_cache_and_match_movies migration. */
export interface MatchedMovieRow extends MovieRow {
  genre_ids: number[];
  runtime: number | null;
  min_age: number | null;
  similarity: number;
}

/** Top `matchCount` movies by cosine similarity to `embedding`, via the
 * match_movies Postgres RPC (vector search stays in the database). */
export async function matchMovies(
  client: SupabaseClient,
  embedding: number[],
  matchCount = 200
): Promise<MatchedMovieRow[]> {
  // Not chaining .returns<T>() here - supabase-js's rpc() typing treats a
  // SETOF-returning function as a single row unless it's declared in
  // generated Database types (which this project doesn't have), and
  // .returns<MatchedMovieRow[]>() rejects that mismatch at compile time.
  const { data, error } = await client.rpc("match_movies", {
    query_embedding: embedding,
    match_count: matchCount,
  });

  if (error) throw error;

  return (data ?? []) as MatchedMovieRow[];
}
