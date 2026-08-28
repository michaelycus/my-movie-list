import { describe, expect, it } from "vitest";
import {
  countEventsByType,
  estimateApiSpendUsd,
  formatSpendUsd,
  groupSignupsByDay,
  rankMostChosenMovieIds,
  splitSearchVolume,
} from "./stats";

describe("groupSignupsByDay", () => {
  it("zero-fills every day in the window when there are no signups", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const result = groupSignupsByDay([], 3, now);
    expect(result).toEqual([
      { date: "2026-08-26", count: 0 },
      { date: "2026-08-27", count: 0 },
      { date: "2026-08-28", count: 0 },
    ]);
  });

  it("counts signups on their own day and ignores other event types", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const events = [
      { event_type: "signup", created_at: "2026-08-27T09:00:00Z" },
      { event_type: "signup", created_at: "2026-08-27T23:00:00Z" },
      { event_type: "signup", created_at: "2026-08-28T00:01:00Z" },
      { event_type: "search", created_at: "2026-08-27T10:00:00Z" },
    ];
    const result = groupSignupsByDay(events, 3, now);
    expect(result).toEqual([
      { date: "2026-08-26", count: 0 },
      { date: "2026-08-27", count: 2 },
      { date: "2026-08-28", count: 1 },
    ]);
  });

  it("drops a signup outside the window rather than crashing", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const events = [{ event_type: "signup", created_at: "2026-01-01T00:00:00Z" }];
    const result = groupSignupsByDay(events, 3, now);
    expect(result.reduce((sum, day) => sum + day.count, 0)).toBe(0);
  });
});

describe("countEventsByType", () => {
  it("counts only matching events", () => {
    const events = [
      { event_type: "search" },
      { event_type: "llm_call" },
      { event_type: "search" },
    ];
    expect(countEventsByType(events, "search")).toBe(2);
    expect(countEventsByType(events, "llm_call")).toBe(1);
    expect(countEventsByType(events, "embedding_call")).toBe(0);
  });
});

describe("splitSearchVolume", () => {
  it("splits search events by anonymous vs authenticated", () => {
    const events = [
      { event_type: "search", user_id: null },
      { event_type: "search", user_id: "user-1" },
      { event_type: "search", user_id: null },
      { event_type: "llm_call", user_id: null },
    ];
    expect(splitSearchVolume(events)).toEqual({ anonymous: 2, authenticated: 1 });
  });

  it("returns zeros for no search events", () => {
    expect(splitSearchVolume([])).toEqual({ anonymous: 0, authenticated: 0 });
  });
});

describe("rankMostChosenMovieIds", () => {
  it("counts and ranks by movieId descending", () => {
    const events = [
      { meta: { movieId: 13 } },
      { meta: { movieId: 27 } },
      { meta: { movieId: 13 } },
      { meta: { movieId: 13 } },
      { meta: { movieId: 27 } },
    ];
    expect(rankMostChosenMovieIds(events, 5)).toEqual([
      { movieId: 13, count: 3 },
      { movieId: 27, count: 2 },
    ]);
  });

  it("truncates to the given limit", () => {
    const events = [{ meta: { movieId: 1 } }, { meta: { movieId: 2 } }, { meta: { movieId: 3 } }];
    expect(rankMostChosenMovieIds(events, 2)).toHaveLength(2);
  });

  it("skips a missing or malformed movieId instead of throwing", () => {
    const events = [
      { meta: {} },
      { meta: null },
      { meta: { movieId: "not-a-number" } },
      { meta: { movieId: 5 } },
    ];
    expect(rankMostChosenMovieIds(events, 5)).toEqual([{ movieId: 5, count: 1 }]);
  });

  it("returns an empty array for no events", () => {
    expect(rankMostChosenMovieIds([], 5)).toEqual([]);
  });
});

describe("estimateApiSpendUsd", () => {
  it("is 0 for no calls", () => {
    expect(estimateApiSpendUsd(0, 0)).toBe(0);
  });

  it("scales linearly with call counts", () => {
    const oneEach = estimateApiSpendUsd(1, 1);
    const tenEach = estimateApiSpendUsd(10, 10);
    expect(tenEach).toBeCloseTo(oneEach * 10, 10);
  });

  it("charges embedding and llm calls independently", () => {
    const embeddingOnly = estimateApiSpendUsd(100, 0);
    const llmOnly = estimateApiSpendUsd(0, 100);
    const both = estimateApiSpendUsd(100, 100);
    expect(both).toBeCloseTo(embeddingOnly + llmOnly, 10);
    expect(embeddingOnly).toBeGreaterThan(0);
    expect(llmOnly).toBeGreaterThan(0);
  });
});

describe("formatSpendUsd", () => {
  it("shows a plain $0.00 for exactly zero", () => {
    expect(formatSpendUsd(0)).toBe("$0.00");
  });

  it("shows more decimals below one cent so it doesn't read as zero", () => {
    expect(formatSpendUsd(0.00002)).toBe("$0.000020");
  });

  it("shows two decimals at or above one cent", () => {
    expect(formatSpendUsd(0.01)).toBe("$0.01");
    expect(formatSpendUsd(12.345)).toBe("$12.35");
  });
});
