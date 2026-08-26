import { describe, expect, it } from "vitest";
import { formatAgeCertification, formatRuntime, parseMovieId } from "./detail";

describe("parseMovieId", () => {
  it("accepts a valid positive integer", () => {
    expect(parseMovieId("550")).toBe(550);
  });

  it("rejects a non-numeric id", () => {
    expect(parseMovieId("abc")).toBeNull();
  });

  it("rejects zero", () => {
    expect(parseMovieId("0")).toBeNull();
  });

  it("rejects a negative id", () => {
    expect(parseMovieId("-5")).toBeNull();
  });

  it("rejects a decimal id", () => {
    expect(parseMovieId("5.5")).toBeNull();
  });
});

describe("formatRuntime", () => {
  it("returns null for null", () => {
    expect(formatRuntime(null)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(formatRuntime(0)).toBeNull();
  });

  it("formats under an hour as minutes only", () => {
    expect(formatRuntime(45)).toBe("45m");
  });

  it("formats 59 minutes as minutes only", () => {
    expect(formatRuntime(59)).toBe("59m");
  });

  it("formats exactly 60 minutes as an hour with no minutes", () => {
    expect(formatRuntime(60)).toBe("1h");
  });

  it("formats 61 minutes as an hour plus one minute", () => {
    expect(formatRuntime(61)).toBe("1h 1m");
  });

  it("formats a multi-hour runtime as hours and minutes", () => {
    expect(formatRuntime(125)).toBe("2h 5m");
  });
});

describe("formatAgeCertification", () => {
  it("returns 'Not rated' for null", () => {
    expect(formatAgeCertification(null)).toBe("Not rated");
  });

  it("returns 'All ages' for zero", () => {
    expect(formatAgeCertification(0)).toBe("All ages");
  });

  it("formats a positive age as a plus rating", () => {
    expect(formatAgeCertification(16)).toBe("16+");
  });
});
