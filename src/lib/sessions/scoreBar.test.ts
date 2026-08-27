import { describe, expect, it } from "vitest";
import { clampScore, scoreBarColor } from "./scoreBar";

describe("clampScore", () => {
  it("passes through an in-range value", () => {
    expect(clampScore(0.42)).toBe(0.42);
  });

  it("clamps below 0", () => {
    expect(clampScore(-1)).toBe(0);
  });

  it("clamps above 1", () => {
    expect(clampScore(2)).toBe(1);
  });
});

describe("scoreBarColor", () => {
  it("is exact magenta at score 0", () => {
    expect(scoreBarColor(0)).toBe("rgb(255, 46, 154)");
  });

  it("is exact lime at score 1", () => {
    expect(scoreBarColor(1)).toBe("rgb(182, 255, 58)");
  });

  it("interpolates at the midpoint", () => {
    expect(scoreBarColor(0.5)).toBe("rgb(219, 151, 106)");
  });

  it("clamps an out-of-range score before interpolating", () => {
    expect(scoreBarColor(-1)).toBe(scoreBarColor(0));
    expect(scoreBarColor(2)).toBe(scoreBarColor(1));
  });
});
