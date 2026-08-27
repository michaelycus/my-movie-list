import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/sessions/recommendations", () => ({
  getGroupRecommendations: vi.fn(),
}));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getGroupRecommendations } from "@/lib/sessions/recommendations";
import type { GroupRecommendations } from "@/lib/sessions/recommendations";

const VALID_ID = "62daf199-1cff-4d45-b88c-2e3d2c1557b4";
const OWNER_ID = "4899778f-5bb8-4d14-9c82-351788ebdee2";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function clientWithClaims(sub: string | undefined) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(sub ? { data: { claims: { sub } } } : { data: null }),
    },
  };
}

const sampleResult: GroupRecommendations = {
  scoredParticipantIds: ["p1"],
  movies: [
    {
      id: 1,
      title: "Forrest Gump",
      posterPath: "/poster.jpg",
      releaseDate: "1994-07-06",
      voteAverage: 8.2,
      weightedRating: 8.0,
      popularity: 48.3,
      runtime: 142,
      minAge: 12,
      groupScore: 0.56,
      participantScores: [0.56],
    },
  ],
};

describe("GET /api/sessions/[id]/recommendations", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("400s on an invalid session id", async () => {
    const response = await GET(new Request("http://localhost"), ctx("not-a-uuid"));
    expect(response.status).toBe(400);
    expect(getGroupRecommendations).not.toHaveBeenCalled();
  });

  it("401s with no session", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(undefined) as never);

    const response = await GET(new Request("http://localhost"), ctx(VALID_ID));

    expect(response.status).toBe(401);
    expect(getGroupRecommendations).not.toHaveBeenCalled();
  });

  it("404s when the session isn't found for this owner", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getGroupRecommendations).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), ctx(VALID_ID));

    expect(response.status).toBe(404);
  });

  it("returns the recommendations on success", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getGroupRecommendations).mockResolvedValue(sampleResult);

    const response = await GET(new Request("http://localhost"), ctx(VALID_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(sampleResult);
    expect(getGroupRecommendations).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      VALID_ID,
      OWNER_ID
    );
  });

  it("500s when the query throws", async () => {
    vi.mocked(createClient).mockResolvedValue(clientWithClaims(OWNER_ID) as never);
    vi.mocked(getGroupRecommendations).mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), ctx(VALID_ID));

    expect(response.status).toBe(500);
  });
});
