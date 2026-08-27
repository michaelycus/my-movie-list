import { z } from "zod";
import type { HardFilters, QuestionnaireAnswers } from "@/types/questionnaire";

const MOODS = [
  "fun",
  "serious",
  "inspiring",
  "scary",
  "action",
  "romantic",
  "mind-bending",
  "feel-good",
  "dark",
  "weird",
] as const;

const requiredText = z.preprocess(
  (value) => value ?? "",
  z.string().trim().min(1, "This answer is required").max(500, "Keep it under 500 characters")
);

const toBool = (value: unknown) => value === "true" || value === "on";

const toIdArray = z.preprocess((value) => {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .map((entry) => Number(entry))
    .filter((id) => Number.isInteger(id) && id > 0);
}, z.array(z.number().int().positive()));

const toStringArray = (allowed: readonly string[]) =>
  z.preprocess((value) => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    return values.filter((entry): entry is string => allowed.includes(String(entry)));
  }, z.array(z.string()));

const questionnaireSchema = z.object({
  lovedFilm: requiredText,
  perfectNight: requiredText,
  hardNo: requiredText,
  hardNoIsBlocking: z.preprocess(toBool, z.boolean()),
  moods: toStringArray(MOODS),
  // No "no preference" option for recency/runtime tolerance in project-plan.md
  // §9 - default to the middle, least-restrictive choice when left unanswered.
  recency: z.preprocess(
    (value) => value ?? "no-preference",
    z.enum(["recent", "no-preference", "classics"])
  ),
  lovedGenreIds: toIdArray,
  avoidGenreIds: toIdArray,
  runtimeTolerance: z.preprocess(
    (value) => value ?? "around2h",
    z.enum(["under100", "around2h", "longOk"])
  ),
  subtitlesOk: z.preprocess((value) => (value == null ? true : toBool(value)), z.boolean()),
  contentTolerance: z.preprocess(
    (value) => value ?? "no-preference",
    z.enum(["light", "no-preference", "heavy"])
  ),
});

export type ParseQuestionnaireInputResult =
  | { success: true; data: QuestionnaireAnswers }
  | { success: false; error: string };

export function parseQuestionnaireInput(raw: unknown): ParseQuestionnaireInputResult {
  const result = questionnaireSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? "Invalid questionnaire answers",
    };
  }
  return { success: true, data: result.data as QuestionnaireAnswers };
}

/** Reads the multi-value FormData fields Zod's plain object parsing can't see. */
export function readQuestionnaireFormData(formData: FormData) {
  return {
    lovedFilm: formData.get("lovedFilm"),
    perfectNight: formData.get("perfectNight"),
    hardNo: formData.get("hardNo"),
    hardNoIsBlocking: formData.get("hardNoIsBlocking"),
    moods: formData.getAll("moods"),
    recency: formData.get("recency"),
    lovedGenreIds: formData.getAll("lovedGenreIds"),
    avoidGenreIds: formData.getAll("avoidGenreIds"),
    runtimeTolerance: formData.get("runtimeTolerance"),
    subtitlesOk: formData.get("subtitlesOk"),
    contentTolerance: formData.get("contentTolerance"),
  };
}

const RUNTIME_CAP_MINUTES: Record<QuestionnaireAnswers["runtimeTolerance"], number | null> = {
  under100: 100,
  around2h: 150,
  longOk: null,
};

const AGE_CEILING: Record<QuestionnaireAnswers["contentTolerance"], number | null> = {
  light: 12,
  "no-preference": null,
  heavy: null,
};

/** Maps the structured answers a friend can state directly to hard filters -
 * no LLM step. Q3's free-text hard-no is intentionally not mapped here; see
 * current-feature.md's Out of scope section. */
export function deriveHardFilters(answers: QuestionnaireAnswers): HardFilters {
  return {
    maxRuntime: RUNTIME_CAP_MINUTES[answers.runtimeTolerance],
    minAgeCeiling: AGE_CEILING[answers.contentTolerance],
    blockedGenres: answers.avoidGenreIds,
    subtitlesOk: answers.subtitlesOk,
  };
}
