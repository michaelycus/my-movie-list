import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Sha256 of the request's IP, so `anon_search_limits` never stores a raw
 * address. Trusts `x-forwarded-for` the way `getOrigin()` trusts
 * `x-forwarded-host` (see findings.md's F-03) - a spoofed value only lets
 * someone dodge or share a rate-limit bucket, an availability/cost concern,
 * never an auth bypass. Requests with no such header (local dev, direct
 * curl) share one "unknown" bucket rather than bypassing the cap. */
export function ipHash(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

// query_cache (6a) only saves repeat OpenAI calls for the *same* query text;
// this caps total semantic search volume per IP per day instead, since an
// anonymous visitor can otherwise burn distinct embeddings all day for free.
export const ANON_SEMANTIC_SEARCH_DAILY_CAP = 50;

/** Increments today's anonymous-search count for `hash` and reports whether
 * it's still under the cap. Fails open (`true`) on an RPC error - a
 * rate-limit outage must never take real search down with it. */
export async function underAnonSemanticSearchCap(
  client: SupabaseClient,
  hash: string
): Promise<boolean> {
  const { data, error } = await client.rpc("increment_anon_search_count", {
    p_ip_hash: hash,
  });

  if (error) {
    console.error("underAnonSemanticSearchCap: RPC failed, failing open", error);
    return true;
  }

  return (data as number) <= ANON_SEMANTIC_SEARCH_DAILY_CAP;
}
