import type {
  NormalizedCastMember,
  NormalizedCrewMember,
  NormalizedGenre,
} from "./types";

interface RawGenre {
  id: number;
  name: string;
}

interface RawKeyword {
  id: number;
  name: string;
}

interface RawCastMember {
  name: string;
  character: string;
  order: number;
}

interface RawCrewMember {
  name: string;
  job: string;
}

export function parseGenres(json: string): NormalizedGenre[] {
  const raw: RawGenre[] = JSON.parse(json);
  return raw.map((g) => ({ id: g.id, name: g.name }));
}

export function parseKeywords(json: string, limit = 10): string[] {
  const raw: RawKeyword[] = JSON.parse(json);
  return raw.slice(0, limit).map((k) => k.name);
}

/** Top-billed cast only - TMDB's `order` field is 0-indexed, so maxBilling
 * of 8 keeps the first 8 credited names (orders 0-7). The source array isn't
 * guaranteed to already be sorted by order, so this sorts before slicing. */
export function parseCast(json: string, maxBilling = 8): NormalizedCastMember[] {
  const raw: RawCastMember[] = JSON.parse(json);
  return raw
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((c) => c.order < maxBilling)
    .map((c) => ({
      personName: c.name,
      characterName: c.character || null,
      billingOrder: c.order,
    }));
}

/** Director only for now (see spec's Out of scope). Returns [] when the crew
 * list has no Director credit - a real, expected case, not an error. */
export function parseCrew(json: string): NormalizedCrewMember[] {
  const raw: RawCrewMember[] = JSON.parse(json);
  return raw
    .filter((c) => c.job === "Director")
    .map((c) => ({ personName: c.name, job: c.job }));
}
