import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getGenres } from "@/lib/movies/browse";
import { parseSearchQuery } from "@/lib/search/parse";
import { searchMovies, type RankedMovie } from "@/lib/search/retrieve";
import type { SearchResultMovie } from "@/types/movie";
import { logUsageEvent } from "@/lib/usage/events";

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

    // getClaims(), not getUser(): same cached-JWKS pattern every other route
    // uses. Search stays open to anonymous visitors either way - this is
    // only for the usage_events user_id, which the events feature (19b)
    // needs to tell "authenticated" search volume apart from anonymous.
    const { data: claims } = await client.auth.getClaims();
    const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

    // A missing/invalid OPENROUTER_API_KEY or OPENAI_API_KEY doesn't throw
    // here - parseSearchQuery and searchMovies both degrade gracefully
    // (raw-text search, lexical-only results) rather than failing the
    // request, so no extra handling is needed for that case.
    const parsed = await parseSearchQuery(q, genres, process.env.OPENROUTER_API_KEY!);
    // Logged unconditionally once parseSearchQuery resolves - it swallows
    // its own errors and degrades to a raw-text fallback with no signal back
    // to the caller either way, so this counts attempted calls, not
    // confirmed-successful ones (see current-feature.md's Out of scope).
    await logUsageEvent(client, "llm_call", userId, { context: "search_parse" });

    const results = await searchMovies(client, process.env.OPENAI_API_KEY!, parsed);
    await logUsageEvent(client, "search", userId, { resultCount: results.length });

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
