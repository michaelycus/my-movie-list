import type { QuestionnaireAnswers } from "@/types/questionnaire";

/** Shape of one friend as rendered on the /friends page. */
export interface Friend {
  id: string;
  displayName: string;
  avatarEmoji: string | null;
  updatedAt: string;
  hasAnswers: boolean;
}

/** A friend plus its questionnaire answers, for the questionnaire page. */
export interface FriendDetail {
  id: string;
  displayName: string;
  avatarEmoji: string | null;
  answers: QuestionnaireAnswers | null;
}
