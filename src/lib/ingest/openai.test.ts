import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEmbeddings } from "./openai";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

describe("fetchEmbeddings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns an empty array without calling the API for no texts", async () => {
    const fetchMock = vi.mocked(fetch);
    const result = await fetchEmbeddings([], "key");
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the batch and returns embeddings re-sorted to match input order", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { embedding: [0.2], index: 1 },
          { embedding: [0.1], index: 0 },
        ],
      })
    );

    const result = await fetchEmbeddings(["a", "b"], "sk-test");

    expect(result).toEqual([[0.1], [0.2]]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test" }),
        body: JSON.stringify({ model: "text-embedding-3-small", input: ["a", "b"] }),
      })
    );
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchMock = vi.mocked(fetch);
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      calls++;
      if (calls === 1) return jsonResponse({}, 429);
      return jsonResponse({ data: [{ embedding: [0.5], index: 0 }] });
    });

    const promise = fetchEmbeddings(["a"], "key");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([[0.5]]);
    expect(calls).toBe(2);
  });

  it("throws after exhausting retries on persistent failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const promise = fetchEmbeddings(["a"], "key");
    const expectation = expect(promise).rejects.toThrow("OpenAI request failed");
    await vi.runAllTimersAsync();
    await expectation;
  });
});
