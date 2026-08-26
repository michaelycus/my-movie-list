import type { SupabaseClient } from "@supabase/supabase-js";

/** The last processed TMDB id for `source`, or `null` if ingest hasn't run yet. */
export async function getCheckpoint(
  admin: SupabaseClient,
  source: string
): Promise<number | null> {
  const { data, error } = await admin
    .from("ingest_checkpoint")
    .select("last_id")
    .eq("source", source)
    .maybeSingle();

  if (error) throw error;
  return data?.last_id ?? null;
}

export async function setCheckpoint(
  admin: SupabaseClient,
  source: string,
  lastId: number
): Promise<void> {
  const { error } = await admin
    .from("ingest_checkpoint")
    .upsert(
      { source, last_id: lastId, updated_at: new Date().toISOString() },
      { onConflict: "source" }
    );

  if (error) throw error;
}
