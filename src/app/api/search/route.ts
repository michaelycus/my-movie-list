import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getGenres } from "@/lib/movies/browse";
import { parseSearchQuery } from "@/lib/search/parse";
import { searchMovies, type RankedMovie } from "@/lib/search/retrieve";
import type { SearchResultMovie } from "@/types/movie";

const querySchema = z.string().trim().min(1).max(200);

function toSearchResultMovie(row: RankedMovie): SearchResultMovie {
  return {
    id: row.id,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    voteAverage: row.vote_average,
    weightedRating: row.weighted_rating,
    popularity: row.popularity,
    matchedVia: row.matchedVia,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = querySchema.safeParse(searchParams.get("q"));

  if (!result.success) {
    return Response.json(
      { error: "q is required and must be 1-200 characters" },
      { status: 400 }
    );
  }

  const q = result.data;

  try {
    const [client, genres] = await Promise.all([createClient(), getGenres()]);

    // A missing/invalid OPENROUTER_API_KEY or OPENAI_API_KEY doesn't throw
    // here - parseSearchQuery and searchMovies both degrade gracefully
    // (raw-text search, lexical-only results) rather than failing the
    // request, so no extra handling is needed for that case.
    const parsed = await parseSearchQuery(q, genres, process.env.OPENROUTER_API_KEY!);
    const results = await searchMovies(client, process.env.OPENAI_API_KEY!, parsed);

    return Response.json({
      query: q,
      semanticQuery: parsed.semanticQuery,
      results: results.map(toSearchResultMovie),
    });
  } catch (error) {
    console.error("GET /api/search failed", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
