import { describe, expect, it } from "vitest";
import {
  buildSearchHref,
  clearFiltersHref,
  decadeToDateRange,
  hasActiveFilters,
  parseBrowseParams,
  runtimeBandToRange,
  type BrowseParams,
} from "./browse";

const DEFAULT_PARAMS: BrowseParams = {
  sort: "popularity",
  page: 1,
  q: null,
  genreIds: [],
  decade: null,
  runtimeBand: null,
  maxAge: null,
};

describe("parseBrowseParams", () => {
  it("accepts a valid sort and page", () => {
    expect(parseBrowseParams({ sort: "rating", page: "3" })).toEqual({
      ...DEFAULT_PARAMS,
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

  it("trims a text query", () => {
    expect(parseBrowseParams({ q: "  tarantino  " }).q).toBe("tarantino");
  });

  it("treats a blank query as absent", () => {
    expect(parseBrowseParams({ q: "   " }).q).toBeNull();
  });

  it("defaults q to null when missing", () => {
    expect(parseBrowseParams({}).q).toBeNull();
  });

  it("parses repeated genre params", () => {
    expect(parseBrowseParams({ genre: ["28", "35"] }).genreIds).toEqual([
      28, 35,
    ]);
  });

  it("parses a comma-separated genre param", () => {
    expect(parseBrowseParams({ genre: "28,35" }).genreIds).toEqual([28, 35]);
  });

  it("drops invalid genre ids without rejecting the valid ones", () => {
    expect(parseBrowseParams({ genre: "28,abc,-1,0" }).genreIds).toEqual([
      28,
    ]);
  });

  it("dedupes repeated genre ids", () => {
    expect(parseBrowseParams({ genre: "28,28" }).genreIds).toEqual([28]);
  });

  it("defaults genreIds to an empty array when missing", () => {
    expect(parseBrowseParams({}).genreIds).toEqual([]);
  });

  it("accepts a valid decade", () => {
    expect(parseBrowseParams({ decade: "1990" }).decade).toBe(1990);
  });

  it("rejects a decade that isn't a multiple of 10", () => {
    expect(parseBrowseParams({ decade: "1995" }).decade).toBeNull();
  });

  it("rejects a decade outside the known range", () => {
    expect(parseBrowseParams({ decade: "1900" }).decade).toBeNull();
    expect(parseBrowseParams({ decade: "2030" }).decade).toBeNull();
  });

  it("defaults decade to null when missing", () => {
    expect(parseBrowseParams({}).decade).toBeNull();
  });

  it("accepts a valid runtime band", () => {
    expect(parseBrowseParams({ runtime: "short" }).runtimeBand).toBe("short");
  });

  it("rejects an unrecognized runtime band", () => {
    expect(parseBrowseParams({ runtime: "epic" }).runtimeBand).toBeNull();
  });

  it("defaults runtimeBand to null when missing", () => {
    expect(parseBrowseParams({}).runtimeBand).toBeNull();
  });

  it("accepts a known age ceiling", () => {
    expect(parseBrowseParams({ age: "16" }).maxAge).toBe(16);
  });

  it("rejects an age ceiling that isn't a real certification", () => {
    expect(parseBrowseParams({ age: "15" }).maxAge).toBeNull();
  });

  it("defaults maxAge to null when missing", () => {
    expect(parseBrowseParams({}).maxAge).toBeNull();
  });
});

describe("decadeToDateRange", () => {
  it("bounds a decade inclusive-start, exclusive-end", () => {
    expect(decadeToDateRange(1990)).toEqual({
      start: "1990-01-01",
      end: "2000-01-01",
    });
  });
});

describe("runtimeBandToRange", () => {
  it("bounds 'short' as under 90 minutes", () => {
    expect(runtimeBandToRange("short")).toEqual({ min: null, max: 89 });
  });

  it("bounds 'standard' as 90 to 150 minutes", () => {
    expect(runtimeBandToRange("standard")).toEqual({ min: 90, max: 150 });
  });

  it("bounds 'long' as over 150 minutes", () => {
    expect(runtimeBandToRange("long")).toEqual({ min: 151, max: null });
  });
});

describe("buildSearchHref", () => {
  it("returns the bare path when everything is default or empty", () => {
    expect(buildSearchHref(DEFAULT_PARAMS)).toBe("/");
  });

  it("omits the default sort and page", () => {
    expect(buildSearchHref({ ...DEFAULT_PARAMS, sort: "popularity", page: 1 })).toBe(
      "/"
    );
  });

  it("includes a non-default sort and page", () => {
    expect(
      buildSearchHref({ ...DEFAULT_PARAMS, sort: "rating", page: 2 })
    ).toBe("/?sort=rating&page=2");
  });

  it("includes the text query", () => {
    expect(buildSearchHref({ ...DEFAULT_PARAMS, q: "tarantino" })).toBe(
      "/?q=tarantino"
    );
  });

  it("repeats the genre param for each selected genre", () => {
    expect(
      buildSearchHref({ ...DEFAULT_PARAMS, genreIds: [28, 35] })
    ).toBe("/?genre=28&genre=35");
  });

  it("includes decade, runtime band, and age ceiling", () => {
    expect(
      buildSearchHref({
        ...DEFAULT_PARAMS,
        decade: 1990,
        runtimeBand: "short",
        maxAge: 16,
      })
    ).toBe("/?decade=1990&runtime=short&age=16");
  });

  it("applies overrides on top of the current params", () => {
    const current: BrowseParams = { ...DEFAULT_PARAMS, sort: "rating", page: 3 };
    expect(buildSearchHref(current, { page: 4 })).toBe(
      "/?sort=rating&page=4"
    );
  });

  it("preserves an active filter when only sort changes", () => {
    const current: BrowseParams = { ...DEFAULT_PARAMS, q: "tarantino" };
    expect(buildSearchHref(current, { sort: "rating" })).toBe(
      "/?sort=rating&q=tarantino"
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveFilters(DEFAULT_PARAMS)).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, q: "tarantino" })).toBe(
      true
    );
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, genreIds: [28] })).toBe(
      true
    );
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, decade: 1990 })).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_PARAMS, runtimeBand: "short" })
    ).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_PARAMS, maxAge: 12 })).toBe(true);
  });

  it("ignores sort and page", () => {
    expect(
      hasActiveFilters({ ...DEFAULT_PARAMS, sort: "rating", page: 3 })
    ).toBe(false);
  });
});

describe("clearFiltersHref", () => {
  it("drops every filter but keeps a non-default sort", () => {
    const current: BrowseParams = {
      ...DEFAULT_PARAMS,
      sort: "rating",
      page: 2,
      q: "tarantino",
      genreIds: [28],
      decade: 1990,
      runtimeBand: "short",
      maxAge: 12,
    };
    expect(clearFiltersHref(current)).toBe("/?sort=rating");
  });
});
