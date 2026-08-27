import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cacheQueryEmbedding,
  getCachedQueryEmbedding,
  hashQuery,
  normalizeQuery,
} from "./query-cache";

function mockClient(
  selectResult: unknown,
  updateResult: unknown = { error: null },
  upsertResult: unknown = { error: null }
) {
  const maybeSingle = vi.fn().mockResolvedValue(selectResult);
  const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });

  const eqUpdate = vi.fn().mockResolvedValue(updateResult);
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });

  const upsert = vi.fn().mockResolvedValue(upsertResult);

  const from = vi.fn().mockReturnValue({ select, update, upsert });

  return { from, select, eqSelect, maybeSingle, update, eqUpdate, upsert } as unknown as SupabaseClient & {
    from: typeof from;
    select: typeof select;
    eqSelect: typeof eqSelect;
    maybeSingle: typeof maybeSingle;
    update: typeof update;
    eqUpdate: typeof eqUpdate;
    upsert: typeof upsert;
  };
}

describe("normalizeQuery", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeQuery("  Films  with   Tom Hanks ")).toBe(
      "films with tom hanks"
    );
  });

  it("is a no-op on already-normalized text", () => {
    expect(normalizeQuery("something funny")).toBe("something funny");
  });
});

describe("hashQuery", () => {
  it("hashes equal-after-normalization inputs to the same value", () => {
    expect(hashQuery("Films with Tom Hanks")).toBe(
      hashQuery("films  with tom hanks ")
    );
  });

  it("hashes distinct inputs to distinct values", () => {
    expect(hashQuery("films with tom hanks")).not.toBe(
      hashQuery("films for kids under 10")
    );
  });

  it("returns a hex sha256 digest", () => {
    expect(hashQuery("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("getCachedQueryEmbedding", () => {
  it("returns the embedding and bumps hits on a cache hit", async () => {
    const client = mockClient({
      data: { embedding: [0.1, 0.2], hits: 3 },
      error: null,
    });

    const result = await getCachedQueryEmbedding(client, "hash123");

    expect(client.from).toHaveBeenCalledWith("query_cache");
    expect(client.select).toHaveBeenCalledWith("embedding, hits");
    expect(client.eqSelect).toHaveBeenCalledWith("query_hash", "hash123");
    expect(client.update).toHaveBeenCalledWith({ hits: 4 });
    expect(client.eqUpdate).toHaveBeenCalledWith("query_hash", "hash123");
    expect(result).toEqual([0.1, 0.2]);
  });

  it("returns null on a cache miss without bumping hits", async () => {
    const client = mockClient({ data: null, error: null });

    const result = await getCachedQueryEmbedding(client, "hash123");

    expect(result).toBeNull();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("throws on a select error", async () => {
    const client = mockClient({ data: null, error: new Error("boom") });
    await expect(getCachedQueryEmbedding(client, "hash123")).rejects.toThrow(
      "boom"
    );
  });

  it("throws on an update (hit-bump) error", async () => {
    const client = mockClient(
      { data: { embedding: [0.1], hits: 1 }, error: null },
      { error: new Error("boom") }
    );
    await expect(getCachedQueryEmbedding(client, "hash123")).rejects.toThrow(
      "boom"
    );
  });
});

describe("cacheQueryEmbedding", () => {
  it("upserts keyed on query_hash", async () => {
    const client = mockClient({});

    await cacheQueryEmbedding(client, {
      queryHash: "hash123",
      queryText: "films with tom hanks",
      embedding: [0.1, 0.2],
    });

    expect(client.from).toHaveBeenCalledWith("query_cache");
    expect(client.upsert).toHaveBeenCalledWith(
      {
        query_hash: "hash123",
        query_text: "films with tom hanks",
        embedding: [0.1, 0.2],
      },
      { onConflict: "query_hash" }
    );
  });

  it("throws on an upsert error", async () => {
    const client = mockClient({}, { error: null }, { error: new Error("boom") });
    await expect(
      cacheQueryEmbedding(client, {
        queryHash: "hash123",
        queryText: "films with tom hanks",
        embedding: [0.1],
      })
    ).rejects.toThrow("boom");
  });
});
