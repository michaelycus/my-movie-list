import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchMovies, type MatchedMovieRow } from "./match";

function mockClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc } as unknown as SupabaseClient & { rpc: typeof rpc };
}

const sampleRow: MatchedMovieRow = {
  id: 1,
  title: "Four Rooms",
  poster_path: "/poster.jpg",
  release_date: "1995-12-09",
  vote_average: 6.5,
  weighted_rating: 6.2,
  popularity: 22.4,
  genre_ids: [80],
  runtime: 98,
  min_age: 16,
  similarity: 0.87,
};

describe("matchMovies", () => {
  it("calls the RPC with the embedding and match count", async () => {
    const client = mockClient({ data: [sampleRow], error: null });

    const result = await matchMovies(client, [0.1, 0.2], 50);

    expect(client.rpc).toHaveBeenCalledWith("match_movies", {
      query_embedding: [0.1, 0.2],
      match_count: 50,
    });
    expect(result).toEqual([sampleRow]);
  });

  it("defaults match_count to 200", async () => {
    const client = mockClient({ data: [], error: null });

    await matchMovies(client, [0.1]);

    expect(client.rpc).toHaveBeenCalledWith("match_movies", {
      query_embedding: [0.1],
      match_count: 200,
    });
  });

  it("returns an empty array when data is null", async () => {
    const client = mockClient({ data: null, error: null });
    expect(await matchMovies(client, [0.1])).toEqual([]);
  });

  it("throws on an RPC error", async () => {
    const client = mockClient({ data: null, error: new Error("boom") });
    await expect(matchMovies(client, [0.1])).rejects.toThrow("boom");
  });
});
