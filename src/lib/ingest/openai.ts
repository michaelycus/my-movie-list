const EMBEDDING_MODEL = "text-embedding-3-small";

interface OpenAiEmbeddingsResponse {
  data: { embedding: number[]; index: number }[];
}

/** Mirrors tmdb.ts's fetchWithRetry - kept separate rather than shared so this
 * step doesn't touch feature 1c's already-tested code for an unrelated
 * feature. */
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`OpenAI request failed: ${response.status} ${url}`);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const delayMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/** Embeds one batch of texts. Output order always matches input order,
 * regardless of what order the API returns entries in. */
export async function fetchEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetchWithRetry("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  const body: OpenAiEmbeddingsResponse = await response.json();
  return body.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.embedding);
}
