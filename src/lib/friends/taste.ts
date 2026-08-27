import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionnaireAnswers } from "@/types/questionnaire";
import type { CalibrationPick } from "@/types/calibration";
import { fetchEmbeddings } from "@/lib/ingest/openai";

export interface GenreName {
  id: number;
  name: string;
}

const RECENCY_CLAUSE: Record<QuestionnaireAnswers["recency"], string | null> = {
  recent: "Prefers recent releases over older films.",
  classics: "Prefers classics over new releases.",
  "no-preference": null,
};

const RUNTIME_CLAUSE: Record<QuestionnaireAnswers["runtimeTolerance"], string> = {
  under100: "Prefers shorter films, under 100 minutes.",
  around2h: "Comfortable with films around two hours.",
  longOk: "Fine with long films.",
};

const CONTENT_CLAUSE: Record<QuestionnaireAnswers["contentTolerance"], string | null> = {
  light: "Prefers light content, nothing too intense.",
  heavy: "Fine with heavy or intense content.",
  "no-preference": null,
};

function genreNames(ids: number[], genres: GenreName[]): string[] {
  const byId = new Map(genres.map((genre) => [genre.id, genre.name]));
  return ids.map((id) => byId.get(id)).filter((name): name is string => !!name);
}

/** Synthesises a friend's questionnaire answers (feature 9) into one
 * embeddable natural-language paragraph. Skips any clause whose source field
 * is empty or a "no preference" default, mirroring buildEmbeddingDocument's
 * skip-empty-lines pattern in src/lib/ingest/embedding-document.ts. */
export function buildTasteParagraph(answers: QuestionnaireAnswers, genres: GenreName[]): string {
  const lines = [
    `Loved film: ${answers.lovedFilm}`,
    `Perfect movie night: ${answers.perfectNight}`,
    `Hard no: ${answers.hardNo}${answers.hardNoIsBlocking ? " (a strict dealbreaker)" : " (a soft preference)"}`,
  ];

  if (answers.moods.length > 0) {
    lines.push(`Tonight's mood tends toward: ${answers.moods.join(", ")}.`);
  }

  const recencyClause = RECENCY_CLAUSE[answers.recency];
  if (recencyClause) lines.push(recencyClause);

  const lovedGenres = genreNames(answers.lovedGenreIds, genres);
  if (lovedGenres.length > 0) lines.push(`Loves genres: ${lovedGenres.join(", ")}.`);

  const avoidedGenres = genreNames(answers.avoidGenreIds, genres);
  if (avoidedGenres.length > 0) lines.push(`Avoids genres: ${avoidedGenres.join(", ")}.`);

  lines.push(RUNTIME_CLAUSE[answers.runtimeTolerance]);
  lines.push(answers.subtitlesOk ? "Fine with subtitles." : "Prefers no subtitles.");

  const contentClause = CONTENT_CLAUSE[answers.contentTolerance];
  if (contentClause) lines.push(contentClause);

  return lines.join("\n");
}

interface CalibrationSignal {
  embedding: number[];
  liked: boolean;
}

// Calibration nudges the paragraph embedding rather than dominating it - the
// paragraph is deliberate, typed signal, while calibration is a handful of
// taps. No product-specified split in project-overview.md; retune once
// feature 14/15 shows how much calibration should move the ranking.
const BASE_WEIGHT = 0.7;
const CALIBRATION_WEIGHT = 0.3;

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function normalize(vector: number[]): number[] {
  const length = magnitude(vector);
  return length === 0 ? vector : vector.map((value) => value / length);
}

/** Blends the taste paragraph's embedding with the friend's poster
 * calibration picks (feature 10). Liked picks pull the vector toward
 * themselves, disliked picks push it away; with no picks, `base` is returned
 * unchanged. Result is L2-normalized whenever picks are applied, so
 * magnitude stays comparable across friends regardless of pick count. */
export function blendTasteEmbedding(base: number[], picks: CalibrationSignal[]): number[] {
  if (picks.length === 0) return base;

  const delta = new Array(base.length).fill(0);
  for (const pick of picks) {
    const sign = pick.liked ? 1 : -1;
    for (let i = 0; i < base.length; i++) {
      delta[i] += (sign * pick.embedding[i]) / picks.length;
    }
  }

  const blended = base.map((value, i) => BASE_WEIGHT * value + CALIBRATION_WEIGHT * delta[i]);
  return normalize(blended);
}

/** PostgREST returns a pgvector column as its text form, e.g.
 * "[-0.07,0.04,...]", not a parsed JSON array - confirmed against the live
 * dev database while building this feature. Accepts an already-parsed array
 * too, in case that ever changes. */
export function parseEmbeddingVector(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    return raw
      .slice(1, -1)
      .split(",")
      .map(Number);
  }
  throw new Error(`Unexpected embedding format: ${typeof raw}`);
}

/** Embeddings for the movies a friend calibrated on, keyed by movie id.
 * Films without an embedding (shouldn't happen for the popular-films
 * calibration pool, but the column is nullable) are simply absent from the
 * map. */
export async function getMovieEmbeddings(
  client: SupabaseClient,
  movieIds: number[]
): Promise<Map<number, number[]>> {
  if (movieIds.length === 0) return new Map();

  const { data, error } = await client
    .from("movies")
    .select("id, embedding")
    .in("id", movieIds)
    .not("embedding", "is", null)
    .returns<{ id: number; embedding: unknown }[]>();

  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, parseEmbeddingVector(row.embedding)]));
}

/** Builds and embeds a friend's taste paragraph, then blends in their
 * calibration picks. The one place feature 11's synthesis steps compose -
 * src/actions/friends.ts calls this and persists the result, it doesn't
 * reimplement any of it. */
export async function computeTasteEmbedding(
  client: SupabaseClient,
  apiKey: string,
  answers: QuestionnaireAnswers,
  calibrationPicks: CalibrationPick[],
  genres: GenreName[]
): Promise<{ tasteText: string; tasteEmbedding: number[] }> {
  const tasteText = buildTasteParagraph(answers, genres);
  const [baseEmbedding] = await fetchEmbeddings([tasteText], apiKey);

  const embeddingsById = await getMovieEmbeddings(
    client,
    calibrationPicks.map((pick) => pick.movieId)
  );

  const signals = calibrationPicks
    .map((pick) => ({ embedding: embeddingsById.get(pick.movieId), liked: pick.liked }))
    .filter((signal): signal is CalibrationSignal => !!signal.embedding);

  return { tasteText, tasteEmbedding: blendTasteEmbedding(baseEmbedding, signals) };
}
