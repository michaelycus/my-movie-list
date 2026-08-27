import { describe, expect, it } from "vitest";
import { deriveHardFilters, parseQuestionnaireInput } from "./questionnaire";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

const validRaw = {
  lovedFilm: "Arrival, because I like sci-fi that's actually about grief",
  perfectNight: "Something slow, a blanket, and no phones",
  hardNo: "Torture scenes",
  hardNoIsBlocking: "on",
  moods: ["fun", "mind-bending", "not-a-real-mood"],
  recency: "classics",
  lovedGenreIds: ["18", "9648"],
  avoidGenreIds: ["27"],
  runtimeTolerance: "under100",
  subtitlesOk: "true",
  contentTolerance: "light",
};

const baseAnswers: QuestionnaireAnswers = {
  lovedFilm: "Arrival",
  perfectNight: "Quiet night in",
  hardNo: "Jump scares",
  hardNoIsBlocking: false,
  moods: [],
  recency: "no-preference",
  lovedGenreIds: [],
  avoidGenreIds: [],
  runtimeTolerance: "around2h",
  subtitlesOk: true,
  contentTolerance: "no-preference",
};

describe("parseQuestionnaireInput", () => {
  it("accepts a full valid submission", () => {
    const result = parseQuestionnaireInput(validRaw);
    expect(result).toEqual({
      success: true,
      data: {
        lovedFilm: validRaw.lovedFilm,
        perfectNight: validRaw.perfectNight,
        hardNo: validRaw.hardNo,
        hardNoIsBlocking: true,
        moods: ["fun", "mind-bending"],
        recency: "classics",
        lovedGenreIds: [18, 9648],
        avoidGenreIds: [27],
        runtimeTolerance: "under100",
        subtitlesOk: true,
        contentTolerance: "light",
      },
    });
  });

  it("rejects a blank required field", () => {
    const result = parseQuestionnaireInput({ ...validRaw, lovedFilm: "   " });
    expect(result).toEqual({ success: false, error: "This answer is required" });
  });

  it("rejects a missing required field", () => {
    const result = parseQuestionnaireInput({ ...validRaw, perfectNight: null });
    expect(result).toEqual({ success: false, error: "This answer is required" });
  });

  it("accepts optional fields omitted, applying defaults", () => {
    const result = parseQuestionnaireInput({
      lovedFilm: validRaw.lovedFilm,
      perfectNight: validRaw.perfectNight,
      hardNo: validRaw.hardNo,
      hardNoIsBlocking: null,
      moods: [],
      recency: null,
      lovedGenreIds: [],
      avoidGenreIds: [],
      runtimeTolerance: null,
      subtitlesOk: null,
      contentTolerance: null,
    });
    expect(result).toEqual({
      success: true,
      data: {
        lovedFilm: validRaw.lovedFilm,
        perfectNight: validRaw.perfectNight,
        hardNo: validRaw.hardNo,
        hardNoIsBlocking: false,
        moods: [],
        recency: "no-preference",
        lovedGenreIds: [],
        avoidGenreIds: [],
        runtimeTolerance: "around2h",
        subtitlesOk: true,
        contentTolerance: "no-preference",
      },
    });
  });
});

describe("deriveHardFilters", () => {
  it("caps runtime at 100 for under100", () => {
    expect(deriveHardFilters({ ...baseAnswers, runtimeTolerance: "under100" }).maxRuntime).toBe(
      100
    );
  });

  it("caps runtime at 150 for around2h", () => {
    expect(deriveHardFilters({ ...baseAnswers, runtimeTolerance: "around2h" }).maxRuntime).toBe(
      150
    );
  });

  it("applies no runtime cap for longOk", () => {
    expect(deriveHardFilters({ ...baseAnswers, runtimeTolerance: "longOk" }).maxRuntime).toBeNull();
  });

  it("sets a 12 age ceiling for light content tolerance", () => {
    expect(deriveHardFilters({ ...baseAnswers, contentTolerance: "light" }).minAgeCeiling).toBe(12);
  });

  it("applies no age ceiling for no-preference or heavy", () => {
    expect(
      deriveHardFilters({ ...baseAnswers, contentTolerance: "no-preference" }).minAgeCeiling
    ).toBeNull();
    expect(deriveHardFilters({ ...baseAnswers, contentTolerance: "heavy" }).minAgeCeiling).toBeNull();
  });

  it("passes the avoid-genre list through as blocked genres", () => {
    expect(deriveHardFilters({ ...baseAnswers, avoidGenreIds: [27, 53] }).blockedGenres).toEqual([
      27, 53,
    ]);
  });

  it("passes subtitlesOk through both ways", () => {
    expect(deriveHardFilters({ ...baseAnswers, subtitlesOk: true }).subtitlesOk).toBe(true);
    expect(deriveHardFilters({ ...baseAnswers, subtitlesOk: false }).subtitlesOk).toBe(false);
  });
});
