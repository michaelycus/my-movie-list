/** Shape of one friend as rendered on the /friends page. */
export interface Friend {
  id: string;
  displayName: string;
  avatarEmoji: string | null;
  updatedAt: string;
}
