import { describe, expect, it } from "vitest";
import { parseSessionInput } from "./validation";

const friendId1 = "90d499ff-7ad7-48e4-b61a-f8876547450d";
const friendId2 = "fd4c3cdc-e3e5-4f9a-8006-687b7f77df1b";

describe("parseSessionInput", () => {
  it("accepts a valid submission", () => {
    const result = parseSessionInput({ title: "Friday night", friendIds: [friendId1, friendId2] });
    expect(result).toEqual({
      success: true,
      data: { title: "Friday night", friendIds: [friendId1, friendId2] },
    });
  });

  it("trims the title", () => {
    const result = parseSessionInput({ title: "  Friday night  ", friendIds: [friendId1] });
    expect(result).toEqual({ success: true, data: { title: "Friday night", friendIds: [friendId1] } });
  });

  it("rejects an empty title", () => {
    const result = parseSessionInput({ title: "", friendIds: [friendId1] });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    const result = parseSessionInput({ title: "   ", friendIds: [friendId1] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty friendIds array", () => {
    const result = parseSessionInput({ title: "Friday night", friendIds: [] });
    expect(result.success).toBe(false);
  });

  it("collapses duplicate friendIds to one", () => {
    const result = parseSessionInput({ title: "Friday night", friendIds: [friendId1, friendId1, friendId2] });
    expect(result).toEqual({
      success: true,
      data: { title: "Friday night", friendIds: [friendId1, friendId2] },
    });
  });

  it("rejects a title over 60 characters", () => {
    const result = parseSessionInput({ title: "x".repeat(61), friendIds: [friendId1] });
    expect(result.success).toBe(false);
  });
});
