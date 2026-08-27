import { z } from "zod";
import type { CalibrationPick } from "@/types/calibration";

/** How many popular films the calibration step shows at once (build-plan feature 10). */
export const CALIBRATION_POOL_SIZE = 8;

const calibrationPickSchema = z.object({
  movieId: z.number().int().positive(),
  liked: z.boolean(),
});

// Drops malformed entries instead of rejecting the whole array - stored jsonb
// that predates a shape tweak, or one bad entry, shouldn't blank out every
// other pick a friend already made.
export function parseCalibrationPicks(raw: unknown): CalibrationPick[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => calibrationPickSchema.safeParse(entry))
    .filter((result): result is { success: true; data: CalibrationPick } => result.success)
    .map((result) => result.data);
}

/** Replaces an existing pick for the same film, otherwise appends. */
export function upsertCalibrationPick(
  picks: CalibrationPick[],
  pick: CalibrationPick
): CalibrationPick[] {
  const index = picks.findIndex((existing) => existing.movieId === pick.movieId);
  if (index === -1) return [...picks, pick];

  const next = [...picks];
  next[index] = pick;
  return next;
}
