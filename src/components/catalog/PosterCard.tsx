import Image from "next/image";
import Link from "next/link";
import type { BrowseMovie } from "@/types/movie";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

function releaseYear(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

export function PosterCard({
  movie,
  badge,
  footer,
}: {
  movie: BrowseMovie;
  badge?: { label: string };
  footer?: React.ReactNode;
}) {
  const year = releaseYear(movie.releaseDate);
  const rating = movie.weightedRating;

  return (
    <article className="flex flex-col gap-2">
      <Link href={`/films/${movie.id}`} className="group contents">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2 outline-1 -outline-offset-1 outline-transparent transition-[transform,outline-color,box-shadow] duration-200 ease-out-strong group-hover:scale-[1.03] group-hover:outline-neon-cyan/60 group-hover:shadow-[0_8px_24px_-8px_rgba(34,230,255,0.35)] group-active:scale-[0.98]">
          {movie.posterPath ? (
            <Image
              src={`${POSTER_BASE_URL}${movie.posterPath}`}
              alt={movie.title}
              fill
              unoptimized
              sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 45vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
              {movie.title}
            </div>
          )}
          {rating !== null && (
            <span className="absolute top-1.5 right-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-xs font-medium text-neon-lime">
              {rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="truncate text-sm font-medium text-foreground transition-colors duration-200 group-hover:text-neon-cyan">
            {movie.title}
          </span>
          {year && (
            <span className="text-xs text-muted-foreground">{year}</span>
          )}
          {badge && (
            <span className="mt-1 w-fit rounded-full border border-neon-cyan px-2 py-0.5 text-[10px] text-neon-cyan">
              {badge.label}
            </span>
          )}
        </div>
      </Link>
      {footer}
    </article>
  );
}
