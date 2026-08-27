import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./middleware";

describe("isProtectedPath", () => {
  it("matches account-owned routes and their sub-paths", () => {
    expect(isProtectedPath("/friends")).toBe(true);
    expect(isProtectedPath("/friends/123")).toBe(true);
    expect(isProtectedPath("/sessions")).toBe(true);
    expect(isProtectedPath("/sessions/new")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
  });

  it("does not match the public catalog, search, or auth routes", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/films/1")).toBe(false);
    expect(isProtectedPath("/api/search")).toBe(false);
    expect(isProtectedPath("/auth/login")).toBe(false);
  });

  it("does not match a path that merely starts with a protected prefix", () => {
    expect(isProtectedPath("/sessionsfoo")).toBe(false);
    expect(isProtectedPath("/friendship")).toBe(false);
  });
});
