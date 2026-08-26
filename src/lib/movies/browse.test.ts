import { describe, expect, it } from "vitest";
import { parseBrowseParams } from "./browse";

describe("parseBrowseParams", () => {
  it("accepts a valid sort and page", () => {
    expect(parseBrowseParams({ sort: "rating", page: "3" })).toEqual({
      sort: "rating",
      page: 3,
    });
  });

  it("falls back to popularity for an unrecognized sort", () => {
    expect(parseBrowseParams({ sort: "nonsense" }).sort).toBe("popularity");
  });

  it("defaults sort to popularity when missing", () => {
    expect(parseBrowseParams({}).sort).toBe("popularity");
  });

  it("defaults page to 1 when missing", () => {
    expect(parseBrowseParams({}).page).toBe(1);
  });

  it("clamps a non-numeric page to 1", () => {
    expect(parseBrowseParams({ page: "abc" }).page).toBe(1);
  });

  it("clamps a zero page to 1", () => {
    expect(parseBrowseParams({ page: "0" }).page).toBe(1);
  });

  it("clamps a negative page to 1", () => {
    expect(parseBrowseParams({ page: "-5" }).page).toBe(1);
  });

  it("takes the first value when a param repeats in the URL", () => {
    expect(parseBrowseParams({ sort: ["rating", "popularity"] }).sort).toBe(
      "rating"
    );
  });
});
