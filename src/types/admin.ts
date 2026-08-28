/** The admin usage dashboard's data (build-plan feature 19c), assembled by
 * getUsageStats from usage_events (features 19a/19b). */
export interface UsageStats {
  /** Last 14 UTC days, oldest first, zero-filled for a quiet day. */
  signupsByDay: { date: string; count: number }[];
  sessionsCreatedCount: number;
  /** Up to 5, ranked by pick count, most-picked first. */
  mostChosenFilms: { movieId: number; title: string; posterPath: string | null; count: number }[];
  searchVolume: { anonymous: number; authenticated: number };
  embeddingCallCount: number;
  llmCallCount: number;
  /** A rough estimate from documented per-call cost assumptions, not
   * measured billing - see stats.ts. */
  estimatedSpendUsd: number;
}
