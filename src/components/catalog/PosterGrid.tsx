import type { BrowseMovie } from "@/types/movie";
import { PosterCard } from "./PosterCard";

export function PosterGrid({ movies }: { movies: BrowseMovie[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {movies.map((movie) => (
        <PosterCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
