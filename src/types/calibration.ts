/** One tap on the poster calibration step (build-plan feature 10). Stored in
 * `friends.answers.calibrationPicks`, read by feature 11's taste embedding. */
export interface CalibrationPick {
  movieId: number;
  liked: boolean;
}
