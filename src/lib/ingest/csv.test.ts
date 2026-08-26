import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCreditsCsv, parseMoviesCsv } from "./csv";

const FIXTURES = join(__dirname, "__fixtures__");
const REAL_MOVIES_CSV = join(process.cwd(), "references/tmdb_5000_movies.csv");
const REAL_CREDITS_CSV = join(process.cwd(), "references/tmdb_5000_credits.csv");

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of iterable) rows.push(row);
  return rows;
}

describe("parseMoviesCsv", () => {
  it("parses quoted fields containing commas and embedded newlines", async () => {
    const rows = await collect(parseMoviesCsv(join(FIXTURES, "movies-sample.csv")));

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("1");
    expect(rows[0].overview).toBe(
      "A story about hope, and about loss.\nIt spans two lines."
    );
    expect(rows[0].genres).toBe('[{"id": 28, "name": "Action"}]');
    expect(rows[1].id).toBe("2");
    expect(rows[1].genres).toBe("[]");
  });

  it("parses the real TMDB movies CSV in full", async () => {
    const rows = await collect(parseMoviesCsv(REAL_MOVIES_CSV));
    expect(rows).toHaveLength(4803);
  });
});

describe("parseCreditsCsv", () => {
  it("parses quoted fields containing commas", async () => {
    const rows = await collect(parseCreditsCsv(join(FIXTURES, "credits-sample.csv")));

    expect(rows).toHaveLength(2);
    expect(rows[0].movie_id).toBe("1");
    expect(rows[0].cast).toContain('"character": "Hero, the Brave"');
    expect(rows[1].cast).toBe("[]");
  });

  it("parses the real TMDB credits CSV in full", async () => {
    const rows = await collect(parseCreditsCsv(REAL_CREDITS_CSV));
    expect(rows).toHaveLength(4803);
  });
});
