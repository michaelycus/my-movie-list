import { describe, expect, it } from "vitest";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("matches an email on the allowlist", () => {
    expect(isAdminEmail("me@example.com", "me@example.com,other@example.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isAdminEmail("Me@Example.com", "me@example.com")).toBe(true);
  });

  it("trims whitespace around allowlist entries", () => {
    expect(isAdminEmail("me@example.com", " me@example.com , other@example.com ")).toBe(true);
  });

  it("rejects an email not on the allowlist", () => {
    expect(isAdminEmail("stranger@example.com", "me@example.com")).toBe(false);
  });

  it("rejects when the allowlist is missing or empty", () => {
    expect(isAdminEmail("me@example.com", undefined)).toBe(false);
    expect(isAdminEmail("me@example.com", "")).toBe(false);
  });

  it("rejects when the email is missing", () => {
    expect(isAdminEmail(null, "me@example.com")).toBe(false);
    expect(isAdminEmail(undefined, "me@example.com")).toBe(false);
    expect(isAdminEmail("", "me@example.com")).toBe(false);
  });

  it("ignores empty entries from stray commas", () => {
    expect(isAdminEmail("me@example.com", ",me@example.com,,")).toBe(true);
  });
});
