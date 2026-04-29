/**
 * 서버사이드 `?redirect=` 파라미터 검증.
 *
 * 허용 케이스:
 *   - same-origin path ("/foo", "/foo?x=1#bar")
 *   - 화이트리스트 호스트의 풀 http(s) URL
 *
 * 거부 케이스(→ fallback):
 *   - null/undefined/빈 문자열
 *   - 스킴-relative URL ("//host")
 *   - 백슬래시 우회 ("/\\host")
 *   - 제어문자 포함 (탭/개행 smuggling)
 *   - http/https 외 스킴 (javascript:, data:, file: ...)
 *   - 비화이트리스트 호스트
 *   - URL 파싱 실패
 *
 * Isomorphic — Node 런타임에서 `URL` 글로벌 사용.
 */
export function validateReturnUrl(
  raw: string | null | undefined,
  allowedHosts: readonly string[],
  fallback: string,
): string {
  if (!raw || raw.length === 0) return fallback;

  // Path-only fast path
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f]/.test(raw)) return fallback;
    return raw;
  }

  // Full URL path
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
