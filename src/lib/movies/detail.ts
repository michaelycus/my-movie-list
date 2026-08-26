import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { MovieDetail } from "@/types/movie";

const movieIdSchema = z.coerce.number().int().positive();

// Unlike parseBrowseParams, an invalid id doesn't fall back to a default -
// there's no sensible default film, so the caller turns null into a 404.
export function parseMovieId(raw: string): number | null {
  const result = movieIdSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatAgeCertification(minAge: number | null): string {
  if (minAge === null) return "Not rated";
  if (minAge === 0) return "All ages";
  return `${minAge}+`;
}

interface MovieRow {
  id: number;
  title: string;
  tagline: string | null;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  weighted_rating: number | null;
  min_age: number | null;
  genre_ids: number[];
}

interface GenreRow {
  id: number;
  name: string;
}

interface CastRow {
  person_name: string;
  character_name: string | null;
}

interface CrewRow {
  person_name: string;
}

export async function getMovieDetail(id: number): Promise<MovieDetail | null> {
  const supabase = await createClient();

  const { data: movie, error: movieError } = await supabase
    .from("movies")
    .select(
      "id, title, tagline, overview, release_date, runtime, poster_path, backdrop_path, vote_average, weighted_rating, min_age, genre_ids"
    )
    .eq("id", id)
    .maybeSingle()
    .returns<MovieRow | null>();

  if (movieError) throw movieError;
  if (!movie) return null;

  const [{ data: genres, error: genresError }, { data: cast, error: castError }, { data: crew, error: crewError }] =
    await Promise.all([
      movie.genre_ids.length > 0
        ? supabase
            .from("genres")
            .select("id, name")
            .in("id", movie.genre_ids)
            .returns<GenreRow[]>()
        : Promise.resolve({ data: [] as GenreRow[], error: null }),
      supabase
        .from("movie_cast")
        .select("person_name, character_name")
        .eq("movie_id", id)
        .order("billing_order", { ascending: true, nullsFirst: false })
        .returns<CastRow[]>(),
      supabase
        .from("movie_crew")
        .select("person_name")
        .eq("movie_id", id)
        .returns<CrewRow[]>(),
    ]);

  if (genresError) throw genresError;
  if (castError) throw castError;
  if (crewError) throw crewError;

  return {
    id: movie.id,
    title: movie.title,
    tagline: movie.tagline,
    overview: movie.overview,
    releaseDate: movie.release_date,
    runtime: movie.runtime,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    voteAverage: movie.vote_average,
    weightedRating: movie.weighted_rating,
    minAge: movie.min_age,
    genres: genres ?? [],
    cast: (cast ?? []).map((c) => ({
      name: c.person_name,
      character: c.character_name,
    })),
    director: crew && crew.length > 0 ? crew.map((c) => c.person_name).join(", ") : null,
  };
}
