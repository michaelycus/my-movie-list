import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "./concurrency";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runWithConcurrency", () => {
  it("preserves result order regardless of completion order", async () => {
    const tasks = [
      async () => {
        await delay(15);
        return "a";
      },
      async () => {
        await delay(5);
        return "b";
      },
      async () => {
        await delay(10);
        return "c";
      },
    ];

    expect(await runWithConcurrency(tasks, 3)).toEqual(["a", "b", "c"]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    let current = 0;
    let max = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      current++;
      max = Math.max(max, current);
      await delay(5);
      current--;
      return null;
    });

    await runWithConcurrency(tasks, 3);

    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBe(3); // with 10 tasks and a cap of 3, it should actually reach the cap
  });

  it("runs every task exactly once", async () => {
    let count = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      count++;
      return null;
    });

    await runWithConcurrency(tasks, 4);

    expect(count).toBe(20);
  });

  it("handles an empty task list", async () => {
    expect(await runWithConcurrency([], 5)).toEqual([]);
  });
});
