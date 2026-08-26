import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCatalog } from "./catalog";

const REAL_MOVIES_CSV = join(process.cwd(), "references/tmdb_5000_movies.csv");
const REAL_CREDITS_CSV = join(process.cwd(), "references/tmdb_5000_credits.csv");

describe("normalizeCatalog", () => {
  it("joins, normalizes, and filters the real TMDB catalog", async () => {
    const { films, credits, genres } = await normalizeCatalog(
      REAL_MOVIES_CSV,
      REAL_CREDITS_CSV
    );

    // Only the 4795 Released films (5 Rumored + 3 Post Production dropped).
    expect(films).toHaveLength(4795);
    expect(credits).toHaveLength(4795);

    const avatar = films.find((f) => f.id === 19995);
    expect(avatar?.title).toBe("Avatar");

    const avatarCredits = credits.find((c) => c.movieId === 19995);
    expect(avatarCredits?.crew.map((c) => c.personName)).toContain("James Cameron");
    expect(avatarCredits?.cast.slice(0, 3).map((c) => c.personName)).toContain(
      "Sam Worthington"
    );

    // No film should throw on empty cast/crew - every film has an entry.
    expect(credits).toHaveLength(films.length);

    expect(genres.length).toBeGreaterThan(0);
    const genreIds = genres.map((g) => g.id);
    expect(new Set(genreIds).size).toBe(genreIds.length); // deduplicated
  });

  it("computes a weighted rating within a plausible range for every film", async () => {
    const { films } = await normalizeCatalog(REAL_MOVIES_CSV, REAL_CREDITS_CSV);
    for (const film of films) {
      expect(film.weightedRating).toBeGreaterThanOrEqual(0);
      expect(film.weightedRating).toBeLessThanOrEqual(10);
    }
  });
});
