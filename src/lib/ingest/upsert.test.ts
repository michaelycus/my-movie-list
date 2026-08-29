import { describe, expect, it, vi } from "vitest";
import { toMovieRow, upsertCastAndCrew, upsertFilms, upsertGenres } from "./upsert";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichedFilm, NormalizedCredits } from "./types";

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function mockAdmin() {
  const calls: RecordedCall[] = [];

  function tableApi(table: string) {
    return {
      upsert: vi.fn((rows: unknown, opts: unknown) => {
        calls.push({ table, method: "upsert", args: [rows, opts] });
        return Promise.resolve({ error: null });
      }),
      insert: vi.fn((rows: unknown) => {
        calls.push({ table, method: "insert", args: [rows] });
        return Promise.resolve({ error: null });
      }),
      delete: vi.fn(() => ({
        in: vi.fn((column: string, ids: unknown) => {
          calls.push({ table, method: "delete.in", args: [column, ids] });
          return Promise.resolve({ error: null });
        }),
      })),
    };
  }

  const from = vi.fn((table: string) => tableApi(table));
  return { admin: { from } as unknown as SupabaseClient, calls };
}

const film: EnrichedFilm = {
  id: 19995,
  title: "Avatar",
  overview: "A marine on an alien planet.",
  tagline: "Enter the World",
  releaseDate: "2009-12-10",
  runtime: 162,
  originalLanguage: "en",
  voteAverage: 7.2,
  voteCount: 11800,
  popularity: 150.4,
  weightedRating: 7.1,
  genreIds: [28, 12],
  keywords: ["culture clash", "future"],
  posterPath: "/p.jpg",
  backdropPath: "/b.jpg",
  minAge: 10,
};

describe("toMovieRow", () => {
  it("maps camelCase fields to the snake_case movies columns", () => {
    expect(toMovieRow(film)).toEqual({
      id: 19995,
      title: "Avatar",
      overview: "A marine on an alien planet.",
      tagline: "Enter the World",
      release_date: "2009-12-10",
      runtime: 162,
      original_language: "en",
      poster_path: "/p.jpg",
      backdrop_path: "/b.jpg",
      vote_average: 7.2,
      vote_count: 11800,
      popularity: 150.4,
      weighted_rating: 7.1,
      min_age: 10,
      genre_ids: [28, 12],
      keywords: ["culture clash", "future"],
    });
  });
});

describe("upsertGenres", () => {
  it("upserts on id", async () => {
    const { admin, calls } = mockAdmin();
    await upsertGenres(admin, [{ id: 28, name: "Action" }]);

    expect(calls).toEqual([
      { table: "genres", method: "upsert", args: [[{ id: 28, name: "Action" }], { onConflict: "id" }] },
    ]);
  });

  it("does nothing for an empty list", async () => {
    const { admin, calls } = mockAdmin();
    await upsertGenres(admin, []);
    expect(calls).toEqual([]);
  });
});

describe("upsertFilms", () => {
  it("upserts mapped rows on id", async () => {
    const { admin, calls } = mockAdmin();
    await upsertFilms(admin, [film]);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("movies");
    expect(calls[0].method).toBe("upsert");
    expect(calls[0].args[1]).toEqual({ onConflict: "id" });
    expect((calls[0].args[0] as unknown[])[0]).toMatchObject({ id: 19995 });
  });
});

describe("upsertCastAndCrew", () => {
  const credits: NormalizedCredits[] = [
    {
      movieId: 19995,
      cast: [{ personName: "Sam Worthington", characterName: "Jake Sully", billingOrder: 0 }],
      crew: [{ personName: "James Cameron", job: "Director" }],
    },
  ];

  it("deletes existing rows for the batch before inserting", async () => {
    const { admin, calls } = mockAdmin();
    await upsertCastAndCrew(admin, credits);

    const castDeleteIndex = calls.findIndex((c) => c.table === "movie_cast" && c.method === "delete.in");
    const castInsertIndex = calls.findIndex((c) => c.table === "movie_cast" && c.method === "insert");
    const crewDeleteIndex = calls.findIndex((c) => c.table === "movie_crew" && c.method === "delete.in");
    const crewInsertIndex = calls.findIndex((c) => c.table === "movie_crew" && c.method === "insert");

    expect(castDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(castInsertIndex).toBeGreaterThan(castDeleteIndex);
    expect(crewDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(crewInsertIndex).toBeGreaterThan(crewDeleteIndex);

    expect(calls[castDeleteIndex].args).toEqual(["movie_id", [19995]]);
    expect(calls[castInsertIndex].args[0]).toEqual([
      { movie_id: 19995, person_name: "Sam Worthington", character_name: "Jake Sully", billing_order: 0 },
    ]);
    expect(calls[crewInsertIndex].args[0]).toEqual([
      { movie_id: 19995, person_name: "James Cameron", job: "Director" },
    ]);
  });

  it("still deletes but skips inserts for a film with empty cast/crew", async () => {
    const { admin, calls } = mockAdmin();
    await upsertCastAndCrew(admin, [{ movieId: 1, cast: [], crew: [] }]);

    expect(calls.some((c) => c.table === "movie_cast" && c.method === "delete.in")).toBe(true);
    expect(calls.some((c) => c.table === "movie_cast" && c.method === "insert")).toBe(false);
    expect(calls.some((c) => c.table === "movie_crew" && c.method === "insert")).toBe(false);
  });

  it("does nothing for an empty batch", async () => {
    const { admin, calls } = mockAdmin();
    await upsertCastAndCrew(admin, []);
    expect(calls).toEqual([]);
  });
});
