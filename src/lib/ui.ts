import { cva } from "class-variance-authority";

// Shared interaction language for every pressable control in the app: a
// visible keyboard focus ring and an instant :active press-down, on top of
// each component's own hover treatment. Centralized so it can't drift out of
// sync the way 17 hand-copied className strings already had.
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Action buttons and button-styled links (submit, save, sign in/out, CTAs). */
export const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm transition-[color,background-color,border-color,transform] duration-150 ease-out-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 ${focusRing}`,
  {
    variants: {
      intent: {
        primary: "border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10",
        secondary: "border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10",
        ghost: "border-border text-foreground hover:border-neon-cyan hover:text-neon-cyan",
        danger: "border-border text-muted-foreground hover:border-neon-amber hover:text-neon-amber",
      },
      size: {
        sm: "px-3 py-1.5",
        md: "px-4 py-2",
        lg: "px-5 py-2.5 font-medium",
      },
    },
    defaultVariants: { intent: "ghost", size: "md" },
  }
);

/** Selectable nav pills: sort options, pagination, filter chips. Distinct
 * from buttonVariants because these carry a persistent active/current state
 * rather than a one-off action. */
export const navPillVariants = cva(
  `rounded-full border px-3 py-1 text-sm transition-[color,border-color,transform] duration-150 ease-out-strong active:scale-[0.97] ${focusRing}`,
  {
    variants: {
      state: {
        active: "border-neon-cyan text-neon-cyan",
        inactive: "border-border text-muted-foreground hover:border-neon-cyan/50 hover:text-foreground",
        disabled: "pointer-events-none border-border text-muted-foreground/50 active:scale-100",
      },
    },
    defaultVariants: { state: "inactive" },
  }
);
