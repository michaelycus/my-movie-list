import { createClient } from "@/lib/supabase/server";
import type { SessionListItem } from "@/types/session";

interface SessionRow {
  id: string;
  title: string;
  watched_on: string;
  chosen_movie_id: number | null;
}

interface MovieRow {
  id: number;
  title: string;
  poster_path: string | null;
}

// Newest first by watched_on (the date the session is/was for), not
// created_at - a session logged after the fact should sort by movie night,
// not by when the host got around to saving it.
export async function getSessionList(ownerId: string): Promise<SessionListItem[]> {
  const supabase = await createClient();

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, title, watched_on, chosen_movie_id")
    .eq("owner_id", ownerId)
    .order("watched_on", { ascending: false })
    .returns<SessionRow[]>();

  if (sessionsError) throw sessionsError;
  if (!sessions || sessions.length === 0) return [];

  const movieIds = sessions
    .map((session) => session.chosen_movie_id)
    .filter((id): id is number => id !== null);

  const { data: movieRows, error: moviesError } =
    movieIds.length > 0
      ? await supabase
          .from("movies")
          .select("id, title, poster_path")
          .in("id", movieIds)
          .returns<MovieRow[]>()
      : { data: [] as MovieRow[], error: null };

  if (moviesError) throw moviesError;

  const moviesById = new Map((movieRows ?? []).map((movie) => [movie.id, movie]));

  return sessions.map((session) => {
    const movie = session.chosen_movie_id !== null ? moviesById.get(session.chosen_movie_id) : undefined;
    return {
      id: session.id,
      title: session.title,
      watchedOn: session.watched_on,
      chosenMovie: movie ? { id: movie.id, title: movie.title, posterPath: movie.poster_path } : null,
    };
  });
}
