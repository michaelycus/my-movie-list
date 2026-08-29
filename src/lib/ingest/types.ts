export interface RawMovieCsvRow {
  budget: string;
  genres: string;
  homepage: string;
  id: string;
  keywords: string;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: string;
  production_companies: string;
  production_countries: string;
  release_date: string;
  revenue: string;
  runtime: string;
  spoken_languages: string;
  status: string;
  tagline: string;
  title: string;
  vote_average: string;
  vote_count: string;
}

export interface RawCreditsCsvRow {
  movie_id: string;
  title: string;
  cast: string;
  crew: string;
}

export interface NormalizedGenre {
  id: number;
  name: string;
}

export interface NormalizedFilm {
  id: number;
  title: string;
  overview: string | null;
  tagline: string | null;
  releaseDate: string | null;
  runtime: number | null;
  originalLanguage: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  weightedRating: number;
  genreIds: number[];
  keywords: string[];
}

export interface NormalizedCastMember {
  personName: string;
  characterName: string | null;
  billingOrder: number | null;
}

export interface NormalizedCrewMember {
  personName: string;
  job: string;
}

export interface NormalizedCredits {
  movieId: number;
  cast: NormalizedCastMember[];
  crew: NormalizedCrewMember[];
}

export interface EnrichedFilm extends NormalizedFilm {
  posterPath: string | null;
  backdropPath: string | null;
  minAge: number | null;
}
