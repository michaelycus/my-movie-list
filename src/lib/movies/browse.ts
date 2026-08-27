import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { BrowseMovie } from "@/types/movie";

export type BrowseSort = "popularity" | "rating" | "release_date";
export type RuntimeBand = "short" | "standard" | "long";
export type AgeCeiling = 0 | 10 | 12 | 14 | 16 | 17 | 18;

export const PAGE_SIZE = 24;

// The certifications actually present in min_age - anything else in the URL
// is treated as absent rather than an unknown ceiling. Exported so other
// modules (e.g. search/parse.ts) validate against the same list instead of
// redeclaring it.
export const AGE_CEILINGS: readonly AgeCeiling[] = [0, 10, 12, 14, 16, 17, 18];

export interface BrowseParams {
  sort: BrowseSort;
  page: number;
  q: string | null;
  genreIds: number[];
  decade: number | null;
  runtimeBand: RuntimeBand | null;
  maxAge: AgeCeiling | null;
}

// Falls back to the default rather than rejecting - an unrecognized `sort` or
// out-of-range `page` in the URL should render page 1 sorted by popularity,
// not error the whole catalog page.
const sortSchema = z
  .enum(["popularity", "rating", "release_date"])
  .catch("popularity");

const pageSchema = z.coerce.number().int().positive().catch(1);

const runtimeBandSchema = z.enum(["short", "standard", "long"]);

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQ(raw: SearchParamValue): string | null {
  const trimmed = firstValue(raw)?.trim();
  return trimmed ? trimmed : null;
}

// Accepts either a repeated `genre` param or a comma-separated one. Invalid
// entries are dropped rather than rejecting the whole request - a hand-edited
// or stale URL shouldn't break the page over one bad id.
function parseGenreIds(raw: SearchParamValue): number[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const ids = values
    .flatMap((value) => value.split(","))
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

function parseDecade(raw: SearchParamValue): number | null {
  const value = firstValue(raw);
  if (value === undefined) return null;
  const decade = Number.parseInt(value, 10);
  if (!Number.isInteger(decade) || decade % 10 !== 0) return null;
  if (decade < 1920 || decade > 2020) return null;
  return decade;
}

function parseRuntimeBand(raw: SearchParamValue): RuntimeBand | null {
  const result = runtimeBandSchema.safeParse(firstValue(raw));
  return result.success ? result.data : null;
}

function parseMaxAge(raw: SearchParamValue): AgeCeiling | null {
  const value = firstValue(raw);
  if (value === undefined) return null;
  const age = Number.parseInt(value, 10);
  return (AGE_CEILINGS as readonly number[]).includes(age)
    ? (age as AgeCeiling)
    : null;
}

export function parseBrowseParams(
  searchParams: Record<string, SearchParamValue>
): BrowseParams {
  return {
    sort: sortSchema.parse(firstValue(searchParams.sort)),
    page: pageSchema.parse(firstValue(searchParams.page)),
    q: parseQ(searchParams.q),
    genreIds: parseGenreIds(searchParams.genre),
    decade: parseDecade(searchParams.decade),
    runtimeBand: parseRuntimeBand(searchParams.runtime),
    maxAge: parseMaxAge(searchParams.age),
  };
}

/** Inclusive-start, exclusive-end date bounds for a decade, e.g. 1990 -> [1990-01-01, 2000-01-01). */
export function decadeToDateRange(decade: number): { start: string; end: string } {
  return {
    start: `${decade}-01-01`,
    end: `${decade + 10}-01-01`,
  };
}

/** Minute bounds for a runtime band; `null` means that side is unbounded. */
export function runtimeBandToRange(
  band: RuntimeBand
): { min: number | null; max: number | null } {
  switch (band) {
    case "short":
      return { min: null, max: 89 };
    case "standard":
      return { min: 90, max: 150 };
    case "long":
      return { min: 151, max: null };
  }
}

// Omits default/empty fields so links stay short and the unfiltered catalog
// has no querystring at all.
export function buildSearchHref(
  params: BrowseParams,
  overrides: Partial<BrowseParams> = {}
): string {
  const merged: BrowseParams = { ...params, ...overrides };
  const search = new URLSearchParams();

  if (merged.sort !== "popularity") search.set("sort", merged.sort);
  if (merged.page !== 1) search.set("page", String(merged.page));
  if (merged.q) search.set("q", merged.q);
  for (const id of merged.genreIds) search.append("genre", String(id));
  if (merged.decade !== null) search.set("decade", String(merged.decade));
  if (merged.runtimeBand !== null) search.set("runtime", merged.runtimeBand);
  if (merged.maxAge !== null) search.set("age", String(merged.maxAge));

  const query = search.toString();
  return query ? `/?${query}` : "/";
}

export function hasActiveFilters(params: BrowseParams): boolean {
  return (
    params.q !== null ||
    params.genreIds.length > 0 ||
    params.decade !== null ||
    params.runtimeBand !== null ||
    params.maxAge !== null
  );
}

export function clearFiltersHref(params: BrowseParams): string {
  return buildSearchHref(params, {
    q: null,
    genreIds: [],
    decade: null,
    runtimeBand: null,
    maxAge: null,
    page: 1,
  });
}

// "Rating" sorts on weighted_rating (Bayesian-adjusted), not raw vote_average -
// see project-overview.md, so a 10.0 with 4 votes doesn't outrank a 8.5 with
// 10,000.
const SORT_COLUMNS: Record<BrowseSort, string> = {
  popularity: "popularity",
  rating: "weighted_rating",
  release_date: "release_date",
};

/** Movies row shape shared with match.ts's match_movies RPC wrapper - keep
 * the two column sets in sync rather than redefining them twice. */
export interface MovieRow {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  weighted_rating: number | null;
  popularity: number | null;
}

function toBrowseMovie(row: MovieRow): BrowseMovie {
  return {
    id: row.id,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    voteAverage: row.vote_average,
    weightedRating: row.weighted_rating,
    popularity: row.popularity,
  };
}

interface FilterableQuery<Self> {
  textSearch(
    column: string,
    query: string,
    options?: { type?: "plain" | "phrase" | "websearch"; config?: string }
  ): Self;
  overlaps(column: string, value: readonly unknown[]): Self;
  gte(column: string, value: unknown): Self;
  lt(column: string, value: unknown): Self;
  lte(column: string, value: unknown): Self;
}

// Applied to both the count query and the data query, so pagination stays
// accurate under filters - filtering only one would desync totalCount from
// the actual result set. min_age/runtime are nullable, and Postgres's own
// comparison semantics already exclude those nulls from a gte/lte filter
// (NULL <= x is NULL, not true), which is exactly the "unknown isn't safe"
// behavior these filters need - no extra null-handling required.
export function applyFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  params: BrowseParams
): Q {
  let filtered = query;

  if (params.q) {
    filtered = filtered.textSearch("search_doc", params.q, {
      type: "websearch",
      config: "simple",
    });
  }
  if (params.genreIds.length > 0) {
    filtered = filtered.overlaps("genre_ids", params.genreIds);
  }
  if (params.decade !== null) {
    const { start, end } = decadeToDateRange(params.decade);
    filtered = filtered.gte("release_date", start).lt("release_date", end);
  }
  if (params.runtimeBand !== null) {
    const { min, max } = runtimeBandToRange(params.runtimeBand);
    if (min !== null) filtered = filtered.gte("runtime", min);
    if (max !== null) filtered = filtered.lte("runtime", max);
  }
  if (params.maxAge !== null) {
    filtered = filtered.lte("min_age", params.maxAge);
  }

  return filtered;
}

export async function getBrowseMovies(
  params: BrowseParams
): Promise<{ movies: BrowseMovie[]; totalCount: number }> {
  const { sort, page } = params;
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  // PostgREST errors (PGRST103) rather than returning an empty page when the
  // requested offset is past the last row - check the count first so a page
  // number beyond the end (a stale link, a hand-edited URL) renders an empty
  // grid instead of crashing.
  const { count, error: countError } = await applyFilters(
    supabase.from("movies").select("id", { count: "exact", head: true }),
    params
  );

  if (countError) throw countError;

  const totalCount = count ?? 0;
  if (from >= totalCount) {
    return { movies: [], totalCount };
  }

  const to = from + PAGE_SIZE - 1;
  const { data, error } = await applyFilters(
    supabase
      .from("movies")
      .select(
        "id, title, poster_path, release_date, vote_average, weighted_rating, popularity"
      ),
    params
  )
    .order(SORT_COLUMNS[sort], { ascending: false, nullsFirst: false })
    .range(from, to)
    .returns<MovieRow[]>();

  if (error) throw error;

  return {
    movies: (data ?? []).map(toBrowseMovie),
    totalCount,
  };
}

interface GenreRow {
  id: number;
  name: string;
}

export async function getGenres(): Promise<GenreRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("genres")
    .select("id, name")
    .order("name")
    .returns<GenreRow[]>();

  if (error) throw error;

  return data ?? [];
}
