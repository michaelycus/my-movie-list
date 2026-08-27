"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseFriendInput } from "@/lib/friends/validation";
import {
  deriveHardFilters,
  parseQuestionnaireInput,
  readQuestionnaireFormData,
} from "@/lib/friends/questionnaire";
import { parseCalibrationPicks, upsertCalibrationPick } from "@/lib/friends/calibration";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const friendIdSchema = z.string().uuid();
const movieIdSchema = z.number().int().positive();

// getClaims(), not getUser(): verifies locally against a cached JWKS, same
// call src/proxy.ts and SiteHeader already use - no redundant Auth-server
// round trip per action call.
async function requireOwnerId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

function readFriendInput(formData: FormData) {
  return parseFriendInput({
    displayName: formData.get("displayName"),
    avatarEmoji: formData.get("avatarEmoji"),
  });
}

export async function createFriend(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage friends." };

  const parsed = readFriendInput(formData);
  if (!parsed.success) return { success: false, error: parsed.error };

  const { data, error } = await supabase
    .from("friends")
    .insert({
      owner_id: ownerId,
      display_name: parsed.data.displayName,
      avatar_emoji: parsed.data.avatarEmoji,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: "Could not add friend." };

  revalidatePath("/friends");
  return { success: true, data: { id: data.id } };
}

export async function updateFriend(
  friendId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage friends." };

  const idResult = friendIdSchema.safeParse(friendId);
  if (!idResult.success) return { success: false, error: "Invalid friend." };

  const parsed = readFriendInput(formData);
  if (!parsed.success) return { success: false, error: parsed.error };

  // owner_id scoped explicitly in the query, not left to RLS alone.
  const { error } = await supabase
    .from("friends")
    .update({
      display_name: parsed.data.displayName,
      avatar_emoji: parsed.data.avatarEmoji,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idResult.data)
    .eq("owner_id", ownerId);

  if (error) return { success: false, error: "Could not update friend." };

  revalidatePath("/friends");
  return { success: true, data: undefined };
}

export async function deleteFriend(friendId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage friends." };

  const idResult = friendIdSchema.safeParse(friendId);
  if (!idResult.success) return { success: false, error: "Invalid friend." };

  const { error } = await supabase
    .from("friends")
    .delete()
    .eq("id", idResult.data)
    .eq("owner_id", ownerId);

  if (error) return { success: false, error: "Could not delete friend." };

  revalidatePath("/friends");
  return { success: true, data: undefined };
}

export async function saveQuestionnaire(
  friendId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage friends." };

  const idResult = friendIdSchema.safeParse(friendId);
  if (!idResult.success) return { success: false, error: "Invalid friend." };

  const parsed = parseQuestionnaireInput(readQuestionnaireFormData(formData));
  if (!parsed.success) return { success: false, error: parsed.error };

  const hardFilters = deriveHardFilters(parsed.data);

  // `answers` also holds calibrationPicks (feature 10) in the same jsonb
  // column - read-modify-write so this save doesn't wipe them out.
  const { data: current, error: fetchError } = await supabase
    .from("friends")
    .select("answers")
    .eq("id", idResult.data)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchError) return { success: false, error: "Could not save answers." };

  const calibrationPicks = parseCalibrationPicks(
    (current?.answers as Record<string, unknown> | null)?.calibrationPicks
  );

  // owner_id scoped explicitly in the query, not left to RLS alone.
  const { error } = await supabase
    .from("friends")
    .update({
      answers: { ...parsed.data, calibrationPicks },
      hard_filters: hardFilters,
      updated_at: new Date().toISOString(),
    })
    .eq("id", idResult.data)
    .eq("owner_id", ownerId);

  if (error) return { success: false, error: "Could not save answers." };

  revalidatePath(`/friends/${idResult.data}/questionnaire`);
  revalidatePath("/friends");
  return { success: true, data: undefined };
}

export async function saveCalibrationPick(
  friendId: string,
  movieId: number,
  liked: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerId = await requireOwnerId(supabase);
  if (!ownerId) return { success: false, error: "Sign in to manage friends." };

  const idResult = friendIdSchema.safeParse(friendId);
  if (!idResult.success) return { success: false, error: "Invalid friend." };

  const movieIdResult = movieIdSchema.safeParse(movieId);
  if (!movieIdResult.success) return { success: false, error: "Invalid film." };

  // `answers` also holds the questionnaire's own fields (feature 9) in the
  // same jsonb column - read-modify-write so this save only ever touches
  // calibrationPicks.
  const { data: current, error: fetchError } = await supabase
    .from("friends")
    .select("answers")
    .eq("id", idResult.data)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchError) return { success: false, error: "Could not save your pick." };
  if (!current) return { success: false, error: "Friend not found." };

  const existingAnswers = (current.answers as Record<string, unknown>) ?? {};
  const updatedPicks = upsertCalibrationPick(
    parseCalibrationPicks(existingAnswers.calibrationPicks),
    { movieId: movieIdResult.data, liked }
  );

  const { error } = await supabase
    .from("friends")
    .update({
      answers: { ...existingAnswers, calibrationPicks: updatedPicks },
      updated_at: new Date().toISOString(),
    })
    .eq("id", idResult.data)
    .eq("owner_id", ownerId);

  if (error) return { success: false, error: "Could not save your pick." };

  revalidatePath(`/friends/${idResult.data}/questionnaire`);
  return { success: true, data: undefined };
}
