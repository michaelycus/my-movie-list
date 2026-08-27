"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOwnerId } from "@/lib/supabase/owner";
import { parseSessionInput, readSessionFormData } from "@/lib/sessions/validation";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

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

  return { success: true, data: { id: session.id } };
}
