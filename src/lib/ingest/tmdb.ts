const BR_CERTIFICATION_MIN_AGE: Record<string, number> = {
  Livre: 0,
  "10": 10,
  "12": 12,
  "14": 14,
  "16": 16,
  "18": 18,
};

const US_CERTIFICATION_MIN_AGE: Record<string, number> = {
  G: 0,
  PG: 8,
  "PG-13": 13,
  R: 17,
  "NC-17": 18,
};

export function mapCertificationToMinAge(
  certification: string,
  country: "BR" | "US"
): number | null {
  const table = country === "BR" ? BR_CERTIFICATION_MIN_AGE : US_CERTIFICATION_MIN_AGE;
  return table[certification] ?? null;
}

interface TmdbReleaseDate {
  certification: string;
}

interface TmdbCountryReleaseDates {
  iso_3166_1: string;
  release_dates: TmdbReleaseDate[];
}

export interface TmdbReleaseDatesResponse {
  results: TmdbCountryReleaseDates[];
}

function firstCertification(entry: TmdbCountryReleaseDates | undefined): string | null {
  const found = entry?.release_dates.find((rd) => rd.certification !== "");
  return found?.certification ?? null;
}

/** BR certification first, falling back to US. `null` if neither is present
 * or mappable - matches `movies.min_age`'s "NULL = unknown". */
export function extractMinAge(response: TmdbReleaseDatesResponse): number | null {
  const byCountry = new Map(response.results.map((r) => [r.iso_3166_1, r]));

  const brCertification = firstCertification(byCountry.get("BR"));
  if (brCertification) {
    const minAge = mapCertificationToMinAge(brCertification, "BR");
    if (minAge !== null) return minAge;
  }

  const usCertification = firstCertification(byCountry.get("US"));
  if (usCertification) {
    const minAge = mapCertificationToMinAge(usCertification, "US");
    if (minAge !== null) return minAge;
  }

  return null;
}

interface TmdbMovieDetails {
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface FilmEnrichment {
  posterPath: string | null;
  backdropPath: string | null;
  minAge: number | null;
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new Error(`TMDB request failed: ${response.status} ${url}`);
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    const delayMs = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : 2 ** attempt * 500;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export async function fetchFilmEnrichment(
  tmdbId: number,
  apiKey: string
): Promise<FilmEnrichment> {
  const [detailsRes, releaseDatesRes] = await Promise.all([
    fetchWithRetry(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}`),
    fetchWithRetry(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${apiKey}`
    ),
  ]);

  const details: TmdbMovieDetails = await detailsRes.json();
  const releaseDates: TmdbReleaseDatesResponse = await releaseDatesRes.json();

  return {
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    minAge: extractMinAge(releaseDates),
  };
}
