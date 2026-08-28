"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/actions/sessions";
import { createFriend } from "@/actions/friends";
import { buttonVariants } from "@/lib/ui";
import type { Friend } from "@/types/friend";

interface FormState {
  error: string | null;
}

const initialState: FormState = { error: null };

export function NewSessionForm({ friends: initialFriends }: { friends: Friend[] }) {
  const router = useRouter();
  const [friends, setFriends] = useState(initialFriends);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addFriendName, setAddFriendName] = useState("");
  const [addFriendEmoji, setAddFriendEmoji] = useState("");
  const [isAddingFriend, startAddFriendTransition] = useTransition();
  const [addFriendError, setAddFriendError] = useState<string | null>(null);

  // friendIds is appended here (not a static hidden input) because it's
  // derived from checkbox state, not from any single form field React can
  // read on its own.
  const [state, formAction, isCreating] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      for (const id of selectedIds) formData.append("friendIds", id);
      const result = await createSession(formData);
      if (!result.success) return { error: result.error };
      router.push(`/sessions/${result.data.id}`);
      return { error: null };
    },
    initialState
  );

  function toggleFriend(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Local state only - createFriend already revalidates /friends, but this
  // page's picker list is its own component state, so the new friend is
  // appended and pre-selected here without a round trip or losing the title
  // /other checkboxes already filled in.
  function handleAddFriend() {
    const name = addFriendName.trim();
    if (!name) return;
    setAddFriendError(null);

    const formData = new FormData();
    formData.set("displayName", name);
    formData.set("avatarEmoji", addFriendEmoji);

    startAddFriendTransition(async () => {
      const result = await createFriend(formData);
      if (!result.success) {
        setAddFriendError(result.error);
        return;
      }
      const newFriend: Friend = {
        id: result.data.id,
        displayName: name,
        avatarEmoji: addFriendEmoji.trim() || null,
        updatedAt: new Date().toISOString(),
        hasAnswers: false,
      };
      setFriends((prev) => [...prev, newFriend]);
      setSelectedIds((prev) => new Set(prev).add(newFriend.id));
      setAddFriendName("");
      setAddFriendEmoji("");
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-xs text-muted-foreground">
          Session title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={60}
          placeholder="Friday movie night"
          className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-foreground">Who&apos;s here</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">No friends yet - add one below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friends.map((friend) => (
              <li key={friend.id}>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(friend.id)}
                    onChange={() => toggleFriend(friend.id)}
                    className="h-4 w-4 accent-neon-magenta"
                  />
                  <span aria-hidden>{friend.avatarEmoji || "🎬"}</span>
                  {friend.displayName}
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="newFriendName" className="text-xs text-muted-foreground">
              Add a friend
            </label>
            <input
              id="newFriendName"
              value={addFriendName}
              onChange={(event) => setAddFriendName(event.target.value)}
              maxLength={40}
              placeholder="Friend's name"
              className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
            />
          </div>
          <input
            value={addFriendEmoji}
            onChange={(event) => setAddFriendEmoji(event.target.value)}
            maxLength={8}
            placeholder="🎬"
            aria-label="Avatar"
            className="w-20 rounded-full border border-border bg-background px-4 py-2 text-center text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
          />
          <button
            type="button"
            onClick={handleAddFriend}
            disabled={isAddingFriend || !addFriendName.trim()}
            className={buttonVariants({ intent: "ghost" })}
          >
            {isAddingFriend ? "Adding…" : "+ Add friend"}
          </button>
        </div>
        {addFriendError && <p className="text-sm text-neon-amber">{addFriendError}</p>}
      </div>

      <button
        type="submit"
        disabled={isCreating || selectedIds.size === 0}
        className={buttonVariants({ intent: "primary", className: "self-start" })}
      >
        {isCreating ? "Creating…" : "Create session"}
      </button>
      {state.error && <p className="text-sm text-neon-amber">{state.error}</p>}
    </form>
  );
}
