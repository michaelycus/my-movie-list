import { describe, expect, it } from "vitest";
import { parseFriendInput } from "./validation";

describe("parseFriendInput", () => {
  it("accepts a valid name with no emoji", () => {
    const result = parseFriendInput({ displayName: "Alex", avatarEmoji: null });
    expect(result).toEqual({
      success: true,
      data: { displayName: "Alex", avatarEmoji: null },
    });
  });

  it("trims the name and emoji", () => {
    const result = parseFriendInput({ displayName: "  Alex  ", avatarEmoji: " 🍿 " });
    expect(result).toEqual({
      success: true,
      data: { displayName: "Alex", avatarEmoji: "🍿" },
    });
  });

  it("rejects a blank name", () => {
    const result = parseFriendInput({ displayName: "   ", avatarEmoji: null });
    expect(result).toEqual({ success: false, error: "Name is required" });
  });

  it("rejects a missing name", () => {
    const result = parseFriendInput({ displayName: null, avatarEmoji: null });
    expect(result).toEqual({ success: false, error: "Name is required" });
  });

  it("rejects a name over 40 characters", () => {
    const result = parseFriendInput({
      displayName: "a".repeat(41),
      avatarEmoji: null,
    });
    expect(result).toEqual({
      success: false,
      error: "Keep the name under 40 characters",
    });
  });

  it("rejects an over-length emoji field", () => {
    const result = parseFriendInput({
      displayName: "Alex",
      avatarEmoji: "123456789",
    });
    expect(result).toEqual({ success: false, error: "Use a single emoji" });
  });

  it("treats an empty emoji string as no avatar", () => {
    const result = parseFriendInput({ displayName: "Alex", avatarEmoji: "" });
    expect(result).toEqual({
      success: true,
      data: { displayName: "Alex", avatarEmoji: null },
    });
  });
});
