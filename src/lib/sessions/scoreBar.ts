// The project's own documented neon tokens (project-overview.md §7), used
// directly rather than read from CSS variables - this runs before paint, in
// plain TS, not in a styled context.
const NEON_MAGENTA = { r: 0xff, g: 0x2e, b: 0x9a };
const NEON_LIME = { r: 0xb6, g: 0xff, b: 0x3a };

export function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function interpolate(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t);
}

/** Group-score bar color: magenta at 0, lime at 1, linear RGB interpolation
 * in between - "thin neon bars, magenta -> lime by strength" from
 * project-overview.md §7. */
export function scoreBarColor(score: number): string {
  const t = clampScore(score);
  const r = interpolate(NEON_MAGENTA.r, NEON_LIME.r, t);
  const g = interpolate(NEON_MAGENTA.g, NEON_LIME.g, t);
  const b = interpolate(NEON_MAGENTA.b, NEON_LIME.b, t);
  return `rgb(${r}, ${g}, ${b})`;
}
