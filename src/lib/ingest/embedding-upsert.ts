import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditRow, MovieForEmbedding } from "./embedding-document";

/** Films still missing a vector, oldest id first - both the query and the
 * resume cursor for scripts/embed.ts (see current-feature.md's Data/contracts
 * note on why this feature skips ingest_checkpoint). */
export async function fetchMoviesNeedingEmbeddings(
  admin: SupabaseClient,
  limit: number
): Promise<MovieForEmbedding[]> {
  const { data, error } = await admin
    .from("movies")
    .select("id, title, tagline, overview, keywords")
    .is("embedded_at", null)
    .order("id")
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as MovieForEmbedding[];
}

interface RawCreditRow {
  movie_id: number;
  person_name: string;
}

function toCreditRows(rows: RawCreditRow[]): CreditRow[] {
  return rows.map((r) => ({ movieId: r.movie_id, personName: r.person_name }));
}

export async function fetchCreditsForMovies(
  admin: SupabaseClient,
  movieIds: number[]
): Promise<{ castRows: CreditRow[]; crewRows: CreditRow[] }> {
  if (movieIds.length === 0) return { castRows: [], crewRows: [] };

  const { data: castData, error: castError } = await admin
    .from("movie_cast")
    .select("movie_id, person_name")
    .in("movie_id", movieIds)
    .order("billing_order");
  if (castError) throw castError;

  // job = 'Director' is defensive - ingest already scopes movie_crew to
  // directors only (see normalize.ts's parseCrew), but this doesn't rely on
  // that invariant holding forever.
  const { data: crewData, error: crewError } = await admin
    .from("movie_crew")
    .select("movie_id, person_name")
    .in("movie_id", movieIds)
    .eq("job", "Director");
  if (crewError) throw crewError;

  return {
    castRows: toCreditRows((castData ?? []) as RawCreditRow[]),
    crewRows: toCreditRows((crewData ?? []) as RawCreditRow[]),
  };
}

export interface EmbeddedMovieRow {
  id: number;
  embedding: number[];
  embeddingText: string;
}

/**
 * Writes each row's embedding back individually via update/eq rather than a
 * single upsert - an upsert's payload never includes movies.title, which
 * would violate its NOT NULL constraint on the (never-taken) insert path.
 */
export async function updateEmbeddings(
  admin: SupabaseClient,
  rows: EmbeddedMovieRow[]
): Promise<void> {
  const embeddedAt = new Date().toISOString();

  for (const row of rows) {
    const { error } = await admin
      .from("movies")
      .update({
        embedding: row.embedding,
        embedding_text: row.embeddingText,
        embedded_at: embeddedAt,
      })
      .eq("id", row.id);
    if (error) throw error;
  }
}
