"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { deleteFriend, updateFriend } from "@/actions/friends";
import type { Friend } from "@/types/friend";

interface FormState {
  error: string | null;
}

const initialState: FormState = { error: null };

export function FriendCard({ friend }: { friend: Friend }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editState, editAction, isSaving] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const result = await updateFriend(friend.id, formData);
      if (!result.success) return { error: result.error };
      setMode("view");
      return { error: null };
    },
    initialState
  );

  function handleDelete() {
    if (!window.confirm(`Remove ${friend.displayName}?`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteFriend(friend.id);
      if (!result.success) setDeleteError(result.error);
    });
  }

  if (mode === "edit") {
    return (
      <form
        action={editAction}
        className="flex flex-col gap-3 rounded-lg border border-neon-cyan/40 bg-surface p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <input
            name="displayName"
            defaultValue={friend.displayName}
            required
            maxLength={40}
            aria-label="Name"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:border-neon-cyan focus:outline-none"
          />
          <input
            name="avatarEmoji"
            defaultValue={friend.avatarEmoji ?? ""}
            maxLength={8}
            aria-label="Avatar"
            className="w-20 rounded-full border border-border bg-background px-4 py-2 text-center text-sm text-foreground focus:border-neon-cyan focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="shrink-0 rounded-full border border-neon-magenta px-4 py-2 text-sm text-neon-magenta transition-colors hover:bg-neon-magenta/10 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        {editState.error && <p className="text-sm text-neon-amber">{editState.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {friend.avatarEmoji || "🎬"}
          </span>
          <span className="text-sm font-medium text-foreground">{friend.displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/friends/${friend.id}/questionnaire`}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-neon-cyan hover:text-neon-cyan"
          >
            {friend.hasAnswers ? "Edit answers" : "Take questionnaire"}
          </Link>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:border-neon-cyan hover:text-neon-cyan"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-neon-amber hover:text-neon-amber disabled:opacity-50"
          >
            {isDeleting ? "Removing…" : "Delete"}
          </button>
        </div>
      </div>
      {deleteError && <p className="text-sm text-neon-amber">{deleteError}</p>}
    </div>
  );
}
