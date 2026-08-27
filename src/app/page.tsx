import Link from "next/link";
import {
  clearFiltersHref,
  getBrowseMovies,
  getGenres,
  hasActiveFilters,
  parseBrowseParams,
  PAGE_SIZE,
} from "@/lib/movies/browse";
import type { BrowseMovie } from "@/types/movie";
import { PosterGrid } from "@/components/catalog/PosterGrid";
import { SortControl } from "@/components/catalog/SortControl";
import { Pagination } from "@/components/catalog/Pagination";
import { SearchBar } from "@/components/catalog/SearchBar";
import { FilterBar } from "@/components/catalog/FilterBar";
import { NaturalLanguageSearchBar } from "@/components/catalog/NaturalLanguageSearchBar";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = parseBrowseParams(await searchParams);

  let movies: BrowseMovie[] = [];
  let totalCount = 0;
  let genres: { id: number; name: string }[] = [];
  let loadFailed = false;
  try {
    const [browseResult, genreResult] = await Promise.all([
      getBrowseMovies(params),
      getGenres(),
    ]);
    movies = browseResult.movies;
    totalCount = browseResult.totalCount;
    genres = genreResult;
  } catch (error) {
    console.error("Failed to load browse movies", error);
    loadFailed = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">CineMood</h1>
        <SortControl params={params} />
      </div>
      <NaturalLanguageSearchBar />
      {loadFailed ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load the catalog right now. Try refreshing the page.
        </p>
      ) : (
        <>
          <SearchBar params={params} />
          <FilterBar params={params} genres={genres} />
          {movies.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-muted-foreground">
              No films match your filters.
              {hasActiveFilters(params) && (
                <>
                  {" "}
                  <Link
                    href={clearFiltersHref(params)}
                    className="text-neon-cyan hover:underline"
                  >
                    Clear filters
                  </Link>
                </>
              )}
            </p>
          ) : (
            <>
              <PosterGrid movies={movies} />
              <Pagination params={params} totalPages={totalPages} />
            </>
          )}
        </>
      )}
    </main>
  );
}
