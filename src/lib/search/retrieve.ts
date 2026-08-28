import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyFilters,
  decadeToDateRange,
  runtimeBandToRange,
  PAGE_SIZE,
  type BrowseParams,
  type MovieRow,
} from "@/lib/movies/browse";
import { fetchEmbeddings } from "@/lib/ingest/openai";
import {
  cacheQueryEmbedding,
  getCachedQueryEmbedding,
  hashQuery,
} from "@/lib/search/query-cache";
import { matchMovies, type MatchedMovieRow } from "@/lib/search/match";
import type { ParsedSearchQuery } from "@/lib/search/parse";
import { logUsageEvent } from "@/lib/usage/events";

export interface RankedMovie extends MovieRow {
  matchedVia: "keyword" | "theme" | "keyword+theme";
  score: number;
}

// Reciprocal Rank Fusion constant - the standard default, and not sensitive
// to tuning for a two-list merge like this.
const RRF_K = 60;

// A boost, not a sort: at most a 5% bump for a perfect 10.0 weighted_rating,
// so a well-regarded film can nudge ahead of a similarly-ranked one without
// quality ever overriding actual relevance.
const WEIGHTED_RATING_BOOST = 0.05;

function rrfContribution(rank: number): number {
  return 1 / (RRF_K + rank);
}

/** Merges lexical (full-text) and vector (cosine) result lists - both
 * already rank-ordered by relevance - via Reciprocal Rank Fusion, applies a
 * mild weighted_rating boost, and tags how each result was found. */
export function mergeSearchResults(
  lexical: MovieRow[],
  vector: MatchedMovieRow[]
): RankedMovie[] {
  const entries = new Map<
    number,
    { row: MovieRow; rrf: number; inLexical: boolean; inVector: boolean }
  >();

  lexical.forEach((row, index) => {
    const entry = entries.get(row.id) ?? {
      row,
      rrf: 0,
      inLexical: false,
      inVector: false,
    };
    entry.rrf += rrfContribution(index + 1);
    entry.inLexical = true;
    entries.set(row.id, entry);
  });

  vector.forEach((row, index) => {
    const entry = entries.get(row.id) ?? {
      row,
      rrf: 0,
      inLexical: false,
      inVector: false,
    };
    entry.rrf += rrfContribution(index + 1);
    entry.inVector = true;
    entries.set(row.id, entry);
  });

  return [...entries.values()]
    .map(({ row, rrf, inLexical, inVector }): RankedMovie => {
      const weightedRating = row.weighted_rating ?? 0;
      const score = rrf * (1 + WEIGHTED_RATING_BOOST * (weightedRating / 10));
      const matchedVia =
        inLexical && inVector ? "keyword+theme" : inLexical ? "keyword" : "theme";
      return { ...row, matchedVia, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** Applies the same genre/decade/runtime/age semantics as browse.ts's
 * applyFilters, but in memory - match_movies already resolves to a bounded
 * array (see current-feature.md's Notes for why), so there's no query
 * builder left to chain PostgREST filters onto. A nullable field fails its
 * filter rather than passing, mirroring applyFilters's own null handling. */
export function filterMatchedRows(
  rows: MatchedMovieRow[],
  filters: ParsedSearchQuery["filters"]
): MatchedMovieRow[] {
  return rows.filter((row) => {
    if (
      filters.genreIds.length > 0 &&
      !filters.genreIds.some((id) => row.genre_ids.includes(id))
    ) {
      return false;
    }

    if (filters.decade !== null) {
      const { start, end } = decadeToDateRange(filters.decade);
      if (!row.release_date || row.release_date < start || row.release_date >= end) {
        return false;
      }
    }

    if (filters.runtimeBand !== null) {
      const { min, max } = runtimeBandToRange(filters.runtimeBand);
      if (row.runtime === null) return false;
      if (min !== null && row.runtime < min) return false;
      if (max !== null && row.runtime > max) return false;
    }

    if (filters.maxAge !== null) {
      if (row.min_age === null || row.min_age > filters.maxAge) return false;
    }

    return true;
  });
}

/** The cached embedding for `text`, computed and cached on a miss. Reuses
 * 6a's query_cache helpers and ingest/openai.ts's fetchEmbeddings rather
 * than a second embedding implementation. */
export async function getOrEmbedQuery(
  client: SupabaseClient,
  apiKey: string,
  text: string
): Promise<number[]> {
  const queryHash = hashQuery(text);
  const cached = await getCachedQueryEmbedding(client, queryHash);
  if (cached) return cached;

  const [embedding] = await fetchEmbeddings([text], apiKey);
  await cacheQueryEmbedding(client, { queryHash, queryText: text, embedding });
  // Logged only on this cache-miss path (build-plan feature 19b) - a cache
  // hit above returns early and never reaches here, so embedding_call stays
  // an accurate count of real OpenAI calls, not every query attempted.
  await logUsageEvent(client, "embedding_call", null);
  return embedding;
}

/** Full-text retrieval over search_doc, reusing browse.ts's applyFilters so
 * the same filter semantics apply here as on the browse page. Ordered by
 * popularity (see current-feature.md's Notes on why, not ts_rank). */
export async function lexicalSearch(
  client: SupabaseClient,
  filters: ParsedSearchQuery["filters"],
  semanticQuery: string,
  limit: number
): Promise<MovieRow[]> {
  const params: BrowseParams = {
    sort: "popularity",
    page: 1,
    q: semanticQuery,
    genreIds: filters.genreIds,
    decade: filters.decade,
    runtimeBand: filters.runtimeBand,
    maxAge: filters.maxAge,
  };

  const { data, error } = await applyFilters(
    client
      .from("movies")
      .select(
        "id, title, poster_path, release_date, vote_average, weighted_rating, popularity"
      ),
    params
  )
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<MovieRow[]>();

  if (error) throw error;
  return data ?? [];
}

/** Vector retrieval via 6a's match_movies RPC, filtered to the same hard
 * filters as lexicalSearch (in memory - see filterMatchedRows above). */
export async function vectorSearch(
  client: SupabaseClient,
  embedding: number[],
  filters: ParsedSearchQuery["filters"],
  limit: number
): Promise<MatchedMovieRow[]> {
  const rows = await matchMovies(client, embedding, limit);
  return filterMatchedRows(rows, filters);
}

// How many raw candidates each retrieval arm fetches before merge/slice -
// matches match_movies' own default, independent of the final page size.
const RETRIEVAL_LIMIT = 200;

/** Parses -> embeds/caches -> retrieves (lexical + vector, in parallel) ->
 * merges -> slices to `limit`. If embedding fails (OpenAI outage, or the
 * cache-miss fetchEmbeddings call throws), degrades to lexical-only results
 * instead of failing the whole search - lexicalSearch has no dependency on
 * the embedding, so it's kicked off immediately rather than waiting on it. */
export async function searchMovies(
  client: SupabaseClient,
  apiKey: string,
  parsed: ParsedSearchQuery,
  limit: number = PAGE_SIZE
): Promise<RankedMovie[]> {
  const lexicalPromise = lexicalSearch(
    client,
    parsed.filters,
    parsed.semanticQuery,
    RETRIEVAL_LIMIT
  );

  const vectorPromise = (async (): Promise<MatchedMovieRow[]> => {
    try {
      const embedding = await getOrEmbedQuery(client, apiKey, parsed.semanticQuery);
      return await vectorSearch(client, embedding, parsed.filters, RETRIEVAL_LIMIT);
    } catch (error) {
      console.error(
        "searchMovies: embedding/vector retrieval failed, degrading to lexical-only",
        error
      );
      return [];
    }
  })();

  const [lexical, vector] = await Promise.all([lexicalPromise, vectorPromise]);

  return mergeSearchResults(lexical, vector).slice(0, limit);
}
