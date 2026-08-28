"use client";

import { useActionState } from "react";
import { saveQuestionnaire } from "@/actions/friends";
import { buttonVariants } from "@/lib/ui";
import type { QuestionnaireAnswers } from "@/types/questionnaire";

interface FormState {
  error: string | null;
  saved: boolean;
}

const initialState: FormState = { error: null, saved: false };

const MOODS = [
  "fun",
  "serious",
  "inspiring",
  "scary",
  "action",
  "romantic",
  "mind-bending",
  "feel-good",
  "dark",
  "weird",
] as const;

const RECENCY_OPTIONS = [
  { value: "recent", label: "Mostly recent" },
  { value: "no-preference", label: "No preference" },
  { value: "classics", label: "Love the classics" },
] as const;

const RUNTIME_OPTIONS = [
  { value: "under100", label: "Under 100 min" },
  { value: "around2h", label: "Around 2h is fine" },
  { value: "longOk", label: "I'll happily watch 3 hours" },
] as const;

const CONTENT_OPTIONS = [
  { value: "light", label: "Keep it light" },
  { value: "no-preference", label: "No strong preference" },
  { value: "heavy", label: "Fine with gore and heavy themes" },
] as const;

const pill =
  "cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-foreground transition-[color,border-color,transform] duration-150 ease-out-strong active:scale-[0.96] peer-checked:border-neon-magenta peer-checked:text-neon-magenta peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-neon-cyan";

const textarea =
  "w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
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
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
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
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className={pill}>{label}</span>
    </label>
  );
}

export function QuestionnaireForm({
  friendId,
  answers,
  genres,
}: {
  friendId: string;
  answers: QuestionnaireAnswers | null;
  genres: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: FormState, formData: FormData): Promise<FormState> => {
      const result = await saveQuestionnaire(friendId, formData);
      if (!result.success) return { error: result.error, saved: false };
      return { error: null, saved: true };
    },
    initialState
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-muted-foreground">Required</h2>

        <Field label="What's a film you love, and why?">
          <textarea
            name="lovedFilm"
            required
            maxLength={500}
            rows={3}
            defaultValue={answers?.lovedFilm}
            placeholder="Arrival, because I like sci-fi that's actually about grief"
            className={textarea}
          />
        </Field>

        <Field label="Describe your perfect movie night in one sentence.">
          <textarea
            name="perfectNight"
            required
            maxLength={500}
            rows={2}
            defaultValue={answers?.perfectNight}
            placeholder="Something slow, a blanket, and no phones"
            className={textarea}
          />
        </Field>

        <Field label="Anything you never want to watch?">
          <textarea
            name="hardNo"
            required
            maxLength={500}
            rows={2}
            defaultValue={answers?.hardNo}
            placeholder="Torture scenes, films where the dog dies..."
            className={textarea}
          />
          <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="hardNoIsBlocking"
              defaultChecked={answers?.hardNoIsBlocking ?? false}
              className="accent-neon-magenta"
            />
            This is a hard no - never show it, don&apos;t just penalize it
          </label>
        </Field>
      </div>

      <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Optional - fill in now or later
        </h2>

        <Field label="Mood you usually want">
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => (
              <CheckboxPill
                key={mood}
                name="moods"
                value={mood}
                label={mood}
                defaultChecked={answers?.moods.includes(mood) ?? false}
              />
            ))}
          </div>
        </Field>

        <Field label="New or classic?">
          <div className="flex flex-wrap gap-2">
            {RECENCY_OPTIONS.map((option) => (
              <RadioPill
                key={option.value}
                name="recency"
                value={option.value}
                label={option.label}
                defaultChecked={(answers?.recency ?? "no-preference") === option.value}
              />
            ))}
          </div>
        </Field>

        <Field label="Genres you love">
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <CheckboxPill
                key={genre.id}
                name="lovedGenreIds"
                value={String(genre.id)}
                label={genre.name}
                defaultChecked={answers?.lovedGenreIds.includes(genre.id) ?? false}
              />
            ))}
          </div>
        </Field>

        <Field label="Genres you'd rather avoid">
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <CheckboxPill
                key={genre.id}
                name="avoidGenreIds"
                value={String(genre.id)}
                label={genre.name}
                defaultChecked={answers?.avoidGenreIds.includes(genre.id) ?? false}
              />
            ))}
          </div>
        </Field>

        <Field label="How long is too long?">
          <div className="flex flex-wrap gap-2">
            {RUNTIME_OPTIONS.map((option) => (
              <RadioPill
                key={option.value}
                name="runtimeTolerance"
                value={option.value}
                label={option.label}
                defaultChecked={(answers?.runtimeTolerance ?? "around2h") === option.value}
              />
            ))}
          </div>
        </Field>

        <Field label="Subtitles?">
          <div className="flex flex-wrap gap-2">
            <RadioPill
              name="subtitlesOk"
              value="true"
              label="Happy to read them"
              defaultChecked={(answers?.subtitlesOk ?? true) === true}
            />
            <RadioPill
              name="subtitlesOk"
              value="false"
              label="Prefer dubbed or English-language"
              defaultChecked={(answers?.subtitlesOk ?? true) === false}
            />
          </div>
        </Field>

        <Field label="Content tolerance">
          <div className="flex flex-wrap gap-2">
            {CONTENT_OPTIONS.map((option) => (
              <RadioPill
                key={option.value}
                name="contentTolerance"
                value={option.value}
                label={option.label}
                defaultChecked={(answers?.contentTolerance ?? "no-preference") === option.value}
              />
            ))}
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonVariants({ intent: "primary" })}>
          {isPending ? "Saving…" : "Save answers"}
        </button>
        {state.saved && <span className="text-sm text-neon-lime">Saved.</span>}
        {state.error && <span className="text-sm text-neon-amber">{state.error}</span>}
      </div>
    </form>
  );
}
