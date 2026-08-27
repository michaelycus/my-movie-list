"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { saveCalibrationPick } from "@/actions/friends";
import type { BrowseMovie } from "@/types/movie";
import type { CalibrationPick } from "@/types/calibration";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

type Liked = boolean | null;

function picksToMap(picks: CalibrationPick[]): Record<number, Liked> {
  return Object.fromEntries(picks.map((pick) => [pick.movieId, pick.liked]));
}

const buttonBase =
  "flex-1 rounded-full border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

function PickButton({
  active,
  activeClass,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${buttonBase} ${
        active ? activeClass : "border-border text-muted-foreground hover:border-neon-cyan"
      }`}
    >
      {children}
    </button>
  );
}

export function PosterCalibration({
  friendId,
  movies,
  initialPicks,
}: {
  friendId: string;
  movies: BrowseMovie[];
  initialPicks: CalibrationPick[];
}) {
  const [picks, setPicks] = useState<Record<number, Liked>>(() => picksToMap(initialPicks));
  const [pendingMovieId, setPendingMovieId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function tap(movieId: number, liked: boolean) {
    const previous = picks[movieId] ?? null;
    setError(null);
    setPendingMovieId(movieId);
    setPicks((current) => ({ ...current, [movieId]: liked }));

    startTransition(async () => {
      const result = await saveCalibrationPick(friendId, movieId, liked);
      setPendingMovieId(null);
      if (!result.success) {
        setPicks((current) => ({ ...current, [movieId]: previous }));
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">Quick taste check</h2>
        <p className="text-sm text-foreground">
          Tap through these popular films - no typing needed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {movies.map((movie) => {
          const liked = picks[movie.id] ?? null;
          const pending = pendingMovieId === movie.id;

          return (
            <div key={movie.id} className="flex flex-col gap-2">
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-2">
                {movie.posterPath ? (
                  <Image
                    src={`${POSTER_BASE_URL}${movie.posterPath}`}
                    alt={movie.title}
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 20vw, 45vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                    {movie.title}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5">
                <PickButton
                  active={liked === true}
                  activeClass="border-neon-lime bg-neon-lime/10 text-neon-lime"
                  disabled={pending}
                  onClick={() => tap(movie.id, true)}
                >
                  Loved it
                </PickButton>
                <PickButton
                  active={liked === false}
                  activeClass="border-neon-amber bg-neon-amber/10 text-neon-amber"
                  disabled={pending}
                  onClick={() => tap(movie.id, false)}
                >
                  Not for me
                </PickButton>
              </div>
            </div>
          );
        })}
      </div>

      {error && <span className="text-sm text-neon-amber">{error}</span>}
    </div>
  );
}
