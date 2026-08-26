import { describe, expect, it, vi } from "vitest";
import {
  fetchCreditsForMovies,
  fetchMoviesNeedingEmbeddings,
  updateEmbeddings,
} from "./embedding-upsert";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

/**
 * A generic stand-in for a supabase-js query builder: every chained method
 * (select/is/in/order/eq/limit/update) records itself and returns the same
 * builder, and the builder is thenable so `await`ing it at any chain depth
 * resolves to `result` - mirroring how the real client resolves regardless
 * of which methods were chained before it.
 */
function mockAdmin(resultsByTable: Record<string, unknown>) {
  const calls: RecordedCall[] = [];
  const methods = ["select", "is", "in", "order", "eq", "limit", "update"] as const;

  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const method of methods) {
      b[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return b;
      });
    }
    b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resultsByTable[table]).then(resolve, reject);
    return b;
  }

  const from = vi.fn((table: string) => builder(table));
  return { admin: { from } as unknown as SupabaseClient, calls };
}

describe("fetchMoviesNeedingEmbeddings", () => {
  it("queries movies missing embeddings, oldest id first, up to the limit", async () => {
    const { admin, calls } = mockAdmin({
      movies: {
        data: [{ id: 1, title: "A", tagline: null, overview: null, keywords: [] }],
        error: null,
      },
    });

    const result = await fetchMoviesNeedingEmbeddings(admin, 100);

    expect(result).toEqual([{ id: 1, title: "A", tagline: null, overview: null, keywords: [] }]);
    expect(calls).toEqual([
      { table: "movies", method: "select", args: ["id, title, tagline, overview, keywords"] },
      { table: "movies", method: "is", args: ["embedded_at", null] },
      { table: "movies", method: "order", args: ["id"] },
      { table: "movies", method: "limit", args: [100] },
    ]);
  });

  it("returns an empty array when the query has no results", async () => {
    const { admin } = mockAdmin({ movies: { data: null, error: null } });
    expect(await fetchMoviesNeedingEmbeddings(admin, 100)).toEqual([]);
  });

  it("throws on a query error", async () => {
    const { admin } = mockAdmin({ movies: { data: null, error: new Error("boom") } });
    await expect(fetchMoviesNeedingEmbeddings(admin, 100)).rejects.toThrow("boom");
  });
});

describe("fetchCreditsForMovies", () => {
  it("does nothing for an empty id list", async () => {
    const { admin, calls } = mockAdmin({});
    expect(await fetchCreditsForMovies(admin, [])).toEqual({ castRows: [], crewRows: [] });
    expect(calls).toEqual([]);
  });

  it("fetches and maps cast (ordered by billing_order) and director-only crew", async () => {
    const { admin, calls } = mockAdmin({
      movie_cast: {
        data: [
          { movie_id: 1, person_name: "Sam Worthington" },
          { movie_id: 1, person_name: "Zoe Saldana" },
        ],
        error: null,
      },
      movie_crew: { data: [{ movie_id: 1, person_name: "James Cameron" }], error: null },
    });

    const result = await fetchCreditsForMovies(admin, [1]);

    expect(result).toEqual({
      castRows: [
        { movieId: 1, personName: "Sam Worthington" },
        { movieId: 1, personName: "Zoe Saldana" },
      ],
      crewRows: [{ movieId: 1, personName: "James Cameron" }],
    });

    const crewCall = calls.find((c) => c.table === "movie_crew" && c.method === "eq");
    expect(crewCall?.args).toEqual(["job", "Director"]);
    const castOrderCall = calls.find((c) => c.table === "movie_cast" && c.method === "order");
    expect(castOrderCall?.args).toEqual(["billing_order"]);
  });

  it("throws on a movie_cast query error", async () => {
    const { admin } = mockAdmin({
      movie_cast: { data: null, error: new Error("boom") },
      movie_crew: { data: [], error: null },
    });
    await expect(fetchCreditsForMovies(admin, [1])).rejects.toThrow("boom");
  });

  it("throws on a movie_crew query error", async () => {
    const { admin } = mockAdmin({
      movie_cast: { data: [], error: null },
      movie_crew: { data: null, error: new Error("boom") },
    });
    await expect(fetchCreditsForMovies(admin, [1])).rejects.toThrow("boom");
  });
});

describe("updateEmbeddings", () => {
  it("updates each row by id with its embedding, text, and a timestamp", async () => {
    const { admin, calls } = mockAdmin({ movies: { error: null } });

    await updateEmbeddings(admin, [
      { id: 1, embedding: [0.1, 0.2], embeddingText: "Title: A" },
      { id: 2, embedding: [0.3, 0.4], embeddingText: "Title: B" },
    ]);

    const updateCalls = calls.filter((c) => c.table === "movies" && c.method === "update");
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].args[0]).toMatchObject({ embedding: [0.1, 0.2], embedding_text: "Title: A" });
    expect(updateCalls[1].args[0]).toMatchObject({ embedding: [0.3, 0.4], embedding_text: "Title: B" });

    const eqCalls = calls.filter((c) => c.table === "movies" && c.method === "eq");
    expect(eqCalls.map((c) => c.args)).toEqual([["id", 1], ["id", 2]]);
  });

  it("does nothing for an empty batch", async () => {
    const { admin, calls } = mockAdmin({});
    await updateEmbeddings(admin, []);
    expect(calls).toEqual([]);
  });

  it("throws on an update error", async () => {
    const { admin } = mockAdmin({ movies: { error: new Error("boom") } });
    await expect(
      updateEmbeddings(admin, [{ id: 1, embedding: [0.1], embeddingText: "x" }])
    ).rejects.toThrow("boom");
  });
});
