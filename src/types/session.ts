/** Tonight's runtime override for the group (build-plan feature 13). `null`
 * means no override - fall back to whatever each friend's own stored
 * `hard_filters.maxRuntime` says. */
export interface SessionConstraints {
  maxRuntime: number | null;
}

/** One person seated in a session, as rendered on the session detail page. */
export interface SessionParticipant {
  id: string;
  displayName: string;
  avatarEmoji: string | null;
  isHost: boolean;
  moodTags: string[];
  moodNote: string | null;
  constraints: SessionConstraints;
}

/** A film session, plus who's in it (build-plan feature 12) and how everyone's
 * feeling tonight (build-plan feature 13). `chosenMovieId` stays null until
 * feature 14's group recommendations pick a film. `youngestViewerAge` is a
 * room-wide fact the host states once, not per participant. */
export interface SessionDetail {
  id: string;
  title: string;
  watchedOn: string;
  chosenMovieId: number | null;
  rationale: string | null;
  youngestViewerAge: number | null;
  participants: SessionParticipant[];
}

/** One row on the /sessions history list (build-plan feature 17) - just
 * enough to render the list without a per-session movie-detail fetch. */
export interface SessionListItem {
  id: string;
  title: string;
  watchedOn: string;
  chosenMovie: { id: number; title: string; posterPath: string | null } | null;
}
