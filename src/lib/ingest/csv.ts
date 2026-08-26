import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import type { RawCreditsCsvRow, RawMovieCsvRow } from "./types";

/**
 * Streams a CSV file row by row via a real RFC-4180 parser (never split(',')),
 * so quoted fields with embedded commas/newlines - the TMDB JSON cells - parse
 * correctly. A Node Readable stream is async-iterable on its own.
 */
function parseCsv<T>(filePath: string): AsyncIterable<T> {
  return createReadStream(filePath).pipe(
    parse({ columns: true })
  ) as AsyncIterable<T>;
}

export function parseMoviesCsv(filePath: string): AsyncIterable<RawMovieCsvRow> {
  return parseCsv<RawMovieCsvRow>(filePath);
}

export function parseCreditsCsv(filePath: string): AsyncIterable<RawCreditsCsvRow> {
  return parseCsv<RawCreditsCsvRow>(filePath);
}
