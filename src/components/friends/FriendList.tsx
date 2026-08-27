import type { Friend } from "@/types/friend";
import { FriendCard } from "./FriendCard";

export function FriendList({ friends }: { friends: Friend[] }) {
  if (friends.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-muted-foreground">
        No friends yet. Add one above to start building their taste profile.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {friends.map((friend) => (
        <FriendCard key={friend.id} friend={friend} />
      ))}
    </div>
  );
}
