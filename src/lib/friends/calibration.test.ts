import { describe, expect, it } from "vitest";
import { parseCalibrationPicks, upsertCalibrationPick } from "./calibration";

describe("parseCalibrationPicks", () => {
  it("accepts a valid array", () => {
    expect(
      parseCalibrationPicks([
        { movieId: 27, liked: true },
        { movieId: 105, liked: false },
      ])
    ).toEqual([
      { movieId: 27, liked: true },
      { movieId: 105, liked: false },
    ]);
  });

  it("returns an empty array for missing input", () => {
    expect(parseCalibrationPicks(undefined)).toEqual([]);
    expect(parseCalibrationPicks(null)).toEqual([]);
  });

  it("returns an empty array for a non-array value", () => {
    expect(parseCalibrationPicks({ movieId: 27, liked: true })).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    expect(
      parseCalibrationPicks([
        { movieId: 27, liked: true },
        { movieId: "not-a-number", liked: false },
        { movieId: 105 },
        null,
        { movieId: 200, liked: false },
      ])
    ).toEqual([
      { movieId: 27, liked: true },
      { movieId: 200, liked: false },
    ]);
  });
});

describe("upsertCalibrationPick", () => {
  it("appends a pick for a new film", () => {
    expect(upsertCalibrationPick([{ movieId: 27, liked: true }], { movieId: 105, liked: false })).toEqual([
      { movieId: 27, liked: true },
      { movieId: 105, liked: false },
    ]);
  });

  it("replaces the existing pick for the same film instead of duplicating it", () => {
    expect(
      upsertCalibrationPick(
        [
          { movieId: 27, liked: true },
          { movieId: 105, liked: false },
        ],
        { movieId: 27, liked: false }
      )
    ).toEqual([
      { movieId: 27, liked: false },
      { movieId: 105, liked: false },
    ]);
  });
});
