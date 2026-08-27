import { z } from "zod";
import type { SessionConstraints } from "@/types/session";

// Same 10 values as QuestionnaireForm.tsx/lib/friends/questionnaire.ts, kept
// as a local duplicate rather than a shared import - the friends feature
// already duplicates this same list between its own lib and component
// files, so this matches the existing convention instead of introducing a
// cross-feature dependency.
export const MOODS = [
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

export const RUNTIME_OVERRIDE_OPTIONS = ["none", "under2h", "under100"] as const;
export type RuntimeOverride = (typeof RUNTIME_OVERRIDE_OPTIONS)[number];

const RUNTIME_OVERRIDE_MINUTES: Record<RuntimeOverride, number | null> = {
  none: null,
  under2h: 120,
  under100: 100,
};

const toStringArray = (allowed: readonly string[]) =>
  z.preprocess((value) => {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    return values.filter((entry): entry is string => allowed.includes(String(entry)));
  }, z.array(z.string()));

const moodNoteSchema = z.preprocess((value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}, z.string().max(300, "Keep the note under 300 characters").nullable());

const runtimeOverrideSchema = z.preprocess(
  (value) => (RUNTIME_OVERRIDE_OPTIONS.includes(value as RuntimeOverride) ? value : "none"),
  z.enum(RUNTIME_OVERRIDE_OPTIONS)
);

const participantMoodSchema = z.object({
  participantId: z.string().uuid(),
  moodTags: toStringArray(MOODS),
  moodNote: moodNoteSchema,
  maxRuntime: runtimeOverrideSchema,
});

// Blank clears the field: an empty string or missing value becomes `null`
// rather than failing validation - "no kids tonight" is the common case.
const youngestViewerAgeSchema = z.preprocess((value) => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}, z.number().int().min(0, "Age can't be negative").max(17, "Use 18+ for no youngest-viewer limit").nullable());

const moodInputSchema = z.object({
  youngestViewerAge: youngestViewerAgeSchema,
  participants: z.array(participantMoodSchema),
});

export interface ParticipantMoodInput {
  participantId: string;
  moodTags: string[];
  moodNote: string | null;
  constraints: SessionConstraints;
}

export interface MoodInput {
  youngestViewerAge: number | null;
  participants: ParticipantMoodInput[];
}

export type ParseMoodInputResult =
  | { success: true; data: MoodInput }
  | { success: false; error: string };

export function parseMoodInput(raw: {
  youngestViewerAge: unknown;
  participants: Array<{
    participantId: unknown;
    moodTags: unknown;
    moodNote: unknown;
    maxRuntime: unknown;
  }>;
}): ParseMoodInputResult {
  const result = moodInputSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? "Invalid mood details",
    };
  }
  return {
    success: true,
    data: {
      youngestViewerAge: result.data.youngestViewerAge,
      participants: result.data.participants.map((participant) => ({
        participantId: participant.participantId,
        moodTags: participant.moodTags,
        moodNote: participant.moodNote,
        constraints: { maxRuntime: RUNTIME_OVERRIDE_MINUTES[participant.maxRuntime] },
      })),
    },
  };
}

/** Reads the per-participant fields the mood form indexes by participant id
 * (`mood-<id>`, `note-<id>`, `maxRuntime-<id>`), which Zod's plain object
 * parsing can't see on its own. */
export function readMoodFormData(formData: FormData, participantIds: string[]) {
  return {
    youngestViewerAge: formData.get("youngestViewerAge"),
    participants: participantIds.map((participantId) => ({
      participantId,
      moodTags: formData.getAll(`mood-${participantId}`),
      moodNote: formData.get(`note-${participantId}`),
      maxRuntime: formData.get(`maxRuntime-${participantId}`),
    })),
  };
}

/** Resolves a stored `constraints` jsonb value (possibly `{}` from the
 * column default, or missing entirely) to a well-typed `SessionConstraints`. */
export function toSessionConstraints(raw: unknown): SessionConstraints {
  const maxRuntime = (raw as { maxRuntime?: unknown } | null)?.maxRuntime;
  return { maxRuntime: typeof maxRuntime === "number" ? maxRuntime : null };
}
