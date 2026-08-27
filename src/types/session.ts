/** One person seated in a session, as rendered on the session detail page. */
export interface SessionParticipant {
  id: string;
  displayName: string;
  avatarEmoji: string | null;
  isHost: boolean;
}

/** A film session, plus who's in it (build-plan feature 12). `chosenMovieId`
 * stays null until feature 14's group recommendations pick a film. */
export interface SessionDetail {
  id: string;
  title: string;
  watchedOn: string;
  chosenMovieId: number | null;
  participants: SessionParticipant[];
}
