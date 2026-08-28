import { clampScore, scoreBarColor } from "@/lib/sessions/scoreBar";

/** Thin neon fit bar - magenta -> lime by strength, never a bare percentage
 * (project-overview.md §7). The percentage still exists as the accessible
 * name, for screen readers. */
export function GroupScoreBar({ score }: { score: number }) {
  const pct = clampScore(score) * 100;

  return (
    <div
      role="img"
      aria-label={`Group fit: ${Math.round(pct)}%`}
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-300 ease-in-out-strong"
        style={{ width: `${pct}%`, backgroundColor: scoreBarColor(score) }}
      />
    </div>
  );
}
