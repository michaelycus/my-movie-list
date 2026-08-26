import { describe, expect, it } from "vitest";
import { parseCast, parseCrew, parseGenres, parseKeywords } from "./normalize";

describe("parseGenres", () => {
  it("maps id/name pairs", () => {
    expect(parseGenres('[{"id": 28, "name": "Action"}, {"id": 12, "name": "Adventure"}]')).toEqual([
      { id: 28, name: "Action" },
      { id: 12, name: "Adventure" },
    ]);
  });

  it("returns [] for an empty array", () => {
    expect(parseGenres("[]")).toEqual([]);
  });
});

describe("parseKeywords", () => {
  it("extracts names, capped at the limit", () => {
    const raw = JSON.stringify(
      Array.from({ length: 15 }, (_, i) => ({ id: i, name: `kw${i}` }))
    );
    const result = parseKeywords(raw);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("kw0");
  });

  it("returns [] for an empty array", () => {
    expect(parseKeywords("[]")).toEqual([]);
  });
});

describe("parseCast", () => {
  it("keeps only billing order < maxBilling, sorted by order", () => {
    const raw = JSON.stringify([
      { name: "Third", character: "C", order: 2 },
      { name: "First", character: "A", order: 0 },
      { name: "Ninth", character: "I", order: 8 },
      { name: "Second", character: "B", order: 1 },
    ]);
    expect(parseCast(raw)).toEqual([
      { personName: "First", characterName: "A", billingOrder: 0 },
      { personName: "Second", characterName: "B", billingOrder: 1 },
      { personName: "Third", characterName: "C", billingOrder: 2 },
    ]);
  });

  it("returns [] for an empty cast", () => {
    expect(parseCast("[]")).toEqual([]);
  });

  it("falls back to null for a missing character name", () => {
    const raw = JSON.stringify([{ name: "Extra", character: "", order: 0 }]);
    expect(parseCast(raw)).toEqual([
      { personName: "Extra", characterName: null, billingOrder: 0 },
    ]);
  });
});

describe("parseCrew", () => {
  it("keeps only Director credits", () => {
    const raw = JSON.stringify([
      { name: "Editor Person", job: "Editor" },
      { name: "Director Person", job: "Director" },
    ]);
    expect(parseCrew(raw)).toEqual([{ personName: "Director Person", job: "Director" }]);
  });

  it("returns [] when there is no Director credit", () => {
    const raw = JSON.stringify([{ name: "Writer Person", job: "Writer" }]);
    expect(parseCrew(raw)).toEqual([]);
  });

  it("returns [] for an empty crew", () => {
    expect(parseCrew("[]")).toEqual([]);
  });
});
