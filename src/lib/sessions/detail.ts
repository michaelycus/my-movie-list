import { createClient } from "@/lib/supabase/server";
import { toSessionConstraints } from "@/lib/sessions/mood";
import type { SessionDetail, SessionParticipant } from "@/types/session";

interface SessionRow {
  id: string;
  title: string;
  watched_on: string;
  chosen_movie_id: number | null;
  rationale: string | null;
  youngest_viewer_age: number | null;
}

interface ParticipantRow {
  id: string;
  friend_id: string | null;
  is_host: boolean;
  mood_tags: string[];
  mood_note: string | null;
  constraints: unknown;
}

interface FriendNameRow {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
}

// Scoped by both id and owner_id explicitly - a wrong-owner id returns null
// the same way a missing id would, rather than leaking whether it exists.
// session_participants has no owner_id of its own (see the sessions
// migration), so ownership is established via this sessions row first.
export async function getSessionDetail(id: string, ownerId: string): Promise<SessionDetail | null> {
  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, title, watched_on, chosen_movie_id, rationale, youngest_viewer_age")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle()
    .returns<SessionRow | null>();

  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: participantRows, error: participantsError } = await supabase
    .from("session_participants")
    .select("id, friend_id, is_host, mood_tags, mood_note, constraints")
    .eq("session_id", session.id)
    .returns<ParticipantRow[]>();

  if (participantsError) throw participantsError;

  const friendIds = (participantRows ?? [])
    .map((row) => row.friend_id)
    .filter((friendId): friendId is string => friendId !== null);

  const { data: friendRows, error: friendsError } =
    friendIds.length > 0
      ? await supabase
          .from("friends")
          .select("id, display_name, avatar_emoji")
          .in("id", friendIds)
          .returns<FriendNameRow[]>()
      : { data: [] as FriendNameRow[], error: null };

  if (friendsError) throw friendsError;

  const friendsById = new Map((friendRows ?? []).map((friend) => [friend.id, friend]));

  const participants: SessionParticipant[] = (participantRows ?? []).map((row) => {
    const moodFields = {
      moodTags: row.mood_tags,
      moodNote: row.mood_note,
      constraints: toSessionConstraints(row.constraints),
    };
    if (row.is_host) {
      return { id: row.id, displayName: "You", avatarEmoji: null, isHost: true, ...moodFields };
    }
    const friend = row.friend_id ? friendsById.get(row.friend_id) : undefined;
    return {
      id: row.id,
      displayName: friend?.display_name ?? "Removed friend",
      avatarEmoji: friend?.avatar_emoji ?? null,
      isHost: false,
      ...moodFields,
    };
  });

  return {
    id: session.id,
    title: session.title,
    watchedOn: session.watched_on,
    chosenMovieId: session.chosen_movie_id,
    rationale: session.rationale,
    youngestViewerAge: session.youngest_viewer_age,
    participants,
  };
}
