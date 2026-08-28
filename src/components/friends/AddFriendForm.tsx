"use client";

import { useActionState, useState } from "react";
import { createFriend } from "@/actions/friends";
import { buttonVariants } from "@/lib/ui";

interface FormState {
  error: string | null;
}

const initialState: FormState = { error: null };

export function AddFriendForm() {
  // Remounting the form via `key` on a successful submit is the simplest way
  // to clear the uncontrolled inputs without hand-rolling controlled state.
  const [resetKey, setResetKey] = useState(0);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const result = await createFriend(formData);
      if (!result.success) return { error: result.error };
      setResetKey((key) => key + 1);
      return { error: null };
    },
    initialState
  );

  return (
    <form
      key={resetKey}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="displayName" className="text-xs text-muted-foreground">
          Name
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          placeholder="Friend's name"
          className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="avatarEmoji" className="text-xs text-muted-foreground">
          Avatar (optional)
        </label>
        <input
          id="avatarEmoji"
          name="avatarEmoji"
          maxLength={8}
          placeholder="🎬"
          className="w-20 rounded-full border border-border bg-background px-4 py-2 text-center text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
        />
      </div>
      <button type="submit" disabled={isPending} className={buttonVariants({ intent: "primary" })}>
        {isPending ? "Adding…" : "Add friend"}
      </button>
      {state.error && <p className="w-full text-sm text-neon-amber">{state.error}</p>}
    </form>
  );
}
