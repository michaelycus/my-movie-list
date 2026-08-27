"use client";

import { useActionState } from "react";
import { saveTonightsMood } from "@/actions/sessions";
import { MOODS, RUNTIME_OVERRIDE_OPTIONS, type RuntimeOverride } from "@/lib/sessions/mood";
import type { SessionParticipant } from "@/types/session";

interface FormState {
  error: string | null;
  saved: boolean;
}

const initialState: FormState = { error: null, saved: false };

const RUNTIME_LABELS: Record<RuntimeOverride, string> = {
  none: "No limit",
  under2h: "Nothing over 2h tonight",
  under100: "Nothing over 100 min tonight",
};

const pill =
  "cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-colors peer-checked:border-neon-magenta peer-checked:text-neon-magenta peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-neon-cyan";

function runtimeOverrideFor(maxRuntime: number | null): RuntimeOverride {
  if (maxRuntime === 120) return "under2h";
  if (maxRuntime === 100) return "under100";
  return "none";
}

function CheckboxPill({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className={pill}>{label}</span>
    </label>
  );
}

function RadioPill({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label>
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className={pill}>{label}</span>
    </label>
  );
}

export function TonightsMoodForm({
  sessionId,
  participants,
  youngestViewerAge,
}: {
  sessionId: string;
  participants: SessionParticipant[];
  youngestViewerAge: number | null;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const result = await saveTonightsMood(sessionId, formData);
      if (!result.success) return { error: result.error, saved: false };
      return { error: null, saved: true };
    },
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">How&apos;s everyone feeling?</h2>

      {participants.map((participant) => (
        <div key={participant.id} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <span aria-hidden>{participant.avatarEmoji || "🎬"}</span>
            {participant.displayName}
          </p>

          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => (
              <CheckboxPill
                key={mood}
                name={`mood-${participant.id}`}
                value={mood}
                label={mood}
                defaultChecked={participant.moodTags.includes(mood)}
              />
            ))}
          </div>

          <textarea
            name={`note-${participant.id}`}
            maxLength={300}
            rows={2}
            defaultValue={participant.moodNote ?? ""}
            placeholder="Anything else about tonight? (optional)"
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-cyan focus:outline-none"
          />

          <div className="flex flex-wrap gap-2">
            {RUNTIME_OVERRIDE_OPTIONS.map((option) => (
              <RadioPill
                key={option}
                name={`maxRuntime-${participant.id}`}
                value={option}
                label={RUNTIME_LABELS[option]}
                defaultChecked={runtimeOverrideFor(participant.constraints.maxRuntime) === option}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <label htmlFor="youngestViewerAge" className="text-sm font-medium text-foreground">
          Youngest viewer in the room tonight
        </label>
        <input
          id="youngestViewerAge"
          name="youngestViewerAge"
          type="number"
          min={0}
          max={17}
          defaultValue={youngestViewerAge ?? ""}
          placeholder="Leave blank if no kids tonight"
          className="w-64 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-cyan focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 self-start rounded-full border border-neon-magenta px-4 py-2 text-sm text-neon-magenta transition-colors hover:bg-neon-magenta/10 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save tonight's mood"}
        </button>
        {state.saved && <span className="text-sm text-neon-lime">Saved.</span>}
        {state.error && <span className="text-sm text-neon-amber">{state.error}</span>}
      </div>
    </form>
  );
}
