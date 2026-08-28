import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/search/match", () => ({
  matchMovies: vi.fn(),
}));

vi.mock("@/lib/ingest/openai", () => ({
  fetchEmbeddings: vi.fn(),
}));

vi.mock("@/lib/search/query-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search/query-cache")>();
  return {
    ...actual,
    getCachedQueryEmbedding: vi.fn(),
    cacheQueryEmbedding: vi.fn(),
  };
});

vi.mock("@/lib/usage/events", () => ({
  logUsageEvent: vi.fn(),
}));

import {
  filterMatchedRows,
  getOrEmbedQuery,
  lexicalSearch,
  mergeSearchResults,
  searchMovies,
  vectorSearch,
} from "./retrieve";
import type { MovieRow } from "@/lib/movies/browse";
import { matchMovies, type MatchedMovieRow } from "@/lib/search/match";
import { fetchEmbeddings } from "@/lib/ingest/openai";
import {
  cacheQueryEmbedding,
  getCachedQueryEmbedding,
  hashQuery,
} from "@/lib/search/query-cache";
import type { ParsedSearchQuery } from "@/lib/search/parse";
import { logUsageEvent } from "@/lib/usage/events";

function movieRow(overrides: Partial<MovieRow> & { id: number }): MovieRow {
  return {
    title: `Movie ${overrides.id}`,
    poster_path: null,
    release_date: "2000-01-01",
    vote_average: 7,
    weighted_rating: 7,
    popularity: 10,
    ...overrides,
  };
}

function matchedRow(
  overrides: Partial<MatchedMovieRow> & { id: number }
): MatchedMovieRow {
  return {
    ...movieRow(overrides),
    genre_ids: [],
    runtime: 100,
    min_age: 0,
    similarity: 0.5,
    ...overrides,
  };
}

const noFilters: ParsedSearchQuery["filters"] = {
  genreIds: [],
  decade: null,
  runtimeBand: null,
  maxAge: null,
};

// A fluent mock mirroring the PostgrestFilterBuilder chain applyFilters
// drives: every method returns the same object, which resolves like an
// awaited query when the caller `await`s it.
function mockMoviesQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["textSearch", "overlaps", "gte", "lt", "lte", "order", "limit", "returns"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: typeof result) => void) => resolve(result);
  return query as typeof query & {
    textSearch: ReturnType<typeof vi.fn>;
    overlaps: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  };
}

function mockMoviesClient(result: { data: unknown; error: unknown }) {
  const query = mockMoviesQuery(result);
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, query };
}

describe("mergeSearchResults", () => {
  it("tags a lexical-only result as keyword", () => {
    const result = mergeSearchResults([movieRow({ id: 1 })], []);
    expect(result).toHaveLength(1);
    expect(result[0].matchedVia).toBe("keyword");
  });

  it("tags a vector-only result as theme", () => {
    const result = mergeSearchResults([], [matchedRow({ id: 1 })]);
    expect(result).toHaveLength(1);
    expect(result[0].matchedVia).toBe("theme");
  });

  it("tags a result in both lists as keyword+theme and ranks it above single-list results", () => {
    const both = movieRow({ id: 1, weighted_rating: 5 });
    const lexicalOnly = movieRow({ id: 2, weighted_rating: 5 });
    const vectorOnly = matchedRow({ id: 3, weighted_rating: 5 });

    const result = mergeSearchResults(
      [both, lexicalOnly],
      [matchedRow({ id: 1, weighted_rating: 5 }), vectorOnly]
    );

    const byId = new Map(result.map((r) => [r.id, r]));
    expect(byId.get(1)?.matchedVia).toBe("keyword+theme");
    expect(result[0].id).toBe(1);
  });

  it("uses weighted_rating as a mild tie-break, not an override", () => {
    // Both rank #1 in their own list (equal base RRF), but movie 1 has a
    // much higher weighted_rating - it should come out ahead.
    const highRated = movieRow({ id: 1, weighted_rating: 10 });

    const result = mergeSearchResults([highRated], [matchedRow({ id: 2, weighted_rating: 0 })]);

    expect(result[0].id).toBe(1);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeSearchResults([], [])).toEqual([]);
  });
});

describe("filterMatchedRows", () => {
  it("passes everything through with no filters", () => {
    const rows = [matchedRow({ id: 1 }), matchedRow({ id: 2 })];
    expect(filterMatchedRows(rows, noFilters)).toHaveLength(2);
  });

  it("filters by genre overlap", () => {
    const rows = [
      matchedRow({ id: 1, genre_ids: [35] }),
      matchedRow({ id: 2, genre_ids: [18] }),
    ];
    const result = filterMatchedRows(rows, { ...noFilters, genreIds: [35] });
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("filters by decade range", () => {
    const rows = [
      matchedRow({ id: 1, release_date: "1995-06-01" }),
      matchedRow({ id: 2, release_date: "2005-06-01" }),
    ];
    const result = filterMatchedRows(rows, { ...noFilters, decade: 1990 });
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("excludes a null release_date under a decade filter", () => {
    const rows = [matchedRow({ id: 1, release_date: null })];
    expect(filterMatchedRows(rows, { ...noFilters, decade: 1990 })).toEqual([]);
  });

  it("filters by runtime band", () => {
    const rows = [
      matchedRow({ id: 1, runtime: 80 }),
      matchedRow({ id: 2, runtime: 120 }),
    ];
    const result = filterMatchedRows(rows, { ...noFilters, runtimeBand: "short" });
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("excludes a null runtime under a runtime band filter", () => {
    const rows = [matchedRow({ id: 1, runtime: null })];
    expect(filterMatchedRows(rows, { ...noFilters, runtimeBand: "short" })).toEqual([]);
  });

  it("filters by max age ceiling", () => {
    const rows = [
      matchedRow({ id: 1, min_age: 10 }),
      matchedRow({ id: 2, min_age: 18 }),
    ];
    const result = filterMatchedRows(rows, { ...noFilters, maxAge: 12 });
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("excludes a null min_age under a max age filter", () => {
    const rows = [matchedRow({ id: 1, min_age: null })];
    expect(filterMatchedRows(rows, { ...noFilters, maxAge: 12 })).toEqual([]);
  });
});

describe("getOrEmbedQuery", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the cached embedding without calling fetchEmbeddings on a hit", async () => {
    vi.mocked(getCachedQueryEmbedding).mockResolvedValue([0.1, 0.2]);

    const result = await getOrEmbedQuery(
      {} as SupabaseClient,
      "sk-test",
      "funny movie"
    );

    expect(result).toEqual([0.1, 0.2]);
    expect(fetchEmbeddings).not.toHaveBeenCalled();
    expect(cacheQueryEmbedding).not.toHaveBeenCalled();
    expect(logUsageEvent).not.toHaveBeenCalled();
  });

  it("embeds and caches on a miss", async () => {
    vi.mocked(getCachedQueryEmbedding).mockResolvedValue(null);
    vi.mocked(fetchEmbeddings).mockResolvedValue([[0.3, 0.4]]);

    const result = await getOrEmbedQuery(
      {} as SupabaseClient,
      "sk-test",
      "funny movie"
    );

    expect(result).toEqual([0.3, 0.4]);
    expect(fetchEmbeddings).toHaveBeenCalledWith(["funny movie"], "sk-test");
    expect(cacheQueryEmbedding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        queryHash: hashQuery("funny movie"),
        queryText: "funny movie",
        embedding: [0.3, 0.4],
      })
    );
    expect(logUsageEvent).toHaveBeenCalledWith(expect.anything(), "embedding_call", null);
  });
});

describe("lexicalSearch", () => {
  it("applies filters and text search, ordered by popularity", async () => {
    const rows = [movieRow({ id: 1 })];
    const { client, from, query } = mockMoviesClient({ data: rows, error: null });

    const result = await lexicalSearch(
      client,
      { genreIds: [35], decade: 1990, runtimeBand: "short", maxAge: 12 },
      "funny movie",
      50
    );

    expect(from).toHaveBeenCalledWith("movies");
    expect(query.textSearch).toHaveBeenCalledWith("search_doc", "funny movie", {
      type: "websearch",
      config: "simple",
    });
    expect(query.overlaps).toHaveBeenCalledWith("genre_ids", [35]);
    expect(query.order).toHaveBeenCalledWith("popularity", {
      ascending: false,
      nullsFirst: false,
    });
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(result).toEqual(rows);
  });

  it("returns an empty array when data is null", async () => {
    const { client } = mockMoviesClient({ data: null, error: null });
    expect(await lexicalSearch(client, noFilters, "x", 50)).toEqual([]);
  });

  it("throws on a query error", async () => {
    const { client } = mockMoviesClient({ data: null, error: new Error("boom") });
    await expect(lexicalSearch(client, noFilters, "x", 50)).rejects.toThrow(
      "boom"
    );
  });
});

describe("vectorSearch", () => {
  afterEach(() => vi.clearAllMocks());

  it("filters the RPC's rows", async () => {
    vi.mocked(matchMovies).mockResolvedValue([
      matchedRow({ id: 1, genre_ids: [35] }),
      matchedRow({ id: 2, genre_ids: [18] }),
    ]);

    const result = await vectorSearch(
      {} as SupabaseClient,
      [0.1],
      { ...noFilters, genreIds: [35] },
      50
    );

    expect(matchMovies).toHaveBeenCalledWith(expect.anything(), [0.1], 50);
    expect(result.map((r) => r.id)).toEqual([1]);
  });
});

describe("searchMovies", () => {
  afterEach(() => vi.clearAllMocks());

  it("runs lexical and vector retrieval in parallel, not sequentially", async () => {
    let resolveLexical: (() => void) | undefined;
    const lexicalGate = new Promise<void>((resolve) => {
      resolveLexical = resolve;
    });

    const query: Record<string, unknown> = {};
    for (const method of ["textSearch", "overlaps", "gte", "lt", "lte", "order", "limit", "returns"]) {
      query[method] = vi.fn(() => query);
    }
    query.then = (resolve: (value: { data: unknown; error: unknown }) => void) => {
      lexicalGate.then(() => resolve({ data: [], error: null }));
    };
    const from = vi.fn(() => ({ select: vi.fn(() => query) }));
    const client = { from } as unknown as SupabaseClient;

    vi.mocked(getCachedQueryEmbedding).mockResolvedValue([0.1]);
    vi.mocked(matchMovies).mockResolvedValue([]);

    const resultPromise = searchMovies(client, "sk-test", {
      filters: noFilters,
      semanticQuery: "funny movie",
    });

    // getOrEmbedQuery's cache check has already fired even though the
    // lexical query is deliberately still unresolved - proves the two
    // retrieval arms were kicked off together, not one after the other.
    expect(getCachedQueryEmbedding).toHaveBeenCalled();

    resolveLexical?.();
    expect(await resultPromise).toEqual([]);
  });

  it("merges lexical and vector results and slices to the requested limit", async () => {
    const { client } = mockMoviesClient({
      data: [movieRow({ id: 1 }), movieRow({ id: 2 })],
      error: null,
    });
    vi.mocked(getCachedQueryEmbedding).mockResolvedValue([0.1]);
    vi.mocked(matchMovies).mockResolvedValue([matchedRow({ id: 3 })]);

    const result = await searchMovies(
      client,
      "sk-test",
      { filters: noFilters, semanticQuery: "funny movie" },
      2
    );

    expect(result).toHaveLength(2);
    expect(result.every((r) => [1, 2, 3].includes(r.id))).toBe(true);
  });

  it("falls back to lexical-only results when embedding fails", async () => {
    const { client } = mockMoviesClient({
      data: [movieRow({ id: 1 })],
      error: null,
    });
    vi.mocked(getCachedQueryEmbedding).mockRejectedValue(new Error("db down"));

    const result = await searchMovies(client, "sk-test", {
      filters: noFilters,
      semanticQuery: "funny movie",
    });

    expect(result).toEqual([expect.objectContaining({ id: 1, matchedVia: "keyword" })]);
    expect(matchMovies).not.toHaveBeenCalled();
  });
});
