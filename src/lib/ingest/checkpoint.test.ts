import { describe, expect, it, vi } from "vitest";
import { getCheckpoint, setCheckpoint } from "./checkpoint";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockAdmin(maybeSingleResult: unknown, upsertResult: unknown = { error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(maybeSingleResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ select, upsert });
  return { from, select, eq, maybeSingle, upsert } as unknown as SupabaseClient & {
    from: typeof from;
    select: typeof select;
    eq: typeof eq;
    maybeSingle: typeof maybeSingle;
    upsert: typeof upsert;
  };
}

describe("getCheckpoint", () => {
  it("queries ingest_checkpoint by source and returns last_id", async () => {
    const admin = mockAdmin({ data: { last_id: 42 }, error: null });

    const result = await getCheckpoint(admin, "tmdb_ingest");

    expect(admin.from).toHaveBeenCalledWith("ingest_checkpoint");
    expect(admin.select).toHaveBeenCalledWith("last_id");
    expect(admin.eq).toHaveBeenCalledWith("source", "tmdb_ingest");
    expect(result).toBe(42);
  });

  it("returns null when no checkpoint row exists yet", async () => {
    const admin = mockAdmin({ data: null, error: null });
    expect(await getCheckpoint(admin, "tmdb_ingest")).toBeNull();
  });

  it("throws on a query error", async () => {
    const admin = mockAdmin({ data: null, error: new Error("boom") });
    await expect(getCheckpoint(admin, "tmdb_ingest")).rejects.toThrow("boom");
  });
});

describe("setCheckpoint", () => {
  it("upserts source/last_id keyed on source", async () => {
    const admin = mockAdmin({});

    await setCheckpoint(admin, "tmdb_ingest", 123);

    expect(admin.from).toHaveBeenCalledWith("ingest_checkpoint");
    expect(admin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: "tmdb_ingest", last_id: 123 }),
      { onConflict: "source" }
    );
  });

  it("throws on an upsert error", async () => {
    const admin = mockAdmin({}, { error: new Error("boom") });
    await expect(setCheckpoint(admin, "tmdb_ingest", 1)).rejects.toThrow("boom");
  });
});
