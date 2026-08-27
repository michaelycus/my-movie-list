import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./redirect";

describe("getSafeRedirectPath", () => {
  it("defaults to / when next is missing", () => {
    expect(getSafeRedirectPath(undefined)).toBe("/");
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
  });

  it("accepts a plain same-origin path", () => {
    expect(getSafeRedirectPath("/friends")).toBe("/friends");
    expect(getSafeRedirectPath("/sessions/new")).toBe("/sessions/new");
  });

  it("rejects a protocol-relative path", () => {
    expect(getSafeRedirectPath("//evil.com")).toBe("/");
  });

  it("rejects a backslash-prefixed path", () => {
    expect(getSafeRedirectPath("/\\evil.com")).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/");
  });

  it("rejects a path missing the leading slash", () => {
    expect(getSafeRedirectPath("friends")).toBe("/");
  });
});
