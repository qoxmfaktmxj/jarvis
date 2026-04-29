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

/**
 * Path 또는 화이트리스트 호스트의 풀 URL만 허용.
 *
 * - "/foo" 같은 path는 safeRedirectPath()로 위임
 * - "https://yess.isusystem.com/foo" 같은 풀 URL은 host가 allowedHosts에 있을 때만 허용
 * - 그 외(`javascript:`, `//host`, malformed 등)는 모두 fallback
 *
 * Isomorphic — 브라우저와 Node 모두에서 동작.
 *
 * 서버사이드 동등 함수: `@jarvis/auth/return-url` 의 `validateReturnUrl`.
 * 두 곳에 두는 이유는 클라이언트 번들에 packages/auth 전체를 끌어들이지 않기 위함.
 */
export function safeReturnUrl(
  raw: string | null | undefined,
  allowedHosts: readonly string[],
  fallback: string,
): string {
  if (!raw || raw.length === 0) return fallback;

  if (raw.startsWith("/")) {
    return safeRedirectPath(raw, fallback);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fallback;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
  if (!allowedHosts.includes(url.host)) return fallback;
  return url.toString();
}
