import { createClient } from "@/lib/supabase/server";
import type { Friend } from "@/types/friend";

interface FriendRow {
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  updated_at: string;
}

// Scoped by owner_id explicitly, not just left to RLS, per coding-standards.md.
export async function getFriends(ownerId: string): Promise<Friend[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("friends")
    .select("id, display_name, avatar_emoji, updated_at")
    .eq("owner_id", ownerId)
    .order("display_name", { ascending: true })
    .returns<FriendRow[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    avatarEmoji: row.avatar_emoji,
    updatedAt: row.updated_at,
  }));
}
