import { createClient } from "@/lib/supabase/server";
import { parseCalibrationPicks } from "@/lib/friends/calibration";
import type { Friend, FriendDetail } from "@/types/friend";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

interface FriendRow {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  updated_at: string;
  answers: Record<string, unknown> | null;
}

interface FriendDetailRow {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  answers: Record<string, unknown> | null;
}

// `answers` defaults to '{}' until the questionnaire is first saved (feature 9).
// Checked via a required questionnaire field rather than "any key present" -
// `answers` can hold only `calibrationPicks` (feature 10) if a friend does the
// poster step before ever filling in the questionnaire, and that alone
// shouldn't count as "answered".
function hasAnswers(answers: Record<string, unknown> | null): boolean {
  return typeof answers?.lovedFilm === "string" && answers.lovedFilm.length > 0;
}

// Scoped by owner_id explicitly, not just left to RLS, per coding-standards.md.
export async function getFriends(ownerId: string): Promise<Friend[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("friends")
    .select("id, display_name, avatar_emoji, updated_at, answers")
    .eq("owner_id", ownerId)
    .order("display_name", { ascending: true })
    .returns<FriendRow[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarEmoji: row.avatar_emoji,
    updatedAt: row.updated_at,
    hasAnswers: hasAnswers(row.answers),
  }));
}

// Scoped by both id and owner_id explicitly - a wrong-owner id returns null
// the same way a missing id would, rather than leaking whether the id exists.
export async function getFriend(
  id: string,
  ownerId: string
): Promise<FriendDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("friends")
    .select("id, display_name, avatar_emoji, answers")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle()
    .returns<FriendDetailRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    avatarEmoji: data.avatar_emoji,
    answers: hasAnswers(data.answers)
      ? (data.answers as unknown as QuestionnaireAnswers)
      : null,
    calibrationPicks: parseCalibrationPicks(data.answers?.calibrationPicks),
  };
}
