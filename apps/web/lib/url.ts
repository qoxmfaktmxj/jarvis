/**
 * Defense-in-depth: only accept paths that are unambiguously same-origin
 * absolute paths. Rejects:
 * - empty / null
 * - `javascript:` / `data:` / other non-path schemes
 * - protocol-relative `//evil.com`
 * - relative `foo` (would resolve against current page — surprising)
 *
 * Used by sidebar, command palette, and tabs persistence to validate route
 * paths from any source (DB seed, sessionStorage, future admin UI) before
 * passing them to `router.push` or rendering as `<a href>`.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (path.length === 0 || path.length > 300) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  return true;
}
