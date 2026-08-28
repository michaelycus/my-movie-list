import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HardFilters } from "@/types/questionnaire";

vi.mock("@/lib/search/retrieve", () => ({
  getOrEmbedQuery: vi.fn(),
}));

import {
  buildMoodQueryText,
  collectSeenMovieIds,
  combineHardFilters,
  parseHardFilters,
  resolveParticipantEmbeddings,
  type ParticipantScoringInput,
} from "./recommendations";
import { getOrEmbedQuery } from "@/lib/search/retrieve";

const permissiveFilters: HardFilters = {
  maxRuntime: null,
  minAgeCeiling: null,
  blockedGenres: [],
  subtitlesOk: true,
};

describe("buildMoodQueryText", () => {
  it("combines tags and a note", () => {
    expect(buildMoodQueryText(["fun", "feel-good"], "it's raining out")).toBe(
      "Tonight's mood tends toward: fun, feel-good. it's raining out"
    );
  });

  it("uses just the tags when there's no note", () => {
    expect(buildMoodQueryText(["scary"], null)).toBe("Tonight's mood tends toward: scary.");
  });

  it("uses just the note when there are no tags", () => {
    expect(buildMoodQueryText([], "exhausted, need something light")).toBe(
      "exhausted, need something light"
    );
  });

  it("returns null when there's neither", () => {
    expect(buildMoodQueryText([], null)).toBeNull();
  });
});

describe("collectSeenMovieIds", () => {
  it("dedupes movie ids across rows", () => {
    expect(collectSeenMovieIds([{ movie_id: 13 }, { movie_id: 27 }, { movie_id: 13 }])).toEqual([13, 27]);
  });

  it("returns an empty array for no rows", () => {
    expect(collectSeenMovieIds([])).toEqual([]);
  });
});

describe("parseHardFilters", () => {
  it("returns the permissive default for an empty object", () => {
    expect(parseHardFilters({})).toEqual(permissiveFilters);
  });

  it("returns the permissive default for null", () => {
    expect(parseHardFilters(null)).toEqual(permissiveFilters);
  });

  it("passes through a fully populated value", () => {
    const filters: HardFilters = {
      maxRuntime: 120,
      minAgeCeiling: 12,
      blockedGenres: [27, 53],
      subtitlesOk: false,
    };
    expect(parseHardFilters(filters)).toEqual(filters);
  });
});

describe("combineHardFilters", () => {
  it("takes the strictest non-null maxRuntime", () => {
    const result = combineHardFilters(
      [
        { maxRuntimeOverride: null, hardFilters: { ...permissiveFilters, maxRuntime: 150 } },
        { maxRuntimeOverride: null, hardFilters: { ...permissiveFilters, maxRuntime: 90 } },
      ],
      null
    );
    expect(result.maxRuntime).toBe(90);
  });

  it("prefers a participant's tonight override over their stored maxRuntime", () => {
    const result = combineHardFilters(
      [{ maxRuntimeOverride: 100, hardFilters: { ...permissiveFilters, maxRuntime: 150 } }],
      null
    );
    expect(result.maxRuntime).toBe(100);
  });

  it("takes the strictest minAgeCeiling across friends and the youngest viewer", () => {
    const result = combineHardFilters(
      [
        { maxRuntimeOverride: null, hardFilters: { ...permissiveFilters, minAgeCeiling: 16 } },
        { maxRuntimeOverride: null, hardFilters: permissiveFilters },
      ],
      8
    );
    expect(result.minAgeCeiling).toBe(8);
  });

  it("unions and dedupes blocked genres", () => {
    const result = combineHardFilters(
      [
        { maxRuntimeOverride: null, hardFilters: { ...permissiveFilters, blockedGenres: [27, 53] } },
        { maxRuntimeOverride: null, hardFilters: { ...permissiveFilters, blockedGenres: [53, 99] } },
      ],
      null
    );
    expect(result.blockedGenres.sort()).toEqual([27, 53, 99]);
  });

  it("returns all-null/empty for no restrictions anywhere", () => {
    expect(combineHardFilters([{ maxRuntimeOverride: null, hardFilters: permissiveFilters }], null)).toEqual({
      maxRuntime: null,
      minAgeCeiling: null,
      blockedGenres: [],
    });
  });
});

type ScoringInput = Pick<
  ParticipantScoringInput,
  "participantId" | "moodTags" | "moodNote" | "tasteEmbedding"
>;

describe("resolveParticipantEmbeddings", () => {
  const client = {} as SupabaseClient;
  afterEach(() => vi.clearAllMocks());

  it("blends taste and mood when a participant has both", async () => {
    vi.mocked(getOrEmbedQuery).mockResolvedValue([1, 0, 0]);
    const input: ScoringInput = {
      participantId: "p1",
      moodTags: ["fun"],
      moodNote: null,
      tasteEmbedding: [0, 1, 0],
    };

    const result = await resolveParticipantEmbeddings(client, "sk-test", [input]);

    expect(result.scoredParticipantIds).toEqual(["p1"]);
    expect(result.embeddings).toHaveLength(1);
    // Blended and normalized - neither the raw taste nor the raw mood vector.
    expect(result.embeddings[0]).not.toEqual([0, 1, 0]);
    expect(result.embeddings[0]).not.toEqual([1, 0, 0]);
  });

  it("uses the taste embedding unchanged when there's no mood", async () => {
    const input: ScoringInput = {
      participantId: "p1",
      moodTags: [],
      moodNote: null,
      tasteEmbedding: [0.2, 0.4],
    };

    const result = await resolveParticipantEmbeddings(client, "sk-test", [input]);

    expect(result).toEqual({ scoredParticipantIds: ["p1"], embeddings: [[0.2, 0.4]] });
    expect(getOrEmbedQuery).not.toHaveBeenCalled();
  });

  it("embeds the mood alone when there's no taste embedding", async () => {
    vi.mocked(getOrEmbedQuery).mockResolvedValue([0.5, 0.5]);
    const input: ScoringInput = {
      participantId: "host",
      moodTags: ["fun"],
      moodNote: "it's raining",
      tasteEmbedding: null,
    };

    const result = await resolveParticipantEmbeddings(client, "sk-test", [input]);

    expect(getOrEmbedQuery).toHaveBeenCalledWith(
      client,
      "sk-test",
      "Tonight's mood tends toward: fun. it's raining"
    );
    expect(result).toEqual({ scoredParticipantIds: ["host"], embeddings: [[0.5, 0.5]] });
  });

  it("excludes a participant with neither a taste embedding nor a mood", async () => {
    const input: ScoringInput = {
      participantId: "host",
      moodTags: [],
      moodNote: null,
      tasteEmbedding: null,
    };

    const result = await resolveParticipantEmbeddings(client, "sk-test", [input]);

    expect(result).toEqual({ scoredParticipantIds: [], embeddings: [] });
    expect(getOrEmbedQuery).not.toHaveBeenCalled();
  });

  it("keeps ids and embeddings aligned when a middle participant is excluded", async () => {
    vi.mocked(getOrEmbedQuery).mockResolvedValue([9, 9]);
    const inputs: ScoringInput[] = [
      { participantId: "a", moodTags: [], moodNote: null, tasteEmbedding: [1, 1] },
      { participantId: "b", moodTags: [], moodNote: null, tasteEmbedding: null },
      { participantId: "c", moodTags: [], moodNote: null, tasteEmbedding: [2, 2] },
    ];

    const result = await resolveParticipantEmbeddings(client, "sk-test", inputs);

    expect(result.scoredParticipantIds).toEqual(["a", "c"]);
    expect(result.embeddings).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});
