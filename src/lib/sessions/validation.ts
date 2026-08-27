import { z } from "zod";

const stringOrEmpty = z.preprocess((value) => value ?? "", z.string());

const sessionInputSchema = z.object({
  title: stringOrEmpty.pipe(
    z.string().trim().min(1, "Give the session a title").max(60, "Keep the title under 60 characters")
  ),
  friendIds: z
    .array(z.string().uuid())
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.length > 0, "Pick at least one friend"),
});

export type SessionInput = z.infer<typeof sessionInputSchema>;

export type ParseSessionInputResult =
  | { success: true; data: SessionInput }
  | { success: false; error: string };

export function parseSessionInput(raw: { title: unknown; friendIds: unknown[] }): ParseSessionInputResult {
  const result = sessionInputSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? "Invalid session details",
    };
  }
  return { success: true, data: result.data };
}

/** Reads the multi-value `friendIds` field FormData's plain object parsing can't see. */
export function readSessionFormData(formData: FormData) {
  return {
    title: formData.get("title"),
    friendIds: formData.getAll("friendIds"),
  };
}
