import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ mockClient: true }),
}));

vi.mock("@/lib/movies/browse", () => ({
  getGenres: vi.fn(),
}));

vi.mock("@/lib/search/parse", () => ({
  parseSearchQuery: vi.fn(),
}));

vi.mock("@/lib/search/retrieve", () => ({
  searchMovies: vi.fn(),
}));

import { GET } from "./route";
import { getGenres } from "@/lib/movies/browse";
import { parseSearchQuery } from "@/lib/search/parse";
import { searchMovies } from "@/lib/search/retrieve";
import type { RankedMovie } from "@/lib/search/retrieve";

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

    const response = await GET(request("q=funny+movie"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(parseSearchQuery).toHaveBeenCalledWith(
      "funny movie",
      sampleGenres,
      "sk-or-test"
    );
    expect(searchMovies).toHaveBeenCalledWith(
      { mockClient: true },
      "sk-openai-test",
      {
        filters: { genreIds: [35], decade: null, runtimeBand: null, maxAge: null },
        semanticQuery: "a lighthearted movie",
      }
    );
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

  it("returns 500 with an error body on an unexpected failure", async () => {
    vi.mocked(getGenres).mockRejectedValue(new Error("db down"));

    const response = await GET(request("q=funny+movie"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: expect.any(String) });
  });
});
