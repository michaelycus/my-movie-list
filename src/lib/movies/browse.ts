import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { BrowseMovie } from "@/types/movie";

export type BrowseSort = "popularity" | "rating" | "release_date";

export const PAGE_SIZE = 24;

export interface BrowseParams {
  sort: BrowseSort;
  page: number;
}

// Falls back to the default rather than rejecting - an unrecognized `sort` or
// out-of-range `page` in the URL should render page 1 sorted by popularity,
// not error the whole catalog page.
const sortSchema = z
  .enum(["popularity", "rating", "release_date"])
  .catch("popularity");

const pageSchema = z.coerce.number().int().positive().catch(1);

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseBrowseParams(
  searchParams: Record<string, SearchParamValue>
): BrowseParams {
  return {
    sort: sortSchema.parse(firstValue(searchParams.sort)),
    page: pageSchema.parse(firstValue(searchParams.page)),
  };
}

// "Rating" sorts on weighted_rating (Bayesian-adjusted), not raw vote_average -
// see project-overview.md, so a 10.0 with 4 votes doesn't outrank a 8.5 with
// 10,000.
const SORT_COLUMNS: Record<BrowseSort, string> = {
  popularity: "popularity",
  rating: "weighted_rating",
  release_date: "release_date",
};

interface MovieRow {
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

export async function getBrowseMovies({
  sort,
  page,
}: BrowseParams): Promise<{ movies: BrowseMovie[]; totalCount: number }> {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  // PostgREST errors (PGRST103) rather than returning an empty page when the
  // requested offset is past the last row - check the count first so a page
  // number beyond the end (a stale link, a hand-edited URL) renders an empty
  // grid instead of crashing.
  const { count, error: countError } = await supabase
    .from("movies")
    .select("id", { count: "exact", head: true });

  if (countError) throw countError;

  const totalCount = count ?? 0;
  if (from >= totalCount) {
    return { movies: [], totalCount };
  }

  const to = from + PAGE_SIZE - 1;
  const { data, error } = await supabase
    .from("movies")
    .select(
      "id, title, poster_path, release_date, vote_average, weighted_rating, popularity"
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
