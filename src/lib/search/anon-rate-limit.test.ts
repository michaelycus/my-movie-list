import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANON_SEMANTIC_SEARCH_DAILY_CAP,
  ipHash,
  underAnonSemanticSearchCap,
} from "./anon-rate-limit";

function mockClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc } as unknown as SupabaseClient & { rpc: typeof rpc };
}

function request(forwardedFor: string | null): Request {
  const headers = new Headers();
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  return new Request("http://localhost/api/search?q=x", { headers });
}

describe("ipHash", () => {
  it("hashes the first x-forwarded-for entry", () => {
    const hash = ipHash(request("203.0.113.5, 10.0.0.1"));
    expect(hash).toBe(ipHash(request("203.0.113.5")));
  });

  it("hashes different IPs to different values", () => {
    expect(ipHash(request("203.0.113.5"))).not.toBe(ipHash(request("203.0.113.6")));
  });

  it("falls back to a shared bucket when the header is missing", () => {
    expect(ipHash(request(null))).toBe(ipHash(request(null)));
  });
});

describe("underAnonSemanticSearchCap", () => {
  it("returns true when the incremented count is under the cap", async () => {
    const client = mockClient({ data: ANON_SEMANTIC_SEARCH_DAILY_CAP, error: null });

    const result = await underAnonSemanticSearchCap(client, "hash1");

    expect(client.rpc).toHaveBeenCalledWith("increment_anon_search_count", {
      p_ip_hash: "hash1",
    });
    expect(result).toBe(true);
  });

  it("returns false once the incremented count exceeds the cap", async () => {
    const client = mockClient({
      data: ANON_SEMANTIC_SEARCH_DAILY_CAP + 1,
      error: null,
    });

    expect(await underAnonSemanticSearchCap(client, "hash1")).toBe(false);
  });

  it("fails open when the RPC errors", async () => {
    const client = mockClient({ data: null, error: new Error("boom") });

    expect(await underAnonSemanticSearchCap(client, "hash1")).toBe(true);
  });
});
