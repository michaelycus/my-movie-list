import { describe, expect, it } from "vitest";
import { computeGroupScore } from "./groupScore";

describe("computeGroupScore", () => {
  it("reproduces 14a's real score_group output for the same inputs", () => {
    // The actual "Forrest Gump" row returned by score_group against the dev
    // catalog during 14a's live verification: participant_scores [1,
    // 0.371602], consensus_weight 0.6 -> group_score ~0.560122 (Postgres
    // `real`/float4 precision; toBeCloseTo tolerates the last-digit float
    // rounding difference from JS's own double-precision math).
    expect(computeGroupScore([1, 0.371602], 0.6)).toBeCloseTo(0.560122, 5);
  });

  it("equals the single score when there's only one participant (avg === min)", () => {
    expect(computeGroupScore([0.42], 0.6)).toBeCloseTo(0.42, 10);
    expect(computeGroupScore([0.42], 0)).toBeCloseTo(0.42, 10);
    expect(computeGroupScore([0.42], 1)).toBeCloseTo(0.42, 10);
  });

  it("returns 0 for no scored participants", () => {
    expect(computeGroupScore([], 0.6)).toBe(0);
  });

  it("is the pure average at consensusWeight 1", () => {
    expect(computeGroupScore([0.2, 0.8], 1)).toBeCloseTo(0.5, 10);
  });

  it("is the pure least-misery (min) at consensusWeight 0", () => {
    expect(computeGroupScore([0.2, 0.8], 0)).toBeCloseTo(0.2, 10);
  });
});
