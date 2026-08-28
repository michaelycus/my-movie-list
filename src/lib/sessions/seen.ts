import type { SupabaseClient } from "@supabase/supabase-js";

interface ParticipantSeenTarget {
  friendId: string | null;
}

/** Marks every seated participant (host + friends) as having seen a film,
 * skipping anyone who already has a `seen_movies` row for it. A plain
 * select-then-insert-the-gap, not an upsert: PostgREST's `onConflict` can't
 * target a partial unique index (no WHERE-predicate support in the conflict
 * target it emits), which is what backs host vs. friend rows here (see the
 * seen_movies migration). Best-effort - errors are logged, never thrown, so
 * a seen-list write can never turn a successful pick save into a failed one
 * (chooseSessionFilm's contract). */
export async function markParticipantsAsSeen(
  client: SupabaseClient,
  ownerId: string,
  movieId: number,
  seenOn: string,
  participants: ParticipantSeenTarget[]
): Promise<void> {
  try {
    const { data: existingRows, error: existingError } = await client
      .from("seen_movies")
      .select("friend_id")
      .eq("owner_id", ownerId)
      .eq("movie_id", movieId);

    if (existingError) throw existingError;

    const alreadySeenFriendIds = new Set((existingRows ?? []).map((row) => row.friend_id as string | null));
    const missing = participants.filter((participant) => !alreadySeenFriendIds.has(participant.friendId));
    if (missing.length === 0) return;

    const { error: insertError } = await client.from("seen_movies").insert(
      missing.map((participant) => ({
        owner_id: ownerId,
        friend_id: participant.friendId,
        movie_id: movieId,
        seen_on: seenOn,
      }))
    );

    if (insertError) throw insertError;
  } catch (error) {
    console.error("markParticipantsAsSeen failed", error);
  }
}
