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
