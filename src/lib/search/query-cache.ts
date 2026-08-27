import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Case/whitespace-insensitive so "Films with Tom Hanks" and "films  with
 * tom hanks " share a query_cache row instead of paying for two embeddings. */
export function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hashQuery(text: string): string {
  return createHash("sha256").update(normalizeQuery(text)).digest("hex");
}

/** The cached embedding for `queryHash`, or `null` on a cache miss. Bumps
 * `hits` on a hit; a lost race under concurrent reads just undercounts that
 * counter, never a correctness problem for the search itself. */
export async function getCachedQueryEmbedding(
  client: SupabaseClient,
  queryHash: string
): Promise<number[] | null> {
  const { data, error } = await client
    .from("query_cache")
    .select("embedding, hits")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { error: bumpError } = await client
    .from("query_cache")
    .update({ hits: data.hits + 1 })
    .eq("query_hash", queryHash);

  if (bumpError) throw bumpError;

  return data.embedding;
}

export async function cacheQueryEmbedding(
  client: SupabaseClient,
  params: { queryHash: string; queryText: string; embedding: number[] }
): Promise<void> {
  const { error } = await client.from("query_cache").upsert(
    {
      query_hash: params.queryHash,
      query_text: params.queryText,
      embedding: params.embedding,
    },
    { onConflict: "query_hash" }
  );

  if (error) throw error;
}
