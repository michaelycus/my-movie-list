import { describe, expect, it } from "vitest";
import { computeGlobalVoteStats, computeWeightedRating } from "./rating";

describe("computeGlobalVoteStats", () => {
  it("computes the mean of films with votes, and the median count across all films", () => {
    const films = [
      { voteAverage: 8, voteCount: 100 },
      { voteAverage: 6, voteCount: 0 },
      { voteAverage: 7, voteCount: 200 },
      { voteAverage: 5, voteCount: 50 },
    ];

    const stats = computeGlobalVoteStats(films);

    expect(stats.meanVote).toBeCloseTo((8 + 7 + 5) / 3, 10);
    expect(stats.minVotesThreshold).toBe(75); // median of [0, 50, 100, 200]
  });
});

describe("computeWeightedRating", () => {
  it("returns exactly the global mean when a film has no votes", () => {
    expect(computeWeightedRating(9, 0, 6.17, 236)).toBe(6.17);
  });

  it("matches a hand-computed value", () => {
    // v/(v+m) = 100/150 = 2/3, m/(v+m) = 1/3 -> (2/3)*8 + (1/3)*6 = 22/3
    expect(computeWeightedRating(8, 100, 6, 50)).toBeCloseTo(22 / 3, 10);
  });

  it("converges toward the film's own average as votes grow far past the threshold", () => {
    expect(computeWeightedRating(8, 1_000_000, 6, 236)).toBeCloseTo(8, 2);
  });
});
