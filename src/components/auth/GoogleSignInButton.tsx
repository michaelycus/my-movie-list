"use client";

import { useActionState } from "react";
import { signInWithGoogle } from "@/actions/auth";
import { buttonVariants } from "@/lib/ui";

const initialState = { success: false as const, error: "" };

export function GoogleSignInButton({ next }: { next?: string }) {
  // useActionState (not a plain <form action>) because the failure case needs
  // to render inline - signInWithGoogle only ever returns on failure (success
  // redirects the browser to Google before returning), so there's no other
  // way to surface it without a full page reload round-trip through `next`.
  const [state, formAction, pending] = useActionState(
    () => signInWithGoogle(next),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className={buttonVariants({ intent: "secondary", size: "lg" })}
      >
        {pending ? "Redirecting..." : "Continue with Google"}
      </button>
      {state.error && (
        <p className="text-sm text-neon-amber">{state.error}</p>
      )}
    </form>
  );
}
