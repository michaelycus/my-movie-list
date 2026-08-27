import { z } from "zod";
import { AGE_CEILINGS, type AgeCeiling, type RuntimeBand } from "@/lib/movies/browse";

export interface GenreOption {
  id: number;
  name: string;
}

export interface ParsedSearchQuery {
  filters: {
    genreIds: number[];
    decade: number | null;
    runtimeBand: RuntimeBand | null;
    maxAge: AgeCeiling | null;
  };
  semanticQuery: string;
}

// Mirrors the decade range browse.ts's parseDecade already enforces - the
// catalog is TMDB's 2016-vintage 5000-film set.
const MIN_DECADE = 1920;
const MAX_DECADE = 2020;

const modelResponseSchema = z.object({
  genres: z.array(z.string()).default([]),
  decade: z
    .number()
    .int()
    .refine((n) => n % 10 === 0, "decade must be a multiple of 10")
    .refine((n) => n >= MIN_DECADE && n <= MAX_DECADE, "decade out of range")
    .nullable()
    .default(null),
  runtimeBand: z.enum(["short", "standard", "long"]).nullable().default(null),
  maxAge: z
    .number()
    .refine(
      (n) => (AGE_CEILINGS as readonly number[]).includes(n),
      "not a known age ceiling"
    )
    .nullable()
    .default(null),
  // Required, unlike the filter fields above: a model response missing this
  // entirely is a strong signal something went wrong (wrong shape, refusal,
  // truncated output), not just "no filters extracted."
  semanticQuery: z.string(),
});

/** System + user messages instructing the model to return the exact JSON
 * shape modelResponseSchema validates. Genre names come from the caller so
 * the model only ever proposes names that actually exist in the catalog. */
export function buildParsePrompt(text: string, genres: GenreOption[]) {
  const genreNames = genres.map((g) => g.name).join(", ");
  const system = `You turn a film search request into structured filters plus a semantic query.

Available genres: ${genreNames}.

Respond with ONLY a JSON object of this exact shape, no other text:
{
  "genres": string[],       // subset of the available genres that clearly apply, else []
  "decade": number | null,  // e.g. 1990 for "90s movies", else null
  "runtimeBand": "short" | "standard" | "long" | null, // short is under 90 min, standard is 90-150 min, long is over 150 min
  "maxAge": number | null,  // one of ${AGE_CEILINGS.join(", ")} - the strictest age rating that fits the request, else null
  "semanticQuery": string   // the request rewritten as a short description of tone/plot/people, dropping whatever was already captured above
}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: text },
  ];
}

/** Case-insensitive exact match against the catalog; names the model
 * invents or misspells are dropped rather than erroring - degrade the
 * filter, don't fail the search. */
export function mapGenreNamesToIds(
  names: string[],
  genres: GenreOption[]
): number[] {
  const byName = new Map(genres.map((g) => [g.name.toLowerCase(), g.id]));
  const ids = names
    .map((name) => byName.get(name.toLowerCase()))
    .filter((id): id is number => id !== undefined);
  return [...new Set(ids)];
}

/** Validates and maps the model's raw JSON into a ParsedSearchQuery, or
 * `null` if the shape doesn't match - the caller falls back to raw text. */
export function parseModelJson(
  raw: unknown,
  genres: GenreOption[],
  originalText: string
): ParsedSearchQuery | null {
  const result = modelResponseSchema.safeParse(raw);
  if (!result.success) return null;

  const { genres: genreNames, decade, runtimeBand, maxAge, semanticQuery } =
    result.data;

  return {
    filters: {
      genreIds: mapGenreNamesToIds(genreNames, genres),
      decade,
      runtimeBand,
      maxAge: maxAge as AgeCeiling | null,
    },
    semanticQuery: semanticQuery.trim() || originalText,
  };
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// A small, fast model per the project plan's own example - this isn't
// latency- or quality-critical.
const MODEL = "meta-llama/llama-3.1-8b-instruct";

interface OpenRouterChatResponse {
  choices: { message: { content: string } }[];
}

/** Mirrors ingest/openai.ts's fetchWithRetry - kept separate rather than
 * shared, per that file's own precedent, so this feature doesn't touch
 * already-tested ingest code for an unrelated call. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`OpenRouter request failed: ${response.status} ${url}`);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const delayMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function rawTextFallback(text: string): ParsedSearchQuery {
  return {
    filters: { genreIds: [], decade: null, runtimeBand: null, maxAge: null },
    semanticQuery: text,
  };
}

/** Turns free text into `{ filters, semanticQuery }` via one OpenRouter
 * chat completion. Never throws: a network failure, a non-JSON body, or a
 * response that doesn't match the expected shape all degrade to searching
 * the raw text, the same way the group-rationale LLM call is designed to
 * degrade to "no blurb" rather than break the request on an outage. */
export async function parseSearchQuery(
  text: string,
  genres: GenreOption[],
  apiKey: string
): Promise<ParsedSearchQuery> {
  try {
    const response = await fetchWithRetry(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: buildParsePrompt(text, genres),
      }),
    });

    const body: OpenRouterChatResponse = await response.json();
    const content = body.choices[0]?.message?.content;
    if (!content) return rawTextFallback(text);

    return parseModelJson(JSON.parse(content), genres, text) ?? rawTextFallback(text);
  } catch (error) {
    console.error("parseSearchQuery failed, falling back to raw text", error);
    return rawTextFallback(text);
  }
}
