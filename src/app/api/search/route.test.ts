import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() factories are hoisted above the file's own declarations, so
// mockClient has to be created via vi.hoisted() to be visible inside them.
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    mockClient: true,
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }) },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock("@/lib/movies/browse", () => ({
  getGenres: vi.fn(),
  PAGE_SIZE: 24,
}));

vi.mock("@/lib/search/parse", () => ({
  parseSearchQuery: vi.fn(),
}));

vi.mock("@/lib/search/retrieve", () => ({
  searchMovies: vi.fn(),
}));

vi.mock("@/lib/search/anon-rate-limit", () => ({
  ipHash: vi.fn().mockReturnValue("hashed-ip"),
  underAnonSemanticSearchCap: vi.fn(),
}));

vi.mock("@/lib/usage/events", () => ({
  logUsageEvent: vi.fn(),
}));

import { GET } from "./route";
import { getGenres, PAGE_SIZE } from "@/lib/movies/browse";
import { parseSearchQuery } from "@/lib/search/parse";
import { searchMovies } from "@/lib/search/retrieve";
import type { RankedMovie } from "@/lib/search/retrieve";
import { underAnonSemanticSearchCap } from "@/lib/search/anon-rate-limit";
import { logUsageEvent } from "@/lib/usage/events";

function request(query: string): Request {
  return new Request(`http://localhost/api/search?${query}`);
}

const sampleGenres = [{ id: 35, name: "Comedy" }];

const sampleRanked: RankedMovie = {
  id: 1,
  title: "Four Rooms",
  poster_path: "/poster.jpg",
  release_date: "1995-12-09",
  vote_average: 6.5,
  weighted_rating: 6.2,
  popularity: 22.4,
  matchedVia: "keyword+theme",
  score: 0.9,
};

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 400 when q is missing", async () => {
    const response = await GET(request(""));
    expect(response.status).toBe(400);
  });

  it("returns 400 when q is blank after trimming", async () => {
    const response = await GET(request("q=%20%20"));
    expect(response.status).toBe(400);
  });

  it("returns 400 when q exceeds 200 characters", async () => {
    const response = await GET(request(`q=${"a".repeat(201)}`));
    expect(response.status).toBe(400);
  });

  it("parses, retrieves, and maps results on success", async () => {
    vi.mocked(getGenres).mockResolvedValue(sampleGenres);
    vi.mocked(parseSearchQuery).mockResolvedValue({
      filters: { genreIds: [35], decade: null, runtimeBand: null, maxAge: null },
      semanticQuery: "a lighthearted movie",
    });
    vi.mocked(searchMovies).mockResolvedValue([sampleRanked]);
    vi.mocked(underAnonSemanticSearchCap).mockResolvedValue(true);

    const response = await GET(request("q=funny+movie"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(underAnonSemanticSearchCap).toHaveBeenCalledWith(mockClient, "hashed-ip");
    expect(parseSearchQuery).toHaveBeenCalledWith(
      "funny movie",
      sampleGenres,
      "sk-or-test"
    );
    expect(searchMovies).toHaveBeenCalledWith(
      mockClient,
      "sk-openai-test",
      {
        filters: { genreIds: [35], decade: null, runtimeBand: null, maxAge: null },
        semanticQuery: "a lighthearted movie",
      },
      PAGE_SIZE,
      true
    );
    expect(logUsageEvent).toHaveBeenCalledWith(mockClient, "llm_call", null, { context: "search_parse" });
    expect(logUsageEvent).toHaveBeenCalledWith(mockClient, "search", null, { resultCount: 1 });
    expect(body).toEqual({
      query: "funny movie",
      semanticQuery: "a lighthearted movie",
      results: [
        {
          id: 1,
          title: "Four Rooms",
          posterPath: "/poster.jpg",
          releaseDate: "1995-12-09",
          voteAverage: 6.5,
          weightedRating: 6.2,
          popularity: 22.4,
          matchedVia: "keyword+theme",
        },
      ],
    });
  });

  it("never checks the anonymous rate limit for an authenticated request", async () => {
    vi.mocked(mockClient.auth.getClaims).mockResolvedValueOnce({
      data: { claims: { sub: "user-1" } },
    });
    vi.mocked(getGenres).mockResolvedValue(sampleGenres);
    vi.mocked(parseSearchQuery).mockResolvedValue({
      filters: { genreIds: [], decade: null, runtimeBand: null, maxAge: null },
      semanticQuery: "a lighthearted movie",
    });
    vi.mocked(searchMovies).mockResolvedValue([sampleRanked]);

    await GET(request("q=funny+movie"));

    expect(underAnonSemanticSearchCap).not.toHaveBeenCalled();
    expect(searchMovies).toHaveBeenCalledWith(
      mockClient,
      "sk-openai-test",
      expect.anything(),
      PAGE_SIZE,
      true
    );
    expect(logUsageEvent).toHaveBeenCalledWith(mockClient, "search", "user-1", {
      resultCount: 1,
    });
  });

  it("falls back to lexical-only and flags the usage event once an anonymous IP is over the cap", async () => {
    vi.mocked(getGenres).mockResolvedValue(sampleGenres);
    vi.mocked(parseSearchQuery).mockResolvedValue({
      filters: { genreIds: [], decade: null, runtimeBand: null, maxAge: null },
      semanticQuery: "a lighthearted movie",
    });
    vi.mocked(searchMovies).mockResolvedValue([sampleRanked]);
    vi.mocked(underAnonSemanticSearchCap).mockResolvedValue(false);

    await GET(request("q=funny+movie"));

    expect(searchMovies).toHaveBeenCalledWith(
      mockClient,
      "sk-openai-test",
      expect.anything(),
      PAGE_SIZE,
      false
    );
    expect(logUsageEvent).toHaveBeenCalledWith(mockClient, "search", null, {
      resultCount: 1,
      rateLimited: true,
    });
  });

  it("returns 500 with an error body on an unexpected failure", async () => {
    vi.mocked(getGenres).mockRejectedValue(new Error("db down"));

    const response = await GET(request("q=funny+movie"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: expect.any(String) });
  });
});
