import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRationalePrompt, writeGroupRationale, type RationaleMovie, type RationaleParticipant } from "./rationale";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

function chatResponse(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] });
}

const movie: RationaleMovie = {
  title: "Forrest Gump",
  overview: "A slow-witted but kind-hearted Alabama man witnesses history unfold.",
  genres: [{ id: 18, name: "Drama" }],
  cast: [{ name: "Tom Hanks", character: "Forrest Gump" }],
  director: "Robert Zemeckis",
};

const participants: RationaleParticipant[] = [
  { displayName: "You", moodTags: ["cozy"], moodNote: null },
  { displayName: "Ana", moodTags: [], moodNote: "nothing too sad" },
];

describe("buildRationalePrompt", () => {
  it("names every participant and includes their mood or note", () => {
    const messages = buildRationalePrompt(movie, participants);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("You");
    expect(messages[1].content).toContain("cozy");
    expect(messages[1].content).toContain("Ana");
    expect(messages[1].content).toContain("nothing too sad");
    expect(messages[1].content).toContain("Forrest Gump");
  });
});

describe("writeGroupRationale", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without calling fetch when there are no participants", async () => {
    const result = await writeGroupRationale(movie, [], "key");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the trimmed paragraph on a successful completion", async () => {
    vi.mocked(fetch).mockResolvedValue(chatResponse("  A great pick for everyone.  "));

    const result = await writeGroupRationale(movie, participants, "key");

    expect(result).toBe("A great pick for everyone.");
  });

  it("degrades to null on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const result = await writeGroupRationale(movie, participants, "key");

    expect(result).toBeNull();
  });

  it("degrades to null on an empty completion", async () => {
    vi.mocked(fetch).mockResolvedValue(chatResponse(""));

    const result = await writeGroupRationale(movie, participants, "key");

    expect(result).toBeNull();
  });

  it("degrades to null on a non-ok, non-retryable response", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "bad request" }, 400));

    const result = await writeGroupRationale(movie, participants, "key");

    expect(result).toBeNull();
  });
});
