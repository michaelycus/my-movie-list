import { createAdminClient } from "../src/lib/supabase/admin";
import { buildEmbeddingDocument, groupCreditsByMovie } from "../src/lib/ingest/embedding-document";
import {
  fetchCreditsForMovies,
  fetchMoviesNeedingEmbeddings,
  updateEmbeddings,
} from "../src/lib/ingest/embedding-upsert";
import { fetchEmbeddings } from "../src/lib/ingest/openai";
import type { EmbeddedMovieRow } from "../src/lib/ingest/embedding-upsert";

const BATCH_SIZE = 100;

function parseLimit(argv: string[]): number | undefined {
  const arg = argv.find((a) => a.startsWith("--limit="));
  return arg ? Number(arg.slice("--limit=".length)) : undefined;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const admin = createAdminClient();
  let totalProcessed = 0;

  for (;;) {
    if (limit !== undefined && totalProcessed >= limit) break;
    const batchSize = limit !== undefined ? Math.min(BATCH_SIZE, limit - totalProcessed) : BATCH_SIZE;

    const movies = await fetchMoviesNeedingEmbeddings(admin, batchSize);
    if (movies.length === 0) break;

    console.log(
      `Embedding batch of ${movies.length} (ids ${movies[0].id}-${movies[movies.length - 1].id})...`
    );

    const { castRows, crewRows } = await fetchCreditsForMovies(admin, movies.map((m) => m.id));
    const creditsByMovie = groupCreditsByMovie(castRows, crewRows);

    const documents = movies.map((movie) =>
      buildEmbeddingDocument(movie, creditsByMovie.get(movie.id) ?? { cast: [], directors: [] })
    );

    const embeddings = await fetchEmbeddings(documents, apiKey);

    const rows: EmbeddedMovieRow[] = movies.map((movie, i) => ({
      id: movie.id,
      embedding: embeddings[i],
      embeddingText: documents[i],
    }));
    await updateEmbeddings(admin, rows);

    totalProcessed += movies.length;
    console.log(`Embedded ${totalProcessed} film(s) so far.`);
  }

  console.log(`Done. Embedded ${totalProcessed} film(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
