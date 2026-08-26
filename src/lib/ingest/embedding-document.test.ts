import { describe, expect, it } from "vitest";
import { buildEmbeddingDocument, groupCreditsByMovie } from "./embedding-document";
import type { MovieForEmbedding } from "./embedding-document";

const avatar: MovieForEmbedding = {
  id: 19995,
  title: "Avatar",
  tagline: "Enter the World",
  overview: "A marine on an alien planet.",
  keywords: ["culture clash", "future"],
};

describe("buildEmbeddingDocument", () => {
  it("includes every line for a film with full data", () => {
    const doc = buildEmbeddingDocument(avatar, {
      cast: ["Sam Worthington", "Zoe Saldana"],
      directors: ["James Cameron"],
    });

    expect(doc).toBe(
      [
        "Title: Avatar",
        "Tagline: Enter the World",
        "Overview: A marine on an alien planet.",
        "Keywords: culture clash, future",
        "Cast: Sam Worthington, Zoe Saldana",
        "Director: James Cameron",
      ].join("\n")
    );
  });

  it("omits tagline, overview, and keywords lines when those fields are empty", () => {
    const sparse: MovieForEmbedding = {
      id: 1,
      title: "Untitled",
      tagline: null,
      overview: null,
      keywords: [],
    };

    const doc = buildEmbeddingDocument(sparse, { cast: [], directors: [] });

    expect(doc).toBe("Title: Untitled");
  });

  it("omits the Director line when there is no director credit", () => {
    const doc = buildEmbeddingDocument(avatar, { cast: ["Sam Worthington"], directors: [] });
    expect(doc).not.toContain("Director:");
  });

  it("omits the Cast line when there is no cast credit", () => {
    const doc = buildEmbeddingDocument(avatar, { cast: [], directors: ["James Cameron"] });
    expect(doc).not.toContain("Cast:");
  });
});

describe("groupCreditsByMovie", () => {
  it("groups cast and crew rows by movie id, preserving row order", () => {
    const result = groupCreditsByMovie(
      [
        { movieId: 1, personName: "Sam Worthington" },
        { movieId: 1, personName: "Zoe Saldana" },
        { movieId: 2, personName: "Tom Hanks" },
      ],
      [{ movieId: 1, personName: "James Cameron" }]
    );

    expect(result.get(1)).toEqual({
      cast: ["Sam Worthington", "Zoe Saldana"],
      directors: ["James Cameron"],
    });
    expect(result.get(2)).toEqual({ cast: ["Tom Hanks"], directors: [] });
  });

  it("returns an empty map for no rows", () => {
    expect(groupCreditsByMovie([], [])).toEqual(new Map());
  });
});
