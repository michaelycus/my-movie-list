"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerId } from "@/lib/supabase/owner";
import { parseSessionInput, readSessionFormData } from "@/lib/sessions/validation";
import { parseMoodInput, readMoodFormData } from "@/lib/sessions/mood";
import { markParticipantsAsSeen } from "@/lib/sessions/seen";
import { logUsageEvent } from "@/lib/usage/events";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const sessionIdSchema = z.string().uuid();
const movieIdSchema = z.coerce.number().int().positive();

export async function createSession(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to start a session." };

  const parsed = parseSessionInput(readSessionFormData(formData));
  if (!parsed.success) return { success: false, error: parsed.error };

  // Cross-checked against the owner explicitly, not left to RLS alone: a
  // tampered friendId from another account must fail here, not just be
  // silently unreachable at read time.
  const { data: ownedFriends, error: friendsError } = await supabase
    .from("friends")
    .select("id")
    .eq("owner_id", ownerId)
    .in("id", parsed.data.friendIds);

  if (friendsError) return { success: false, error: "Could not verify friends." };
  if ((ownedFriends ?? []).length !== parsed.data.friendIds.length) {
    return { success: false, error: "One or more selected friends could not be found." };
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ owner_id: ownerId, title: parsed.data.title })
    .select("id")
    .single();

  if (sessionError) return { success: false, error: "Could not create session." };

  const participantRows = [
    { session_id: session.id, friend_id: null, is_host: true },
    ...parsed.data.friendIds.map((friendId) => ({
      session_id: session.id,
      friend_id: friendId,
      is_host: false,
    })),
  ];

  const { error: participantsError } = await supabase
    .from("session_participants")
    .insert(participantRows);

  if (participantsError) {
    // Best-effort cleanup - don't leave an empty, unseated session behind.
    await supabase.from("sessions").delete().eq("id", session.id);
    return { success: false, error: "Could not seat participants." };
  }

  await logUsageEvent(supabase, "session_created", ownerId, {
    participantCount: participantRows.length,
  });

  return { success: true, data: { id: session.id } };
}

export async function saveTonightsMood(sessionId: string, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage sessions." };

  const idResult = sessionIdSchema.safeParse(sessionId);
  if (!idResult.success) return { success: false, error: "Invalid session." };

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", idResult.data)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (sessionError) return { success: false, error: "Could not verify session." };
  if (!session) return { success: false, error: "Session not found." };

  // The trusted list of participant ids the form is allowed to write to - a
  // tampered participant id from a different session must fail here, not
  // just be silently unreachable later, same pattern createSession already
  // uses for friendIds.
  const { data: participantRows, error: participantsError } = await supabase
    .from("session_participants")
    .select("id")
    .eq("session_id", idResult.data);

  if (participantsError) return { success: false, error: "Could not load participants." };

  const participantIds = (participantRows ?? []).map((row) => row.id);
  const parsed = parseMoodInput(readMoodFormData(formData, participantIds));
  if (!parsed.success) return { success: false, error: parsed.error };

  const updates = await Promise.all(
    parsed.data.participants.map((participant) =>
      supabase
        .from("session_participants")
        .update({
          mood_tags: participant.moodTags,
          mood_note: participant.moodNote,
          constraints: participant.constraints,
        })
        .eq("id", participant.participantId)
        .eq("session_id", idResult.data)
    )
  );

  if (updates.some((result) => result.error)) {
    return { success: false, error: "Could not save everyone's mood." };
  }

  const { error: sessionUpdateError } = await supabase
    .from("sessions")
    .update({ youngest_viewer_age: parsed.data.youngestViewerAge })
    .eq("id", idResult.data)
    .eq("owner_id", ownerId);

  if (sessionUpdateError) return { success: false, error: "Could not save the youngest viewer's age." };

  revalidatePath(`/sessions/${idResult.data}`);
  return { success: true, data: undefined };
}

// One-way save (build-plan feature 17): once a pick is chosen there's no
// un-choose or edit path yet, matching this feature's spec'd scope.
export async function chooseSessionFilm(
  sessionId: string,
  movieId: number,
  rationale: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage sessions." };

  const idResult = sessionIdSchema.safeParse(sessionId);
  const movieIdResult = movieIdSchema.safeParse(movieId);
  if (!idResult.success || !movieIdResult.success) return { success: false, error: "Invalid session or film." };

  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({ chosen_movie_id: movieIdResult.data, rationale })
    .eq("id", idResult.data)
    .eq("owner_id", ownerId)
    .select("id, watched_on")
    .maybeSingle();

  if (updateError) return { success: false, error: "Could not save this pick." };
  if (!updated) return { success: false, error: "Session not found." };

  // Seen-list marking (build-plan feature 18) is best-effort and happens
  // after the pick itself is safely saved - see markParticipantsAsSeen's
  // own error handling.
  const { data: participantRows } = await supabase
    .from("session_participants")
    .select("friend_id")
    .eq("session_id", idResult.data);

  await markParticipantsAsSeen(
    supabase,
    ownerId,
    movieIdResult.data,
    updated.watched_on,
    (participantRows ?? []).map((row) => ({ friendId: row.friend_id }))
  );

  await logUsageEvent(supabase, "film_chosen", ownerId, { movieId: movieIdResult.data });

  revalidatePath(`/sessions/${idResult.data}`);
  revalidatePath("/sessions");
  return { success: true, data: undefined };
}
