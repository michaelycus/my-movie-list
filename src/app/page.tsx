import {
  getBrowseMovies,
  parseBrowseParams,
  PAGE_SIZE,
} from "@/lib/movies/browse";
import type { BrowseMovie } from "@/types/movie";
import { PosterGrid } from "@/components/catalog/PosterGrid";
import { SortControl } from "@/components/catalog/SortControl";
import { Pagination } from "@/components/catalog/Pagination";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = parseBrowseParams(await searchParams);

  let movies: BrowseMovie[] = [];
  let totalCount = 0;
  let loadFailed = false;
  try {
    ({ movies, totalCount } = await getBrowseMovies(params));
  } catch (error) {
    console.error("Failed to load browse movies", error);
    loadFailed = true;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">CineMood</h1>
        <SortControl sort={params.sort} />
      </div>
      {loadFailed ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load the catalog right now. Try refreshing the page.
        </p>
      ) : (
        <>
          <PosterGrid movies={movies} />
          <Pagination
            page={params.page}
            sort={params.sort}
            totalPages={totalPages}
          />
        </>
      )}
    </main>
  );
}
