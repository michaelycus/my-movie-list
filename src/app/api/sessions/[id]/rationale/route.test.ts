import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/sessions/detail", () => ({
  getSessionDetail: vi.fn(),
}));

vi.mock("@/lib/movies/detail", () => ({
  getMovieDetail: vi.fn(),
}));

vi.mock("@/lib/sessions/rationale", () => ({
  writeGroupRationale: vi.fn(),
}));

import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getSessionDetail } from "@/lib/sessions/detail";
import { getMovieDetail } from "@/lib/movies/detail";
import { writeGroupRationale } from "@/lib/sessions/rationale";
import type { SessionDetail } from "@/types/session";
import type { MovieDetail } from "@/types/movie";

const VALID_ID = "62daf199-1cff-4d45-b88c-2e3d2c1557b4";
const OWNER_ID = "4899778f-5bb8-4d14-9c82-351788ebdee2";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

function clientWithClaims(sub: string | undefined) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(sub ? { data: { claims: { sub } } } : { data: null }),
    },
  };
}

const sampleSession: SessionDetail = {
  id: VALID_ID,
  title: "Movie night",
  watchedOn: "2026-08-27",
  chosenMovieId: null,
  rationale: null,
  youngestViewerAge: null,
  participants: [
    {
      id: "p1",
      displayName: "You",
      avatarEmoji: null,
      isHost: true,
      moodTags: ["cozy"],
      moodNote: null,
      constraints: { maxRuntime: null },
    },
  ],
};

const sampleMovie: MovieDetail = {
  id: 13,
  title: "Forrest Gump",
  tagline: null,
  overview: "A slow-witted but kind-hearted Alabama man witnesses history unfold.",
  releaseDate: "1994-07-06",
  runtime: 142,
  posterPath: "/poster.jpg",
  backdropPath: null,
  voteAverage: 8.2,
  weightedRating: 8.0,
  minAge: 12,
  genres: [{ id: 18, name: "Drama" }],
  cast: [{ name: "Tom Hanks", character: "Forrest Gump" }],
  director: "Robert Zemeckis",
};

describe("POST /api/sessions/[id]/rationale", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("400s on an invalid session id", async () => {
    const response = await POST(req({ movieId: 13 }), ctx("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(getSessionDetail).not.toHaveBeenCalled();
  });

  it("400s on a missing movieId", async () => {
    const response = await POST(req({}), ctx(VALID_ID));
    expect(response.status).toBe(400);
    expect(getSessionDetail).not.toHaveBeenCalled();
  });

  it("401s with no session", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(undefined) as never);

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(401);
    expect(getSessionDetail).not.toHaveBeenCalled();
  });

  it("404s when the session isn't found for this owner", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getSessionDetail).mockResolvedValue(null);
    vi.mocked(getMovieDetail).mockResolvedValue(sampleMovie);

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(404);
    expect(writeGroupRationale).not.toHaveBeenCalled();
  });

  it("404s when the movie isn't found", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getSessionDetail).mockResolvedValue(sampleSession);
    vi.mocked(getMovieDetail).mockResolvedValue(null);

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(404);
    expect(writeGroupRationale).not.toHaveBeenCalled();
  });

  it("returns the rationale on success", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getSessionDetail).mockResolvedValue(sampleSession);
    vi.mocked(getMovieDetail).mockResolvedValue(sampleMovie);
    vi.mocked(writeGroupRationale).mockResolvedValue("A great pick for everyone.");

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rationale: "A great pick for everyone." });
    expect(writeGroupRationale).toHaveBeenCalledWith(sampleMovie, sampleSession.participants, expect.any(String));
  });

  it("returns a null rationale rather than failing when the model degrades", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getSessionDetail).mockResolvedValue(sampleSession);
    vi.mocked(getMovieDetail).mockResolvedValue(sampleMovie);
    vi.mocked(writeGroupRationale).mockResolvedValue(null);

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rationale: null });
  });

  it("500s when a lookup throws", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getSessionDetail).mockRejectedValue(new Error("boom"));

    const response = await POST(req({ movieId: 13 }), ctx(VALID_ID));

    expect(response.status).toBe(500);
  });
});
