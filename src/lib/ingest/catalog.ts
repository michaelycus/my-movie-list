import { parseCreditsCsv, parseMoviesCsv } from "./csv";
import { parseCast, parseCrew, parseGenres, parseKeywords } from "./normalize";
import { computeGlobalVoteStats, computeWeightedRating } from "./rating";
import type {
  NormalizedCredits,
  NormalizedFilm,
  NormalizedGenre,
  RawMovieCsvRow,
} from "./types";

function nullableString(value: string): string | null {
  return value === "" ? null : value;
}

function nullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

export interface NormalizedCatalog {
  films: NormalizedFilm[];
  credits: NormalizedCredits[];
  genres: NormalizedGenre[];
}

export async function normalizeCatalog(
  moviesCsvPath: string,
  creditsCsvPath: string
): Promise<NormalizedCatalog> {
  const creditsById = new Map<
    number,
    { cast: NormalizedCredits["cast"]; crew: NormalizedCredits["crew"] }
  >();
  for await (const row of parseCreditsCsv(creditsCsvPath)) {
    creditsById.set(Number(row.movie_id), {
      cast: parseCast(row.cast),
      crew: parseCrew(row.crew),
    });
  }

  const released: RawMovieCsvRow[] = [];
  for await (const row of parseMoviesCsv(moviesCsvPath)) {
    if (row.status === "Released") released.push(row);
  }

  const { meanVote, minVotesThreshold } = computeGlobalVoteStats(
    released.map((r) => ({
      voteAverage: Number(r.vote_average),
      voteCount: Number(r.vote_count),
    }))
  );

  const genresById = new Map<number, string>();
  const films: NormalizedFilm[] = [];
  const credits: NormalizedCredits[] = [];

  for (const row of released) {
    const id = Number(row.id);
    const voteAverage = nullableNumber(row.vote_average);
    const voteCount = nullableNumber(row.vote_count);

    for (const genre of parseGenres(row.genres)) {
      genresById.set(genre.id, genre.name);
    }

    films.push({
      id,
      title: row.title,
      overview: nullableString(row.overview),
      tagline: nullableString(row.tagline),
      releaseDate: nullableString(row.release_date),
      runtime: nullableNumber(row.runtime),
      originalLanguage: nullableString(row.original_language),
      voteAverage,
      voteCount,
      popularity: nullableNumber(row.popularity),
      weightedRating: computeWeightedRating(
        voteAverage ?? 0,
        voteCount ?? 0,
        meanVote,
        minVotesThreshold
      ),
      genreIds: parseGenres(row.genres).map((g) => g.id),
      keywords: parseKeywords(row.keywords),
    });

    const rowCredits = creditsById.get(id);
    credits.push({
      movieId: id,
      cast: rowCredits?.cast ?? [],
      crew: rowCredits?.crew ?? [],
    });
  }

  const genres: NormalizedGenre[] = Array.from(genresById, ([id, name]) => ({
    id,
    name,
  }));

  return { films, credits, genres };
}
