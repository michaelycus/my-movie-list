import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichedFilm, NormalizedCredits, NormalizedGenre } from "./types";

export function toMovieRow(film: EnrichedFilm) {
  return {
    id: film.id,
    title: film.title,
    overview: film.overview,
    tagline: film.tagline,
    release_date: film.releaseDate,
    runtime: film.runtime,
    original_language: film.originalLanguage,
    poster_path: film.posterPath,
    backdrop_path: film.backdropPath,
    vote_average: film.voteAverage,
    vote_count: film.voteCount,
    popularity: film.popularity,
    weighted_rating: film.weightedRating,
    min_age: film.minAge,
    genre_ids: film.genreIds,
    keywords: film.keywords,
  };
}

export async function upsertGenres(
  admin: SupabaseClient,
  genres: NormalizedGenre[]
): Promise<void> {
  if (genres.length === 0) return;
  const { error } = await admin.from("genres").upsert(genres, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertFilms(
  admin: SupabaseClient,
  films: EnrichedFilm[]
): Promise<void> {
  if (films.length === 0) return;
  const { error } = await admin
    .from("movies")
    .upsert(films.map(toMovieRow), { onConflict: "id" });
  if (error) throw error;
}

/**
 * No unique constraint exists on movie_cast/movie_crew (see 1a's migration),
 * so this deletes each batch's existing rows first, then inserts fresh ones -
 * idempotent on resume, since the checkpoint only advances after this
 * succeeds (see scripts/ingest.ts).
 */
export async function upsertCastAndCrew(
  admin: SupabaseClient,
  credits: NormalizedCredits[]
): Promise<void> {
  if (credits.length === 0) return;
  const movieIds = credits.map((c) => c.movieId);

  const { error: deleteCastError } = await admin
    .from("movie_cast")
    .delete()
    .in("movie_id", movieIds);
  if (deleteCastError) throw deleteCastError;

  const { error: deleteCrewError } = await admin
    .from("movie_crew")
    .delete()
    .in("movie_id", movieIds);
  if (deleteCrewError) throw deleteCrewError;

  const castRows = credits.flatMap((c) =>
    c.cast.map((member) => ({
      movie_id: c.movieId,
      person_name: member.personName,
      character_name: member.characterName,
      billing_order: member.billingOrder,
    }))
  );
  if (castRows.length > 0) {
    const { error } = await admin.from("movie_cast").insert(castRows);
    if (error) throw error;
  }

  const crewRows = credits.flatMap((c) =>
    c.crew.map((member) => ({
      movie_id: c.movieId,
      person_name: member.personName,
      job: member.job,
    }))
  );
  if (crewRows.length > 0) {
    const { error } = await admin.from("movie_crew").insert(crewRows);
    if (error) throw error;
  }
}
