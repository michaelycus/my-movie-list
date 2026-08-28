import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageStats } from "@/types/admin";

interface UsageEventRow {
  event_type: string;
  user_id: string | null;
  meta: unknown;
  created_at: string;
}

/** Buckets `signup` events into the last `days` UTC days ending at `now`,
 * oldest first, zero-filled - a quiet day must render as a 0 bar, not a gap
 * in the strip. */
export function groupSignupsByDay(
  events: Pick<UsageEventRow, "event_type" | "created_at">[],
  days: number,
  now: Date
): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }

  for (const event of events) {
    if (event.event_type !== "signup") continue;
    const date = event.created_at.slice(0, 10);
    if (buckets.has(date)) {
      buckets.set(date, (buckets.get(date) ?? 0) + 1);
    }
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export function countEventsByType(events: Pick<UsageEventRow, "event_type">[], eventType: string): number {
  return events.filter((event) => event.event_type === eventType).length;
}

/** `search` events split by whether the searcher was signed in - covers
 * "search volume, anonymous vs authenticated" directly from `user_id`,
 * which 19b already set to null for an anonymous searcher. */
export function splitSearchVolume(
  events: Pick<UsageEventRow, "event_type" | "user_id">[]
): { anonymous: number; authenticated: number } {
  let anonymous = 0;
  let authenticated = 0;
  for (const event of events) {
    if (event.event_type !== "search") continue;
    if (event.user_id === null) anonymous++;
    else authenticated++;
  }
  return { anonymous, authenticated };
}

/** Counts `film_chosen` events by their `meta.movieId`, returns the top
 * `limit` by count. A malformed/missing movieId is skipped, not thrown - a
 * dashboard shouldn't break over one bad event row. */
export function rankMostChosenMovieIds(
  events: Pick<UsageEventRow, "meta">[],
  limit: number
): { movieId: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const event of events) {
    const movieId = (event.meta as { movieId?: unknown } | null)?.movieId;
    if (typeof movieId === "number") {
      counts.set(movieId, (counts.get(movieId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([movieId, count]) => ({ movieId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// OpenAI text-embedding-3-small: $0.02/1M tokens (openai.com/api/pricing,
// checked August 2026 - matches project-overview.md's own ingest-cost
// figure). Query/mood/taste texts logged as embedding_call are all short;
// ~100 tokens/call is a documented estimate, not measured token usage.
const EMBEDDING_COST_PER_CALL_USD = (100 / 1_000_000) * 0.02;

// OpenRouter meta-llama/llama-3.1-8b-instruct - the model both llm_call
// sites (search parse, group rationale) actually use: $0.02/1M input,
// $0.04/1M output tokens (openrouter.ai/meta-llama/llama-3.1-8b-instruct/pricing,
// checked August 2026). ~500 input + ~150 output tokens/call approximates
// both prompts' real sizes; also a documented estimate, not measured usage.
const LLM_COST_PER_CALL_USD = (500 / 1_000_000) * 0.02 + (150 / 1_000_000) * 0.04;

/** A rough estimated spend in USD from call counts alone - see the
 * constants above for the pricing and per-call size assumptions behind it.
 * Never billing data; the dashboard must label it as an estimate. */
export function estimateApiSpendUsd(embeddingCallCount: number, llmCallCount: number): number {
  return embeddingCallCount * EMBEDDING_COST_PER_CALL_USD + llmCallCount * LLM_COST_PER_CALL_USD;
}

/** A portfolio-scale estimate is often a fraction of a cent - plain
 * `toFixed(2)` would render every early value as a misleading "$0.00".
 * Below one cent, show enough decimals for the number to read as
 * nonzero. */
export function formatSpendUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`;
}

/** Assembles the admin dashboard's data (build-plan feature 19c) from every
 * usage_events row - 19a's admin-only SELECT policy already scopes this to
 * "every row, since the caller is the admin"; there's no owner to filter by
 * on an aggregate reporting query. mostChosenFilms reads film_chosen events
 * rather than the sessions table on purpose - sessions' RLS is
 * intentionally owner-only, and usage_events already has what's needed (see
 * current-feature.md's Out of scope). */
export async function getUsageStats(client: SupabaseClient): Promise<UsageStats> {
  const { data, error } = await client
    .from("usage_events")
    .select("event_type, user_id, meta, created_at")
    .returns<UsageEventRow[]>();

  if (error) throw error;
  const events = data ?? [];

  const filmChosenEvents = events.filter((event) => event.event_type === "film_chosen");
  const topPicks = rankMostChosenMovieIds(filmChosenEvents, 5);

  const movieIds = topPicks.map((pick) => pick.movieId);
  const { data: movieRows, error: movieError } =
    movieIds.length > 0
      ? await client
          .from("movies")
          .select("id, title, poster_path")
          .in("id", movieIds)
          .returns<{ id: number; title: string; poster_path: string | null }[]>()
      : { data: [] as { id: number; title: string; poster_path: string | null }[], error: null };

  if (movieError) throw movieError;
  const moviesById = new Map((movieRows ?? []).map((movie) => [movie.id, movie]));

  const mostChosenFilms = topPicks
    .map((pick) => {
      const movie = moviesById.get(pick.movieId);
      return movie ? { movieId: pick.movieId, title: movie.title, posterPath: movie.poster_path, count: pick.count } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const embeddingCallCount = countEventsByType(events, "embedding_call");
  const llmCallCount = countEventsByType(events, "llm_call");

  return {
    signupsByDay: groupSignupsByDay(events, 14, new Date()),
    sessionsCreatedCount: countEventsByType(events, "session_created"),
    mostChosenFilms,
    searchVolume: splitSearchVolume(events),
    embeddingCallCount,
    llmCallCount,
    estimatedSpendUsd: estimateApiSpendUsd(embeddingCallCount, llmCallCount),
  };
}
