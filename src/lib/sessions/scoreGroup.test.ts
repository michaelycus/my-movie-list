import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreGroup, type ScoreGroupParams } from "./scoreGroup";

function mockClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc } as unknown as SupabaseClient & { rpc: typeof rpc };
}

const baseParams: ScoreGroupParams = {
  embeddings: [[0.1, 0.2]],
  maxRuntime: 120,
  minAgeCeiling: 12,
  blockedGenres: [27],
};

const sampleRow = {
  id: 13,
  title: "Forrest Gump",
  poster_path: "/poster.jpg",
  release_date: "1994-07-06",
  vote_average: 8.2,
  weighted_rating: 8.0,
  popularity: 48.3,
  runtime: 142,
  min_age: 12,
  group_score: 0.56,
  participant_scores: [1, 0.37],
};

describe("scoreGroup", () => {
  it("calls the RPC with snake_case params and default consensus/match count", async () => {
    const client = mockClient({ data: [sampleRow], error: null });

    const result = await scoreGroup(client, baseParams);

    expect(client.rpc).toHaveBeenCalledWith("score_group", {
      embeddings: [[0.1, 0.2]],
      max_runtime: 120,
      min_age_ceiling: 12,
      blocked_genres: [27],
      consensus_weight: 0.6,
      match_count: 10,
      excluded_movie_ids: [],
    });
    expect(result).toEqual([
      {
        id: 13,
        title: "Forrest Gump",
        posterPath: "/poster.jpg",
        releaseDate: "1994-07-06",
        voteAverage: 8.2,
        weightedRating: 8.0,
        popularity: 48.3,
        runtime: 142,
        minAge: 12,
        groupScore: 0.56,
        participantScores: [1, 0.37],
      },
    ]);
  });

  it("passes explicit consensusWeight and matchCount through", async () => {
    const client = mockClient({ data: [], error: null });

    await scoreGroup(client, { ...baseParams, consensusWeight: 0.4, matchCount: 5 });

    expect(client.rpc).toHaveBeenCalledWith(
      "score_group",
      expect.objectContaining({ consensus_weight: 0.4, match_count: 5 })
    );
  });

  it("passes excludedMovieIds through, defaulting to an empty array", async () => {
    const client = mockClient({ data: [], error: null });

    await scoreGroup(client, { ...baseParams, excludedMovieIds: [13, 27] });

    expect(client.rpc).toHaveBeenCalledWith(
      "score_group",
      expect.objectContaining({ excluded_movie_ids: [13, 27] })
    );
  });

  it("returns [] without calling the RPC when there are no scored participants", async () => {
    const client = mockClient({ data: [sampleRow], error: null });

    const result = await scoreGroup(client, { ...baseParams, embeddings: [] });

    expect(result).toEqual([]);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("returns an empty array when data is null", async () => {
    const client = mockClient({ data: null, error: null });
    expect(await scoreGroup(client, baseParams)).toEqual([]);
  });

  it("throws on an RPC error", async () => {
    const client = mockClient({ data: null, error: new Error("boom") });
    await expect(scoreGroup(client, baseParams)).rejects.toThrow("boom");
  });
});
