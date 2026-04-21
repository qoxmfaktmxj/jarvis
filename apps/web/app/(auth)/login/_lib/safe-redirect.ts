/**
 * Return `redirectTo` only if it is a same-origin path.
 *
 * Accepts: `/path`, `/path?query`, `/path#hash`.
 * Rejects: `//host`, `\\host`, any absolute URL, any non-http scheme,
 *          paths without a leading `/`, empty strings.
 *
 * Must run in the browser and on the server, so we avoid `URL` parsing
 * against an origin — a string-level check is enough for the path whitelist.
 */
export function safeRedirectPath(
  redirectTo: string | null | undefined,
  fallback: string
): string {
  if (!redirectTo) return fallback;
  if (redirectTo.length === 0) return fallback;
  if (redirectTo[0] !== "/") return fallback;
  if (redirectTo.startsWith("//")) return fallback;
  if (redirectTo.startsWith("/\\")) return fallback;
  // Defence-in-depth: reject any character that would let the string
  // re-enter URL parsing with a scheme (e.g. tab/newline smuggling).
  if (/[\x00-\x1f]/.test(redirectTo)) return fallback;
  return redirectTo;
}
