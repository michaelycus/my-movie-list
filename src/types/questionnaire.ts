/** Raw answers collected by the preference questionnaire (build-plan feature 9, Q1-Q9). */
export interface QuestionnaireAnswers {
  lovedFilm: string;
  perfectNight: string;
  hardNo: string;
  hardNoIsBlocking: boolean;
  moods: string[];
  recency: "recent" | "no-preference" | "classics";
  lovedGenreIds: number[];
  avoidGenreIds: number[];
  runtimeTolerance: "under100" | "around2h" | "longOk";
  subtitlesOk: boolean;
  contentTolerance: "light" | "no-preference" | "heavy";
}

/** Derived hard filters, matching the `friends.hard_filters` shape in project-overview.md. */
export interface HardFilters {
  maxRuntime: number | null;
  minAgeCeiling: number | null;
  blockedGenres: number[];
  subtitlesOk: boolean;
}
