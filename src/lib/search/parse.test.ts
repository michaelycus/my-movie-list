import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildParsePrompt,
  mapGenreNamesToIds,
  parseModelJson,
  parseSearchQuery,
  type GenreOption,
} from "./parse";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

function chatResponse(content: unknown): Response {
  return jsonResponse({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

const genres: GenreOption[] = [
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
  { id: 16, name: "Animation" },
];

describe("buildParsePrompt", () => {
  it("includes the genre catalog and the user's text", () => {
    const messages = buildParsePrompt("something funny", genres);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Comedy, Drama, Animation");
    expect(messages[1]).toEqual({ role: "user", content: "something funny" });
  });
});

describe("mapGenreNamesToIds", () => {
  it("matches names exactly", () => {
    expect(mapGenreNamesToIds(["Comedy"], genres)).toEqual([35]);
  });

  it("matches case-insensitively", () => {
    expect(mapGenreNamesToIds(["comedy", "DRAMA"], genres)).toEqual([35, 18]);
  });

  it("drops names with no match instead of erroring", () => {
    expect(mapGenreNamesToIds(["Comedy", "Noir"], genres)).toEqual([35]);
  });

  it("returns an empty array for an empty list", () => {
    expect(mapGenreNamesToIds([], genres)).toEqual([]);
  });
});

describe("parseModelJson", () => {
  it("maps a valid response into filters + semanticQuery", () => {
    const result = parseModelJson(
      {
        genres: ["Comedy"],
        decade: 1990,
        runtimeBand: "standard",
        maxAge: 12,
        semanticQuery: "a lighthearted coming-of-age story",
      },
      genres,
      "funny 90s movie"
    );

    expect(result).toEqual({
      filters: { genreIds: [35], decade: 1990, runtimeBand: "standard", maxAge: 12 },
      semanticQuery: "a lighthearted coming-of-age story",
    });
  });

  it("falls back to the original text when semanticQuery is blank", () => {
    const result = parseModelJson(
      { genres: [], decade: null, runtimeBand: null, maxAge: null, semanticQuery: "" },
      genres,
      "something funny"
    );

    expect(result?.semanticQuery).toBe("something funny");
  });

  it("returns null for a malformed shape", () => {
    expect(parseModelJson({ not: "the right shape" }, genres, "x")).toBeNull();
    expect(parseModelJson("just a string", genres, "x")).toBeNull();
    expect(parseModelJson(null, genres, "x")).toBeNull();
  });

  it("returns null when decade isn't a multiple of 10", () => {
    const result = parseModelJson(
      { genres: [], decade: 1995, runtimeBand: null, maxAge: null, semanticQuery: "x" },
      genres,
      "x"
    );
    expect(result).toBeNull();
  });

  it("returns null when decade is out of range", () => {
    const result = parseModelJson(
      { genres: [], decade: 1900, runtimeBand: null, maxAge: null, semanticQuery: "x" },
      genres,
      "x"
    );
    expect(result).toBeNull();
  });

  it("returns null when maxAge isn't a known ceiling", () => {
    const result = parseModelJson(
      { genres: [], decade: null, runtimeBand: null, maxAge: 21, semanticQuery: "x" },
      genres,
      "x"
    );
    expect(result).toBeNull();
  });
});

describe("parseSearchQuery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses a successful response into filters + semanticQuery", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      chatResponse({
        genres: ["Comedy"],
        decade: 1990,
        runtimeBand: null,
        maxAge: null,
        semanticQuery: "a lighthearted movie",
      })
    );

    const result = await parseSearchQuery("funny 90s movie", genres, "sk-test");

    expect(result).toEqual({
      filters: { genreIds: [35], decade: 1990, runtimeBand: null, maxAge: null },
      semanticQuery: "a lighthearted movie",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
      })
    );
  });

  it("falls back to raw text when the model's JSON doesn't match the schema", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(chatResponse({ not: "the right shape" }));

    const result = await parseSearchQuery("something funny", genres, "sk-test");

    expect(result).toEqual({
      filters: { genreIds: [], decade: null, runtimeBand: null, maxAge: null },
      semanticQuery: "something funny",
    });
  });

  it("falls back to raw text when the response body isn't valid JSON", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "not json" } }] })
    );

    const result = await parseSearchQuery("something funny", genres, "sk-test");

    expect(result.semanticQuery).toBe("something funny");
  });

  it("falls back to raw text after the request fails past retries", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const promise = parseSearchQuery("something funny", genres, "sk-test");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      filters: { genreIds: [], decade: null, runtimeBand: null, maxAge: null },
      semanticQuery: "something funny",
    });
  });

  it("falls back to raw text when fetch itself rejects", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await parseSearchQuery("something funny", genres, "sk-test");

    expect(result.semanticQuery).toBe("something funny");
  });
});
