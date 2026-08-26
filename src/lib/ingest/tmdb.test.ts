import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractMinAge, fetchFilmEnrichment, mapCertificationToMinAge } from "./tmdb";

describe("mapCertificationToMinAge", () => {
  it.each([
    ["Livre", "BR", 0],
    ["10", "BR", 10],
    ["12", "BR", 12],
    ["14", "BR", 14],
    ["16", "BR", 16],
    ["18", "BR", 18],
    ["G", "US", 0],
    ["PG", "US", 8],
    ["PG-13", "US", 13],
    ["R", "US", 17],
    ["NC-17", "US", 18],
  ] as const)("maps %s (%s) to %i", (certification, country, expected) => {
    expect(mapCertificationToMinAge(certification, country)).toBe(expected);
  });

  it("returns null for an unmapped certification", () => {
    expect(mapCertificationToMinAge("NR", "US")).toBeNull();
  });
});

describe("extractMinAge", () => {
  it("prefers BR certification when present", () => {
    const response = {
      results: [
        { iso_3166_1: "US", release_dates: [{ certification: "R" }] },
        { iso_3166_1: "BR", release_dates: [{ certification: "14" }] },
      ],
    };
    expect(extractMinAge(response)).toBe(14);
  });

  it("falls back to US when BR is absent", () => {
    const response = {
      results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }],
    };
    expect(extractMinAge(response)).toBe(13);
  });

  it("falls back to US when BR's certification is empty", () => {
    const response = {
      results: [
        { iso_3166_1: "BR", release_dates: [{ certification: "" }] },
        { iso_3166_1: "US", release_dates: [{ certification: "G" }] },
      ],
    };
    expect(extractMinAge(response)).toBe(0);
  });

  it("returns null when neither country is present", () => {
    expect(extractMinAge({ results: [] })).toBeNull();
  });
});

describe("fetchFilmEnrichment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => body,
    } as Response;
  }

  it("returns poster, backdrop, and min age on success", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/release_dates")) {
        return jsonResponse({
          results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG" }] }],
        });
      }
      return jsonResponse({ poster_path: "/p.jpg", backdrop_path: "/b.jpg" });
    });

    const result = await fetchFilmEnrichment(19995, "key");

    expect(result).toEqual({ posterPath: "/p.jpg", backdropPath: "/b.jpg", minAge: 8 });
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchMock = vi.mocked(fetch);
    let detailsCalls = 0;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/release_dates")) {
        return jsonResponse({ results: [] });
      }
      detailsCalls++;
      if (detailsCalls === 1) return jsonResponse({}, 429);
      return jsonResponse({ poster_path: null, backdrop_path: null });
    });

    const promise = fetchFilmEnrichment(1, "key");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ posterPath: null, backdropPath: null, minAge: null });
    expect(detailsCalls).toBe(2);
  });

  it("throws after exhausting retries on persistent failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const promise = fetchFilmEnrichment(1, "key");
    const expectation = expect(promise).rejects.toThrow("TMDB request failed");
    await vi.runAllTimersAsync();
    await expectation;
  });
});
