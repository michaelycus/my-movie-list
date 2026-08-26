import { join } from "node:path";
import { createAdminClient } from "../src/lib/supabase/admin";
import { normalizeCatalog } from "../src/lib/ingest/catalog";
import { getCheckpoint, setCheckpoint } from "../src/lib/ingest/checkpoint";
import { runWithConcurrency } from "../src/lib/ingest/concurrency";
import { fetchFilmEnrichment } from "../src/lib/ingest/tmdb";
import { upsertCastAndCrew, upsertFilms, upsertGenres } from "../src/lib/ingest/upsert";
import type { EnrichedFilm, NormalizedCredits, NormalizedFilm } from "../src/lib/ingest/types";

const CHECKPOINT_SOURCE = "tmdb_ingest";
const BATCH_SIZE = 100;
const TMDB_CONCURRENCY = 5;

function parseLimit(argv: string[]): number | undefined {
  const arg = argv.find((a) => a.startsWith("--limit="));
  return arg ? Number(arg.slice("--limit=".length)) : undefined;
}

async function enrichFilm(film: NormalizedFilm, apiKey: string): Promise<EnrichedFilm> {
  try {
    const enrichment = await fetchFilmEnrichment(film.id, apiKey);
    return { ...film, ...enrichment };
  } catch (err) {
    console.warn(`TMDB enrichment failed for film ${film.id} (${film.title}):`, err);
    return { ...film, posterPath: null, backdropPath: null, minAge: null };
  }
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("Missing TMDB_API_KEY");

  const admin = createAdminClient();
  const moviesCsvPath = join(process.cwd(), "references/tmdb_5000_movies.csv");
  const creditsCsvPath = join(process.cwd(), "references/tmdb_5000_credits.csv");

  console.log("Reading and normalizing the catalog...");
  const { films, credits, genres } = await normalizeCatalog(moviesCsvPath, creditsCsvPath);
  const creditsByMovieId = new Map(credits.map((c) => [c.movieId, c]));

  // Resume depends on a deterministic order - CSV row order is not sorted by id.
  const sortedFilms = films.slice().sort((a, b) => a.id - b.id);

  console.log(`Upserting ${genres.length} genres...`);
  await upsertGenres(admin, genres);

  const checkpoint = await getCheckpoint(admin, CHECKPOINT_SOURCE);
  let remaining = sortedFilms.filter((f) => checkpoint === null || f.id > checkpoint);
  if (limit !== undefined) remaining = remaining.slice(0, limit);

  console.log(
    `Resuming after id ${checkpoint ?? "none"} - ${remaining.length} film(s) to process.`
  );

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch of ${batch.length} (ids ${batch[0].id}-${batch[batch.length - 1].id})...`);

    const enriched = await runWithConcurrency(
      batch.map((film) => () => enrichFilm(film, apiKey)),
      TMDB_CONCURRENCY
    );

    const batchCredits: NormalizedCredits[] = batch.map(
      (f) => creditsByMovieId.get(f.id) ?? { movieId: f.id, cast: [], crew: [] }
    );

    await upsertFilms(admin, enriched);
    await upsertCastAndCrew(admin, batchCredits);
    await setCheckpoint(admin, CHECKPOINT_SOURCE, batch[batch.length - 1].id);

    console.log(`Checkpoint advanced to id ${batch[batch.length - 1].id}.`);
  }

  console.log(`Done. Processed ${remaining.length} film(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
