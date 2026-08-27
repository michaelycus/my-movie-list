import { describe, expect, it } from "vitest";
import { blendTasteEmbedding, buildTasteParagraph, parseEmbeddingVector, type GenreName } from "./taste";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

const genres: GenreName[] = [
  { id: 18, name: "Drama" },
  { id: 9648, name: "Mystery" },
  { id: 27, name: "Horror" },
];

const fullAnswers: QuestionnaireAnswers = {
  lovedFilm: "Arrival, because I like sci-fi that's actually about grief",
  perfectNight: "Something slow, a blanket, and no phones",
  hardNo: "Torture scenes",
  hardNoIsBlocking: true,
  moods: ["fun", "mind-bending"],
  recency: "classics",
  lovedGenreIds: [18, 9648],
  avoidGenreIds: [27],
  runtimeTolerance: "under100",
  subtitlesOk: true,
  contentTolerance: "light",
};

const minimalAnswers: QuestionnaireAnswers = {
  lovedFilm: "Arrival",
  perfectNight: "Quiet night in",
  hardNo: "Jump scares",
  hardNoIsBlocking: false,
  moods: [],
  recency: "no-preference",
  lovedGenreIds: [],
  avoidGenreIds: [],
  runtimeTolerance: "around2h",
  subtitlesOk: false,
  contentTolerance: "no-preference",
};

describe("buildTasteParagraph", () => {
  it("includes every answer's content and the correct genre names", () => {
    const paragraph = buildTasteParagraph(fullAnswers, genres);

    expect(paragraph).toContain(fullAnswers.lovedFilm);
    expect(paragraph).toContain(fullAnswers.perfectNight);
    expect(paragraph).toContain(fullAnswers.hardNo);
    expect(paragraph).toContain("strict dealbreaker");
    expect(paragraph).toContain("fun, mind-bending");
    expect(paragraph).toContain("Prefers classics");
    expect(paragraph).toContain("Loves genres: Drama, Mystery.");
    expect(paragraph).toContain("Avoids genres: Horror.");
    expect(paragraph).toContain("under 100 minutes");
    expect(paragraph).toContain("Fine with subtitles.");
    expect(paragraph).toContain("light content");
  });

  it("skips empty/default-only clauses instead of leaving blank or malformed lines", () => {
    const paragraph = buildTasteParagraph(minimalAnswers, genres);

    expect(paragraph).toContain("a soft preference");
    expect(paragraph).not.toContain("Tonight's mood");
    expect(paragraph).not.toContain("Prefers recent");
    expect(paragraph).not.toContain("Prefers classics");
    expect(paragraph).not.toContain("Loves genres");
    expect(paragraph).not.toContain("Avoids genres");
    expect(paragraph).toContain("Prefers no subtitles.");
    expect(paragraph).not.toContain("light content");
    expect(paragraph).not.toContain("heavy or intense");
    expect(paragraph.split("\n").every((line) => line.trim().length > 0)).toBe(true);
  });
});

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
  return dot / (magA * magB);
}

describe("blendTasteEmbedding", () => {
  const base = normalize([1, 0, 0]);
  const likedPick = normalize([0, 1, 0]);

  function normalize(v: number[]): number[] {
    const mag = Math.sqrt(v.reduce((sum, value) => sum + value * value, 0));
    return v.map((value) => value / mag);
  }

  it("returns base unchanged when there are no picks", () => {
    expect(blendTasteEmbedding(base, [])).toEqual(base);
  });

  it("shifts toward an all-liked pick set", () => {
    const blended = blendTasteEmbedding(base, [{ embedding: likedPick, liked: true }]);
    expect(cosineSimilarity(blended, likedPick)).toBeGreaterThan(cosineSimilarity(base, likedPick));
  });

  it("shifts away from an all-disliked pick set", () => {
    const dislikedPick = likedPick;
    const blended = blendTasteEmbedding(base, [{ embedding: dislikedPick, liked: false }]);
    expect(cosineSimilarity(blended, dislikedPick)).toBeLessThan(cosineSimilarity(base, dislikedPick));
  });

  it("nets out mixed picks toward the liked one", () => {
    const other = normalize([0, 0, 1]);
    const blended = blendTasteEmbedding(base, [
      { embedding: likedPick, liked: true },
      { embedding: other, liked: false },
    ]);
    expect(cosineSimilarity(blended, likedPick)).toBeGreaterThan(cosineSimilarity(blended, other));
  });

  it("returns a unit-length vector whenever picks are applied", () => {
    const blended = blendTasteEmbedding(base, [{ embedding: likedPick, liked: true }]);
    const mag = Math.sqrt(blended.reduce((sum, value) => sum + value * value, 0));
    expect(mag).toBeCloseTo(1, 10);
  });
});

describe("parseEmbeddingVector", () => {
  it("parses PostgREST's pgvector text form into a number array", () => {
    expect(parseEmbeddingVector("[-0.07,0.04,1]")).toEqual([-0.07, 0.04, 1]);
  });

  it("passes through an already-parsed array unchanged", () => {
    expect(parseEmbeddingVector([0.1, 0.2])).toEqual([0.1, 0.2]);
  });

  it("throws on an unexpected shape", () => {
    expect(() => parseEmbeddingVector(null)).toThrow();
    expect(() => parseEmbeddingVector(42)).toThrow();
  });
});
