import { describe, expect, it } from "vitest";
import { parseMoodInput } from "./mood";

const participantId1 = "90d499ff-7ad7-48e4-b61a-f8876547450d";
const participantId2 = "fd4c3cdc-e3e5-4f9a-8006-687b7f77df1b";

describe("parseMoodInput", () => {
  it("accepts a valid full submission", () => {
    const result = parseMoodInput({
      youngestViewerAge: "9",
      participants: [
        { participantId: participantId1, moodTags: ["fun", "action"], moodNote: "keep it light", maxRuntime: "under2h" },
      ],
    });
    expect(result).toEqual({
      success: true,
      data: {
        youngestViewerAge: 9,
        participants: [
          {
            participantId: participantId1,
            moodTags: ["fun", "action"],
            moodNote: "keep it light",
            constraints: { maxRuntime: 120 },
          },
        ],
      },
    });
  });

  it("drops an unknown mood tag", () => {
    const result = parseMoodInput({
      youngestViewerAge: null,
      participants: [
        { participantId: participantId1, moodTags: ["fun", "not-a-real-mood"], moodNote: null, maxRuntime: "none" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.participants[0].moodTags).toEqual(["fun"]);
    }
  });

  it("rejects a note over 300 characters", () => {
    const result = parseMoodInput({
      youngestViewerAge: null,
      participants: [
        { participantId: participantId1, moodTags: [], moodNote: "x".repeat(301), maxRuntime: "none" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["none", null],
    ["under2h", 120],
    ["under100", 100],
  ] as const)("resolves runtime override %s to %s minutes", (option, minutes) => {
    const result = parseMoodInput({
      youngestViewerAge: null,
      participants: [{ participantId: participantId1, moodTags: [], moodNote: null, maxRuntime: option }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.participants[0].constraints).toEqual({ maxRuntime: minutes });
    }
  });

  it("rejects a negative youngest-viewer age", () => {
    const result = parseMoodInput({ youngestViewerAge: "-1", participants: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a youngest-viewer age over 17", () => {
    const result = parseMoodInput({ youngestViewerAge: "18", participants: [] });
    expect(result.success).toBe(false);
  });

  it("resolves a blank youngest-viewer age to null", () => {
    const result = parseMoodInput({ youngestViewerAge: "", participants: [] });
    expect(result).toEqual({ success: true, data: { youngestViewerAge: null, participants: [] } });
  });

  it("handles multiple participants independently", () => {
    const result = parseMoodInput({
      youngestViewerAge: null,
      participants: [
        { participantId: participantId1, moodTags: ["dark"], moodNote: null, maxRuntime: "none" },
        { participantId: participantId2, moodTags: ["feel-good"], moodNote: null, maxRuntime: "under100" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.participants).toHaveLength(2);
      expect(result.data.participants[1].constraints).toEqual({ maxRuntime: 100 });
    }
  });
});
