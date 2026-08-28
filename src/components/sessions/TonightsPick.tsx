import Image from "next/image";
import Link from "next/link";
import type { MovieDetail } from "@/types/movie";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

/** The persisted counterpart to GroupPickRationale + RecommendationsPanel -
 * shown once a session has a saved chosenMovieId/rationale, so revisiting the
 * session doesn't re-run recommendations for a decision already made. */
export function TonightsPick({ movie, rationale }: { movie: MovieDetail; rationale: string | null }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neon-cyan/30 bg-surface p-4 sm:flex-row">
      <Link href={`/films/${movie.id}`} className="shrink-0">
        <div className="relative aspect-[2/3] w-32 overflow-hidden rounded-lg bg-surface-2">
          {movie.posterPath ? (
            <Image
              src={`${POSTER_BASE_URL}${movie.posterPath}`}
              alt={movie.title}
              fill
              unoptimized
              sizes="128px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
              {movie.title}
            </div>
          )}
        </div>
      </Link>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Tonight&apos;s pick</h2>
        <Link href={`/films/${movie.id}`} className="text-lg font-semibold text-foreground hover:text-neon-cyan">
          {movie.title}
        </Link>
        {rationale && <p className="text-sm text-muted-foreground">{rationale}</p>}
      </div>
    </section>
  );
}
