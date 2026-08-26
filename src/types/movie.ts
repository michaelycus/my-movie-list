/** Shape of one film as rendered on the catalog poster grid. */
export interface BrowseMovie {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  weightedRating: number | null;
  popularity: number | null;
}

/** Shape of one film as rendered on its detail page. */
export interface MovieDetail {
  id: number;
  title: string;
  tagline: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtime: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  weightedRating: number | null;
  minAge: number | null;
  genres: { id: number; name: string }[];
  cast: { name: string; character: string | null }[];
  director: string | null;
}
