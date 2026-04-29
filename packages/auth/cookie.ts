/**
 * COOKIE_DOMAIN 환경변수 형식 검증.
 *
 * 운영자가 실수로 `.com` 같은 과확장 값을 넣으면 모든 .com 사이트가
 * Jarvis 쿠키를 받게 되어 보안 사고로 직결된다. 부팅 시 throw하여 막는다.
 *
 * - 빈 값/undefined → undefined (호스트 한정 폴백)
 * - 점으로 시작하지 않으면 throw
 * - 점 이후 라벨이 2개 미만이면 throw (.com, .localhost 같은 TLD-only 차단)
 */
export function validateCookieDomain(
  domain: string | undefined,
): string | undefined {
  if (!domain || domain.length === 0) return undefined;
  if (!domain.startsWith(".")) {
    throw new Error(`COOKIE_DOMAIN must start with '.' (got: ${domain})`);
  }
  const labels = domain.slice(1).split(".").filter((s) => s.length > 0);
  if (labels.length < 2) {
    throw new Error(
      `COOKIE_DOMAIN too broad — needs at least 2 labels (got: ${domain})`,
    );
  }
  return domain;
}

export interface SessionCookieEnv {
  cookieDomain: string | undefined;
  isProduction: boolean;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  domain?: string;
}

/**
 * 세션 쿠키 옵션 빌더 (login/logout 공유).
 *
 * - 운영(`isProduction=true`)에서 `Secure` 자동 활성
 * - `cookieDomain` 유효 시 부모 도메인 쿠키, 비어있으면 호스트 한정 폴백
 * - lifetimeMs=0이면 cookie clear 용도
 */
export function buildSessionCookieOptions(
  env: SessionCookieEnv,
  lifetimeMs: number,
): SessionCookieOptions {
  const opts: SessionCookieOptions = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(lifetimeMs / 1000),
  };
  const domain = validateCookieDomain(env.cookieDomain);
  if (domain) opts.domain = domain;
  return opts;
}
