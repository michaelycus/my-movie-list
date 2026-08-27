/**
 * `next` arrives as an OAuth redirect query param - attacker-controlled.
 * Only a same-origin path is safe to send a browser to; anything else
 * (an absolute URL, or `//host` / `/\host`, both of which browsers can
 * resolve as protocol-relative) falls back to the catalog home.
 */
export function getSafeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
