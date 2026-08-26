import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatAgeCertification, formatRuntime, getMovieDetail, parseMovieId } from "@/lib/movies/detail";
import type { MovieDetail } from "@/types/movie";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

function releaseYear(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

export default async function FilmDetailPage({ params }: PageProps<"/films/[id]">) {
  const { id: rawId } = await params;
  const id = parseMovieId(rawId);
  if (id === null) notFound();

  let movie: MovieDetail | null;
  try {
    movie = await getMovieDetail(id);
  } catch (error) {
    console.error("Failed to load film detail", error);
    return (
      <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load this film right now. Try refreshing the page.
        </p>
      </main>
    );
  }

  if (!movie) notFound();

  const year = releaseYear(movie.releaseDate);
  const runtimeText = formatRuntime(movie.runtime);
  const ageCertification = formatAgeCertification(movie.minAge);

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Link
        href="/"
        className="w-fit text-sm text-neon-cyan hover:underline"
      >
        ← Back to catalog
      </Link>

      {movie.backdropPath && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-2">
          <Image
            src={`${IMAGE_BASE_URL}/w1280${movie.backdropPath}`}
            alt=""
            fill
            unoptimized
            sizes="100vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative aspect-2/3 w-40 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-56">
          {movie.posterPath ? (
            <Image
              src={`${IMAGE_BASE_URL}/w342${movie.posterPath}`}
              alt={movie.title}
              fill
              unoptimized
              sizes="(min-width: 640px) 224px, 160px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
              {movie.title}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {movie.title}
            </h1>
            {movie.tagline && (
              <p className="text-muted-foreground italic">{movie.tagline}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {year && <span>{year}</span>}
            {runtimeText && <span>{runtimeText}</span>}
            <span>{ageCertification}</span>
            {movie.weightedRating !== null && (
              <span className="font-medium text-neon-lime">
                {movie.weightedRating.toFixed(1)}
              </span>
            )}
          </div>

          {movie.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {movie.genres.map((genre) => (
                <span
                  key={genre.id}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground"
                >
                  {genre.name}
                </span>
              ))}
            </div>
          )}

          {movie.overview && (
            <p className="max-w-2xl text-foreground">{movie.overview}</p>
          )}

          {movie.director && (
            <p className="text-sm">
              <span className="text-muted-foreground">Director: </span>
              {movie.director}
            </p>
          )}

          {movie.cast.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">
                Cast
              </h2>
              <p className="text-sm text-foreground">
                {movie.cast
                  .map((member) =>
                    member.character
                      ? `${member.name} as ${member.character}`
                      : member.name
                  )
                  .join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
