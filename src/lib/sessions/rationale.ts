import type { MovieDetail } from "@/types/movie";
import type { SessionParticipant } from "@/types/session";

export type RationaleParticipant = Pick<SessionParticipant, "displayName" | "moodTags" | "moodNote">;

/** Narrows MovieDetail down to what the rationale prompt actually needs -
 * runtime, rating, etc. would only dilute the prompt. */
export type RationaleMovie = Pick<MovieDetail, "title" | "overview" | "genres" | "cast" | "director">;

function describeParticipant(participant: RationaleParticipant): string {
  const lines = [`- ${participant.displayName}`];
  if (participant.moodTags.length > 0) lines.push(`mood: ${participant.moodTags.join(", ")}`);
  if (participant.moodNote) lines.push(`note: "${participant.moodNote}"`);
  return lines.join(" | ");
}

function describeMovie(movie: RationaleMovie): string {
  const lines = [`Title: ${movie.title}`];
  if (movie.overview) lines.push(`Overview: ${movie.overview}`);
  if (movie.genres.length > 0) lines.push(`Genres: ${movie.genres.map((g) => g.name).join(", ")}`);
  if (movie.cast.length > 0) lines.push(`Cast: ${movie.cast.slice(0, 5).map((c) => c.name).join(", ")}`);
  if (movie.director) lines.push(`Director: ${movie.director}`);
  return lines.join("\n");
}

/** System + user messages instructing the model to write one short
 * paragraph naming every participant. Mirrors search/parse.ts's
 * buildParsePrompt shape - exact-format system instruction, payload in the
 * user message. */
export function buildRationalePrompt(movie: RationaleMovie, participants: RationaleParticipant[]) {
  const system = `You write a short paragraph explaining why a film is a good pick for a group watching it together tonight.

Write ONE paragraph, 3-5 sentences, plain prose with no markdown and no preamble.
Name every participant listed below at least once, and tie the film to their mood or note when one is given.
Respond with ONLY the paragraph, no other text.`;

  const user = `${describeMovie(movie)}

Participants:
${participants.map(describeParticipant).join("\n")}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Same small, fast model as search/parse.ts's parseSearchQuery - writing a
// blurb isn't latency- or quality-critical either.
const MODEL = "meta-llama/llama-3.1-8b-instruct";

interface OpenRouterChatResponse {
  choices: { message: { content: string } }[];
}

/** Mirrors search/parse.ts's fetchWithRetry, which itself mirrors
 * ingest/openai.ts's - kept separate rather than shared, per that file's
 * own precedent, so this feature doesn't touch already-tested code for an
 * unrelated call. */
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`OpenRouter request failed: ${response.status} ${url}`);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const delayMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/** Writes the group pick rationale via one OpenRouter chat completion.
 * Never throws: no participants to write about, a network failure, or an
 * empty completion all degrade to `null` - a model outage means "no
 * blurb," not "no recommendations" (project-overview.md §5.2). */
export async function writeGroupRationale(
  movie: RationaleMovie,
  participants: RationaleParticipant[],
  apiKey: string
): Promise<string | null> {
  if (participants.length === 0) return null;

  try {
    const response = await fetchWithRetry(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildRationalePrompt(movie, participants),
      }),
    });

    const body: OpenRouterChatResponse = await response.json();
    const content = body.choices[0]?.message?.content?.trim();
    return content ? content : null;
  } catch (error) {
    console.error("writeGroupRationale failed, degrading to no blurb", error);
    return null;
  }
}
