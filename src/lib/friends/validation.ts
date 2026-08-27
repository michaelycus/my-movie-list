import { z } from "zod";

// FormData.get() returns string | null for a missing field; normalize null
// to "" up front so a missing field fails validation the same way an empty
// one does, instead of a raw Zod type-mismatch message.
const stringOrEmpty = z.preprocess((value) => value ?? "", z.string());

const friendInputSchema = z.object({
  displayName: stringOrEmpty.pipe(
    z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters")
  ),
  // Free-text, not a validated emoji grapheme - loosely bounded so a couple
  // of emoji (which can be multi-codepoint) still fit. Empty means no avatar.
  avatarEmoji: stringOrEmpty.pipe(
    z
      .string()
      .trim()
      .max(8, "Use a single emoji")
      .transform((value) => (value ? value : null))
  ),
});

export type FriendInput = z.infer<typeof friendInputSchema>;

export type ParseFriendInputResult =
  | { success: true; data: FriendInput }
  | { success: false; error: string };

export function parseFriendInput(raw: {
  displayName: unknown;
  avatarEmoji: unknown;
}): ParseFriendInputResult {
  const result = friendInputSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues[0]?.message ?? "Invalid friend details",
    };
  }
  return { success: true, data: result.data };
}
