export interface MovieForEmbedding {
  id: number;
  title: string;
  tagline: string | null;
  overview: string | null;
  keywords: string[];
}

export interface CreditRow {
  movieId: number;
  personName: string;
}

export interface CreditNames {
  cast: string[];
  directors: string[];
}

/**
 * Groups flat movie_cast/movie_crew rows into per-movie name lists.
 * `castRows` must already be ordered by billing_order (the DB query does
 * this) - this function just preserves that order per movie.
 */
export function groupCreditsByMovie(
  castRows: CreditRow[],
  crewRows: CreditRow[]
): Map<number, CreditNames> {
  const byMovie = new Map<number, CreditNames>();

  function entryFor(movieId: number): CreditNames {
    let entry = byMovie.get(movieId);
    if (!entry) {
      entry = { cast: [], directors: [] };
      byMovie.set(movieId, entry);
    }
    return entry;
  }

  for (const row of castRows) entryFor(row.movieId).cast.push(row.personName);
  for (const row of crewRows) entryFor(row.movieId).directors.push(row.personName);

  return byMovie;
}

/** Labeled text block embedded for semantic search/matching (features 6, 14).
 * Skips any line whose source field is empty so a sparse film doesn't embed
 * literal "Tagline: " noise. */
export function buildEmbeddingDocument(
  movie: MovieForEmbedding,
  credits: CreditNames
): string {
  const lines = [`Title: ${movie.title}`];

  if (movie.tagline) lines.push(`Tagline: ${movie.tagline}`);
  if (movie.overview) lines.push(`Overview: ${movie.overview}`);
  if (movie.keywords.length > 0) lines.push(`Keywords: ${movie.keywords.join(", ")}`);
  if (credits.cast.length > 0) lines.push(`Cast: ${credits.cast.join(", ")}`);
  if (credits.directors.length > 0) lines.push(`Director: ${credits.directors.join(", ")}`);

  return lines.join("\n");
}
