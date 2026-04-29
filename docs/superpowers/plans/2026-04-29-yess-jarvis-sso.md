# Yess–Jarvis 서브도메인 SSO 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarvis와 Yess(별도 레포·서버) 간 부모 도메인(`.isusystem.com`) 쿠키 공유 SSO를 도입한다. Jarvis가 단독으로 로그인/로그아웃을 책임지고, Yess는 같은 Postgres `user_session` 테이블을 SELECT만으로 검증한다.

**Architecture:** 기존 DB 세션 + 쿠키 방식 그대로. 변경 핵심은 쿠키의 `Domain` 옵션을 호스트 한정에서 부모 도메인으로 확장하는 것뿐. Login/logout 라우트가 새 `buildSessionCookieOptions()` 빌더를 공유하고, `?redirect=` 파라미터를 화이트리스트로 검증한다. JWT/OAuth/SAML 도입 없음.

**Tech Stack:** Next.js 15 App Router, packages/auth (TS ESM, NodeNext + .js suffix), Postgres `user_session` (Drizzle), Vitest 3.1, pnpm 10 모노레포.

**Spec:** [docs/superpowers/specs/2026-04-29-yess-jarvis-sso-design.md](../specs/2026-04-29-yess-jarvis-sso-design.md)

---

## Pre-flight

- 기준 브랜치: 현재 worktree (`claude/zealous-sanderson-811cb4`)
- 모든 변경은 같은 브랜치에 atomic commit (각 Task 1 commit)
- **모든 검증 명령은 2회 연속 실행** (`<cmd> && <cmd>`) — flaky 차단 (CLAUDE.md feedback)
- 테스트 임포트는 `.js` 확장자 사용 (`from '../cookie.js'`) — TS NodeNext ESM 컨벤션
- 패키지 단일 테스트 실행: `pnpm --filter=@jarvis/<pkg> exec vitest run <pattern>`

---

## File Structure

| 파일 | 역할 | Task |
|---|---|---|
| `packages/auth/cookie.ts` | `validateCookieDomain` + `buildSessionCookieOptions` (login/logout 공유) | 1, 2 |
| `packages/auth/__tests__/cookie.test.ts` | cookie.ts 단위 테스트 | 1, 2 |
| `packages/auth/return-url.ts` | 서버사이드 `validateReturnUrl` (logout 라우트에서 사용) | 3 |
| `packages/auth/__tests__/return-url.test.ts` | return-url.ts 단위 테스트 | 3 |
| `packages/auth/index.ts` | 새 모듈 re-export | 2, 3 |
| `packages/auth/package.json` | `exports` 맵에 `./cookie`, `./return-url` 추가 | 2, 3 |
| `apps/web/app/(auth)/login/_lib/safe-redirect.ts` | `safeReturnUrl` 함수 추가 (클라이언트사이드 isomorphic) | 4 |
| `apps/web/app/(auth)/login/_lib/safe-redirect.test.ts` | 신규 함수 테스트 케이스 추가 | 4 |
| `apps/web/app/api/auth/login/route.ts` | `buildSessionCookieOptions` 사용 | 5 |
| `apps/web/app/api/auth/login/route.test.ts` | 도메인/Secure 옵션 검증 케이스 추가 | 5 |
| `apps/web/app/(auth)/login/page.tsx` | `safeReturnUrl` + `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS` 사용 | 6 |
| `apps/web/app/api/auth/logout/route.ts` | `?redirect=` 화이트리스트 + 같은 domain 옵션으로 쿠키 클리어 | 7 |
| `apps/web/app/api/auth/logout/route.test.ts` | 신설 — redirect 처리 + 쿠키 옵션 | 7 |
| `.env.example` | `COOKIE_DOMAIN`, `ALLOWED_RETURN_HOSTS`, `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS` | 8 |
| `docs/integrations/yess-sso-handover.md` | Yess 개발자 인계 가이드 (신설) | 9 |

---

## Task 1: `validateCookieDomain` (cookie.ts)

`.com` 같은 과확장 도메인을 운영자가 실수로 넣어도 부팅 단계에서 throw하여 막는 검증 함수.

**Files:**
- Create: `packages/auth/cookie.ts`
- Create: `packages/auth/__tests__/cookie.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`packages/auth/__tests__/cookie.test.ts` 신설:

```ts
import { describe, expect, test } from "vitest";
import { validateCookieDomain } from "../cookie.js";

describe("validateCookieDomain", () => {
  test("returns undefined for undefined input", () => {
    expect(validateCookieDomain(undefined)).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    expect(validateCookieDomain("")).toBeUndefined();
  });

  test("passes 2-label domain that starts with dot", () => {
    expect(validateCookieDomain(".isusystem.com")).toBe(".isusystem.com");
  });

  test("passes 3-label subdomain", () => {
    expect(validateCookieDomain(".foo.isusystem.com")).toBe(".foo.isusystem.com");
  });

  test("throws when domain does not start with dot", () => {
    expect(() => validateCookieDomain("isusystem.com")).toThrow(/must start with/);
  });

  test("throws on overly broad single-label .com", () => {
    expect(() => validateCookieDomain(".com")).toThrow(/too broad/);
  });

  test("throws on bare TLD .localhost", () => {
    expect(() => validateCookieDomain(".localhost")).toThrow(/too broad/);
  });

  test("throws on lone dot", () => {
    expect(() => validateCookieDomain(".")).toThrow(/too broad/);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts
```

Expected: FAIL with "Cannot find module '../cookie.js'" (cookie.ts 미존재).

- [ ] **Step 3: `validateCookieDomain` 구현**

`packages/auth/cookie.ts` 신설:

```ts
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
```

- [ ] **Step 4: 테스트 실행 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts && pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts
```

Expected: 둘 다 PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/auth/cookie.ts packages/auth/__tests__/cookie.test.ts
git commit -m "feat(auth): add validateCookieDomain to reject broad COOKIE_DOMAIN values"
```

---

## Task 2: `buildSessionCookieOptions` (cookie.ts) + index/exports

login과 logout이 공유할 쿠키 옵션 빌더. `validateCookieDomain` 위임.

**Files:**
- Modify: `packages/auth/cookie.ts` (함수 추가)
- Modify: `packages/auth/__tests__/cookie.test.ts` (테스트 추가)
- Modify: `packages/auth/index.ts` (re-export)
- Modify: `packages/auth/package.json` (`exports` 추가)

- [ ] **Step 1: 실패 테스트 작성**

`packages/auth/__tests__/cookie.test.ts`에 다음 describe 블록 추가 (기존 테스트 아래):

```ts
import { buildSessionCookieOptions } from "../cookie.js";

describe("buildSessionCookieOptions", () => {
  test("omits domain when cookieDomain is undefined", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      8 * 60 * 60 * 1000,
    );
    expect(opts.domain).toBeUndefined();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.secure).toBe(false);
  });

  test("includes domain when cookieDomain is set and production secure", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: ".isusystem.com", isProduction: true },
      8 * 60 * 60 * 1000,
    );
    expect(opts.domain).toBe(".isusystem.com");
    expect(opts.secure).toBe(true);
  });

  test("converts lifetimeMs to maxAge in seconds (floor)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      8 * 60 * 60 * 1000,
    );
    expect(opts.maxAge).toBe(8 * 60 * 60);
  });

  test("handles 30-day lifetime (keepSignedIn)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: undefined, isProduction: false },
      30 * 24 * 60 * 60 * 1000,
    );
    expect(opts.maxAge).toBe(30 * 24 * 60 * 60);
  });

  test("propagates validateCookieDomain throw on invalid domain", () => {
    expect(() =>
      buildSessionCookieOptions(
        { cookieDomain: ".com", isProduction: true },
        1000,
      ),
    ).toThrow(/too broad/);
  });

  test("zero lifetime yields maxAge 0 (for cookie clear)", () => {
    const opts = buildSessionCookieOptions(
      { cookieDomain: ".isusystem.com", isProduction: true },
      0,
    );
    expect(opts.maxAge).toBe(0);
    expect(opts.domain).toBe(".isusystem.com");
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts
```

Expected: FAIL ("buildSessionCookieOptions is not exported").

- [ ] **Step 3: `buildSessionCookieOptions` 구현 + re-export 추가**

`packages/auth/cookie.ts` 끝에 추가:

```ts
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
```

`packages/auth/index.ts` 마지막 라인에 추가:

```ts
export * from "./cookie.js";
```

`packages/auth/package.json` `exports` 맵에 추가 (기존 `./rbac` 엔트리 아래):

```json
"./cookie": "./cookie.ts",
```

(전체 exports 블록은 아래와 같이 됨:)

```json
"exports": {
  ".": "./index.ts",
  "./types": "./types.ts",
  "./session": "./session.ts",
  "./rbac": "./rbac.ts",
  "./cookie": "./cookie.ts"
}
```

- [ ] **Step 4: 테스트 + 타입체크 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts && pnpm --filter=@jarvis/auth exec vitest run __tests__/cookie.test.ts && pnpm --filter=@jarvis/auth type-check && pnpm --filter=@jarvis/auth type-check
```

Expected: 모두 PASS (14 tests, 0 type errors).

- [ ] **Step 5: Commit**

```bash
git add packages/auth/cookie.ts packages/auth/__tests__/cookie.test.ts packages/auth/index.ts packages/auth/package.json
git commit -m "feat(auth): add buildSessionCookieOptions for shared login/logout cookie config"
```

---

## Task 3: `validateReturnUrl` (return-url.ts)

서버사이드 화이트리스트 검증. logout 라우트의 `?redirect=` 파라미터 처리에 사용.

**Files:**
- Create: `packages/auth/return-url.ts`
- Create: `packages/auth/__tests__/return-url.test.ts`
- Modify: `packages/auth/index.ts`
- Modify: `packages/auth/package.json`

- [ ] **Step 1: 실패 테스트 작성**

`packages/auth/__tests__/return-url.test.ts` 신설:

```ts
import { describe, expect, test } from "vitest";
import { validateReturnUrl } from "../return-url.js";

const ALLOWED = ["jarvis.isusystem.com", "yess.isusystem.com"] as const;
const FALLBACK = "/dashboard";

describe("validateReturnUrl", () => {
  test("returns fallback for null", () => {
    expect(validateReturnUrl(null, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for undefined", () => {
    expect(validateReturnUrl(undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for empty string", () => {
    expect(validateReturnUrl("", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes path starting with /", () => {
    expect(validateReturnUrl("/foo", ALLOWED, FALLBACK)).toBe("/foo");
  });

  test("passes path with query and hash", () => {
    expect(validateReturnUrl("/foo?x=1#bar", ALLOWED, FALLBACK)).toBe("/foo?x=1#bar");
  });

  test("rejects scheme-relative URL (//host)", () => {
    expect(validateReturnUrl("//attacker.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects backslash-prefixed path (/\\\\host)", () => {
    expect(validateReturnUrl("/\\\\attacker.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects path with control characters", () => {
    expect(validateReturnUrl("/foo\nbar", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes full https URL with whitelisted host", () => {
    const url = "https://yess.isusystem.com/dashboard";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });

  test("passes full http URL with whitelisted host", () => {
    const url = "http://yess.isusystem.com/foo";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });

  test("rejects full URL with non-whitelisted host", () => {
    expect(validateReturnUrl("https://attacker.com/foo", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects javascript: scheme", () => {
    expect(validateReturnUrl("javascript:alert(1)", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects data: scheme", () => {
    expect(
      validateReturnUrl("data:text/html,<script>alert(1)</script>", ALLOWED, FALLBACK),
    ).toBe(FALLBACK);
  });

  test("rejects malformed URL gracefully (no throw)", () => {
    expect(validateReturnUrl("not a url at all", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("preserves query string in whitelisted full URL", () => {
    const url = "https://yess.isusystem.com/path?x=1&y=2";
    expect(validateReturnUrl(url, ALLOWED, FALLBACK)).toBe(url);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/return-url.test.ts
```

Expected: FAIL ("Cannot find module '../return-url.js'").

- [ ] **Step 3: `validateReturnUrl` 구현 + re-export 추가**

`packages/auth/return-url.ts` 신설:

```ts
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
```

`packages/auth/index.ts`에 추가:

```ts
export * from "./return-url.js";
```

`packages/auth/package.json` `exports`에 추가:

```json
"./return-url": "./return-url.ts"
```

(전체 exports:)

```json
"exports": {
  ".": "./index.ts",
  "./types": "./types.ts",
  "./session": "./session.ts",
  "./rbac": "./rbac.ts",
  "./cookie": "./cookie.ts",
  "./return-url": "./return-url.ts"
}
```

- [ ] **Step 4: 테스트 + 타입체크 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/auth exec vitest run __tests__/return-url.test.ts && pnpm --filter=@jarvis/auth exec vitest run __tests__/return-url.test.ts && pnpm --filter=@jarvis/auth type-check && pnpm --filter=@jarvis/auth type-check
```

Expected: PASS (15 tests), type-check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/return-url.ts packages/auth/__tests__/return-url.test.ts packages/auth/index.ts packages/auth/package.json
git commit -m "feat(auth): add validateReturnUrl for server-side redirect whitelist"
```

---

## Task 4: `safeReturnUrl` (apps/web safe-redirect.ts)

클라이언트사이드 isomorphic 검증. 기존 `safeRedirectPath`(path-only)는 보존, 풀 URL 케이스만 추가.

**Files:**
- Modify: `apps/web/app/(auth)/login/_lib/safe-redirect.ts` (함수 추가)
- Modify: `apps/web/app/(auth)/login/_lib/safe-redirect.test.ts` (describe 추가)

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/app/(auth)/login/_lib/safe-redirect.test.ts`의 기존 `describe` 아래에 다음을 추가 (import 라인도 갱신):

```ts
// 기존 import 라인을 다음으로 교체:
import { describe, it, expect, test } from "vitest";
import { safeRedirectPath, safeReturnUrl } from "./safe-redirect";

// 기존 describe("safeRedirectPath", ...) 블록은 그대로 두고, 파일 끝에 추가:
describe("safeReturnUrl", () => {
  const ALLOWED = ["jarvis.isusystem.com", "yess.isusystem.com"] as const;
  const FALLBACK = "/dashboard";

  test("returns fallback for null", () => {
    expect(safeReturnUrl(null, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for undefined", () => {
    expect(safeReturnUrl(undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("returns fallback for empty string", () => {
    expect(safeReturnUrl("", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("delegates path to safeRedirectPath", () => {
    expect(safeReturnUrl("/foo", ALLOWED, FALLBACK)).toBe("/foo");
    expect(safeReturnUrl("/foo?x=1#bar", ALLOWED, FALLBACK)).toBe("/foo?x=1#bar");
  });

  test("rejects //host via path branch", () => {
    expect(safeReturnUrl("//evil.com", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("passes whitelisted full URL", () => {
    expect(safeReturnUrl("https://yess.isusystem.com/dashboard", ALLOWED, FALLBACK))
      .toBe("https://yess.isusystem.com/dashboard");
  });

  test("rejects non-whitelisted full URL", () => {
    expect(safeReturnUrl("https://attacker.com/foo", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects javascript: scheme", () => {
    expect(safeReturnUrl("javascript:alert(1)", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects data: scheme", () => {
    expect(safeReturnUrl("data:text/html,<x>", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });

  test("rejects malformed URL", () => {
    expect(safeReturnUrl("not a url", ALLOWED, FALLBACK)).toBe(FALLBACK);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run app/\(auth\)/login/_lib/safe-redirect
```

Expected: FAIL ("safeReturnUrl is not exported").

> Windows 셸에서 괄호 이스케이핑이 문제면 패턴을 더 단순하게: `pnpm --filter=@jarvis/web exec vitest run safe-redirect`

- [ ] **Step 3: `safeReturnUrl` 구현**

`apps/web/app/(auth)/login/_lib/safe-redirect.ts` 끝에 추가 (기존 `safeRedirectPath`는 그대로 둠):

```ts
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
```

- [ ] **Step 4: 테스트 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run safe-redirect && pnpm --filter=@jarvis/web exec vitest run safe-redirect
```

Expected: PASS (기존 케이스 + 신규 10개).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(auth)/login/_lib/safe-redirect.ts" "apps/web/app/(auth)/login/_lib/safe-redirect.test.ts"
git commit -m "feat(login): add safeReturnUrl for full-URL redirect whitelist (client side)"
```

---

## Task 5: 로그인 라우트가 `buildSessionCookieOptions` 사용

`response.cookies.set()`이 환경변수 기반 domain/secure 옵션을 갖게 한다.

**Files:**
- Modify: `apps/web/app/api/auth/login/route.ts`
- Modify: `apps/web/app/api/auth/login/route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

기존 `route.test.ts`에 다음 describe 추가 (파일 끝, 기존 `describe("/api/auth/login", ...)` 닫힘 다음):

```ts
describe("/api/auth/login - cookie options", () => {
  let originalCookieDomain: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalCookieDomain = process.env.COOKIE_DOMAIN;
    originalNodeEnv = process.env.NODE_ENV;
    vi.clearAllMocks();
    userLookupQueue.length = 0;
    roleLookupQueue.length = 0;
  });

  afterEach(() => {
    if (originalCookieDomain === undefined) delete process.env.COOKIE_DOMAIN;
    else process.env.COOKIE_DOMAIN = originalCookieDomain;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  function seedSuccessfulLogin() {
    userLookupQueue.push([{
      id: "user-1",
      workspaceId: "ws-1",
      employeeId: "EMP001",
      name: "Admin User",
      email: "admin@jarvis.dev",
      orgId: null,
    }]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);
  }

  it("Set-Cookie includes Domain when COOKIE_DOMAIN is set", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Domain=\.isusystem\.com/i);
  });

  it("Set-Cookie omits Domain when COOKIE_DOMAIN is unset", async () => {
    delete process.env.COOKIE_DOMAIN;
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  it("Set-Cookie omits Secure when NODE_ENV is not production", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.COOKIE_DOMAIN;
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toMatch(/(?:^|;\s*)Secure(?:;|$)/i);
  });
});
```

또 파일 상단의 import에 `afterEach` 추가:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run app/api/auth/login/route.test
```

Expected: 새 케이스 3개 FAIL ("Domain=.isusystem.com" 매칭 실패 — 기존 코드는 domain 옵션 미설정).

- [ ] **Step 3: 라우트 변경 — `buildSessionCookieOptions` 사용**

`apps/web/app/api/auth/login/route.ts`의 import 라인에 추가 (line 4 근처):

```ts
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
```

기존 line 81-88 (응답 + 쿠키 설정) 교체:

```ts
const response = NextResponse.json({ ok: true });
response.cookies.set(
  "sessionId",
  sessionId,
  buildSessionCookieOptions(
    {
      cookieDomain: process.env.COOKIE_DOMAIN,
      isProduction: process.env.NODE_ENV === "production",
    },
    sessionLifetimeMs,
  ),
);

return response;
```

(즉 `secure: false` 하드코딩이 사라지고 production 자동 감지로 바뀜.)

- [ ] **Step 4: 테스트 + 타입체크 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run app/api/auth/login/route.test && pnpm --filter=@jarvis/web exec vitest run app/api/auth/login/route.test && pnpm --filter=@jarvis/web type-check && pnpm --filter=@jarvis/web type-check
```

Expected: PASS (기존 4 + 신규 3 = 7 tests), type-check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/auth/login/route.ts apps/web/app/api/auth/login/route.test.ts
git commit -m "feat(login): use buildSessionCookieOptions for parent-domain cookie support"
```

---

## Task 6: 로그인 페이지에 `safeReturnUrl` 적용

풀 URL redirect(예: `https://yess.isusystem.com/...`)를 화이트리스트 호스트만 허용.

**Files:**
- Modify: `apps/web/app/(auth)/login/page.tsx`

(테스트는 Task 4의 unit test가 핵심 로직을 커버하고, page는 단순 호출. 통합 테스트는 추후 E2E.)

- [ ] **Step 1: 변경 (테스트 없이 직접 변경 — 로직은 Task 4 unit test가 커버)**

`apps/web/app/(auth)/login/page.tsx` 변경:

기존 line 7 import 라인:
```ts
import { safeRedirectPath } from './_lib/safe-redirect';
```

다음으로 교체:
```ts
import { safeReturnUrl } from './_lib/safe-redirect';
```

기존 line 19 (`redirectTo` 정의)와 line 47-49 (성공 처리) 변경:

```ts
// Before (line 19):
const redirectTo = searchParams.get('redirect') ?? '/dashboard';

// After (그대로 — 기존 line 19 유지):
const redirectTo = searchParams.get('redirect') ?? '/dashboard';
// (다음 라인 추가)
const allowedHosts = (process.env.NEXT_PUBLIC_ALLOWED_RETURN_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
```

기존 line 47-49 교체:

```ts
// Before:
const safeRedirect = safeRedirectPath(redirectTo, '/dashboard');
window.location.assign(safeRedirect);

// After:
const safeRedirect = safeReturnUrl(redirectTo, allowedHosts, '/dashboard');
window.location.assign(safeRedirect);
```

> **참고**: `process.env.NEXT_PUBLIC_*`은 Next.js에서 빌드 타임 상수로 인라인됨. 운영 배포 시 빌드 환경에 `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS=jarvis.isusystem.com,yess.isusystem.com` 설정 필요(Task 8 .env.example에 명시).

- [ ] **Step 2: 타입체크 + 빌드 검증**

```bash
pnpm --filter=@jarvis/web type-check && pnpm --filter=@jarvis/web type-check
```

Expected: 0 errors. (lint도 함께 확인)

```bash
pnpm --filter=@jarvis/web lint && pnpm --filter=@jarvis/web lint
```

Expected: 0 errors/warnings (또는 기존 baseline 유지).

- [ ] **Step 3: 기존 테스트 회귀 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run safe-redirect && pnpm --filter=@jarvis/web exec vitest run safe-redirect
```

Expected: PASS (Task 4에서 추가한 케이스 포함).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(auth)/login/page.tsx"
git commit -m "feat(login): use safeReturnUrl in login page for full-URL redirect"
```

> 5단계 TDD 패턴에서 벗어남: 페이지 컴포넌트는 통합 검증 단위라 unit test로 커버 안 함. 핵심 검증 로직은 Task 4 단위 테스트가 담당.

---

## Task 7: 로그아웃 라우트 — `?redirect=` 처리 + 도메인 일치 쿠키 클리어

**Files:**
- Modify: `apps/web/app/api/auth/logout/route.ts`
- Create: `apps/web/app/api/auth/logout/route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/app/api/auth/logout/route.test.ts` 신설:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { deleteSessionMock } = vi.hoisted(() => ({
  deleteSessionMock: vi.fn(),
}));

vi.mock("@jarvis/auth/session", () => ({
  deleteSession: deleteSessionMock,
}));

import { POST } from "./route";

function buildRequest(opts: {
  url: string;
  cookies?: Record<string, string>;
}) {
  const headers: HeadersInit = {};
  if (opts.cookies) {
    headers["cookie"] = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return new NextRequest(opts.url, { method: "POST", headers });
}

describe("/api/auth/logout", () => {
  let originalCookieDomain: string | undefined;
  let originalAllowedHosts: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalCookieDomain = process.env.COOKIE_DOMAIN;
    originalAllowedHosts = process.env.ALLOWED_RETURN_HOSTS;
  });

  afterEach(() => {
    if (originalCookieDomain === undefined) delete process.env.COOKIE_DOMAIN;
    else process.env.COOKIE_DOMAIN = originalCookieDomain;
    if (originalAllowedHosts === undefined) delete process.env.ALLOWED_RETURN_HOSTS;
    else process.env.ALLOWED_RETURN_HOSTS = originalAllowedHosts;
  });

  it("deletes session and redirects to /login when no redirect param", async () => {
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(deleteSessionMock).toHaveBeenCalledWith("sid-1");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3010/login");
  });

  it("redirects to whitelisted full URL via ?redirect=", async () => {
    process.env.ALLOWED_RETURN_HOSTS = "jarvis.isusystem.com,yess.isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout?redirect=https%3A%2F%2Fyess.isusystem.com%2Fdashboard",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("https://yess.isusystem.com/dashboard");
  });

  it("falls back to /login when redirect host is not whitelisted", async () => {
    process.env.ALLOWED_RETURN_HOSTS = "jarvis.isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout?redirect=https%3A%2F%2Fattacker.com%2F",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("http://localhost:3010/login");
  });

  it("clears sessionId cookie with Domain when COOKIE_DOMAIN is set", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/sessionId=;/i);
    expect(setCookie).toMatch(/Domain=\.isusystem\.com/i);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("clears legacy jarvis_session cookie with same domain", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { jarvis_session: "legacy-1" },
    });

    const response = await POST(request);

    expect(deleteSessionMock).toHaveBeenCalledWith("legacy-1");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/jarvis_session=;/i);
  });

  it("does not call deleteSession when no cookie is present", async () => {
    const request = buildRequest({ url: "http://localhost:3010/api/auth/logout" });

    const response = await POST(request);

    expect(deleteSessionMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run app/api/auth/logout/route.test
```

Expected: 모두 FAIL (현재 logout 라우트는 redirect 파라미터 미지원, domain 옵션 미설정).

- [ ] **Step 3: 라우트 구현 변경**

`apps/web/app/api/auth/logout/route.ts` 전체 교체:

```ts
import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@jarvis/auth/session";
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
import { validateReturnUrl } from "@jarvis/auth/return-url";

export async function POST(request: NextRequest) {
  const sessionId =
    request.cookies.get("sessionId")?.value ??
    request.cookies.get("jarvis_session")?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const url = new URL(request.url);
  const redirectRaw = url.searchParams.get("redirect");
  const allowedHosts = (process.env.ALLOWED_RETURN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = new URL("/login", request.url).toString();
  const target = validateReturnUrl(redirectRaw, allowedHosts, fallback);

  const response = NextResponse.redirect(target);

  // 쿠키 삭제도 발급과 같은 domain 옵션을 명시해야 브라우저가 부모 도메인 쿠키를 제거함.
  // cookies.delete()는 호스트 한정 동작이라 부모 도메인 쿠키가 남는 버그 방지.
  const cookieOpts = buildSessionCookieOptions(
    {
      cookieDomain: process.env.COOKIE_DOMAIN,
      isProduction: process.env.NODE_ENV === "production",
    },
    0,
  );
  response.cookies.set("sessionId", "", cookieOpts);
  response.cookies.set("jarvis_session", "", cookieOpts);

  return response;
}
```

- [ ] **Step 4: 테스트 + 타입체크 2회 연속 — 통과 확인**

```bash
pnpm --filter=@jarvis/web exec vitest run app/api/auth/logout/route.test && pnpm --filter=@jarvis/web exec vitest run app/api/auth/logout/route.test && pnpm --filter=@jarvis/web type-check && pnpm --filter=@jarvis/web type-check
```

Expected: PASS (6 tests), type-check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/auth/logout/route.ts apps/web/app/api/auth/logout/route.test.ts
git commit -m "feat(logout): support ?redirect= whitelist + domain-aware cookie clear"
```

---

## Task 8: `.env.example` 환경변수 추가

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 변경**

`.env.example`의 `# Auth` 섹션 (검색: `# Auth`) 아래에 다음 블록 추가:

```dotenv

# === SSO (Yess 등 서브도메인 앱과 세션 공유) ===
# 부모 도메인 쿠키 발급용. 운영 예: ".isusystem.com" (앞 점 필수, 라벨 ≥ 2)
# 비워두면 호스트 한정 쿠키 (기존 동작 유지). 개발/단일 앱 운영에선 비워둔다.
# 잘못된 값(예: ".com")은 부팅 시 throw로 막힌다 (validateCookieDomain).
COOKIE_DOMAIN=

# 로그인/로그아웃의 ?redirect= 파라미터 화이트리스트 (콤마 구분 host)
# 운영 예: "jarvis.isusystem.com,yess.isusystem.com"
# 비어 있으면 path-only redirect만 허용 (외부 호스트 거부, fallback)
ALLOWED_RETURN_HOSTS=

# 위와 동일한 값을 클라이언트 번들(로그인 페이지)에도 노출.
# Next.js의 NEXT_PUBLIC_* 은 빌드 타임에 인라인됨 — 운영 빌드 환경변수에 같은 값을 박는다.
NEXT_PUBLIC_ALLOWED_RETURN_HOSTS=
```

- [ ] **Step 2: 검증**

`.env.example` 파일에 위 블록이 들어갔는지 그리고 기존 `# App` 섹션 등이 깨지지 않았는지 시각적으로 확인:

```bash
grep -A 2 "COOKIE_DOMAIN" .env.example
grep -A 2 "ALLOWED_RETURN_HOSTS" .env.example
```

Expected: 각 변수 1회 등장.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): document SSO env vars (COOKIE_DOMAIN, ALLOWED_RETURN_HOSTS)"
```

---

## Task 9: Yess 개발자 인계 가이드 발행

**Files:**
- Create: `docs/integrations/yess-sso-handover.md`

- [ ] **Step 1: 디렉토리 생성 + 가이드 작성**

```bash
mkdir -p docs/integrations
```

`docs/integrations/yess-sso-handover.md` 신설:

```markdown
# Yess ↔ Jarvis 인증 통합 가이드

> Yess(별도 레포·서버)에서 Jarvis 세션을 공유받아 인증을 수행하기 위한 통합 가이드.
> Jarvis 측 변경 PR 머지 후 Yess 팀에 그대로 전달.

## 1. 컨텍스트

- Yess는 사내 업무 시스템 Jarvis와 **같은 Postgres DB**·**같은 사용자 풀**을 공유합니다.
- 로그인 UI/로그아웃은 Jarvis 단독 책임. Yess는 세션 검증과 권한 체크만 합니다.
- 새 user 테이블/회원가입 라우트 신설 금지.

## 2. 도메인 / 쿠키

- Jarvis: `https://jarvis.isusystem.com`
- Yess: `https://yess.isusystem.com`
- 쿠키 `sessionId`는 부모 도메인 `.isusystem.com`에 발급되어 양쪽 자동 공유됩니다.
- `httpOnly`, `secure`(운영), `sameSite=lax`. TTL 8시간(기본) / 30일(keepSignedIn).

## 3. 환경변수 (Yess 레포)

```dotenv
DATABASE_URL=postgresql://...                    # Jarvis와 동일 인스턴스
COOKIE_DOMAIN=.isusystem.com                     # 검증/리다이렉트 시 참조 (Yess가 발급은 안 함)
JARVIS_LOGIN_URL=https://jarvis.isusystem.com/login
JARVIS_LOGOUT_URL=https://jarvis.isusystem.com/api/auth/logout
ALLOWED_RETURN_HOSTS=jarvis.isusystem.com,yess.isusystem.com
```

## 4. 미들웨어 의사코드 (모든 보호 라우트)

```ts
async function requireSession(req: Request) {
  const sessionId = getCookie(req, "sessionId");
  if (!sessionId) return redirectToJarvisLogin(req);

  const row = await db.execute(
    `SELECT data, expires_at FROM user_session
     WHERE id = $1 AND expires_at > NOW()
     LIMIT 1`,
    [sessionId],
  );
  if (!row) return redirectToJarvisLogin(req);

  const session = row.data as JarvisSession;
  return session;
}

function redirectToJarvisLogin(req: Request) {
  const ret = encodeURIComponent(req.url);
  return Response.redirect(
    `${process.env.JARVIS_LOGIN_URL}?redirect=${ret}`,
    302,
  );
}
```

## 5. `JarvisSession` 타입 (복사 — Jarvis `packages/auth/types.ts` 단일 소스)

```ts
export interface JarvisSession {
  userId: string;
  workspaceId: string;
  employeeId: string | null;
  email: string;
  name?: string;
  roles: string[];          // ["ADMIN" | "MANAGER" | "DEVELOPER" | "VIEWER" | "CONTRACTOR"]
  permissions: string[];    // 예: ["knowledge:read", "project:write"] — Jarvis 글로벌 권한 34개 중 일부
  orgId?: string;
  createdAt: number;        // epoch ms
  expiresAt: number;        // epoch ms
}
```

> ⚠️ Jarvis 측에서 변경되면 PR/공지를 통해 동기화. `user_session.data` JSONB 구조 변경은 Yess에 직접 영향.

## 6. DB 접근 규칙 (개발 규약)

- `user_session`, `user`, `user_role`, `role` 테이블에 **INSERT/UPDATE/DELETE 금지**. SSoT는 Jarvis. (DB-level 강제는 안 함, 개발 규약)
- Yess만의 활동 로그·메뉴 권한 등은 `yess_*` 접두 자체 테이블 신설.

## 7. 절대 만들지 말 것

- `/api/auth/login`, `/api/auth/signup` 같은 인증 발급 라우트
- 자체 비밀번호 검증·해싱
- `sessionId` 쿠키 직접 set/clear (로그아웃은 `JARVIS_LOGOUT_URL?redirect=...`로 리다이렉트)
- 자체 user 테이블 / 회원가입 흐름

## 8. Yess 전용 권한

- `JarvisSession.permissions[]`에는 **Jarvis 글로벌 권한만** 포함됩니다.
- Yess 메뉴별 권한(예: `yess:menu_a:read`)은 Yess가 자체 매핑:
  - 옵션 a: Yess 자체 `yess_role_permission` 테이블 (role_code, permission_code)
  - 옵션 b: 코드 상수로 ROLE → permissions 정적 매핑
- 매핑 키는 `JarvisSession.roles[]` 또는 `userId`.

## 9. 로그아웃 흐름

Yess의 로그아웃 버튼은 다음과 같이:

```ts
const ret = encodeURIComponent(window.location.href);
window.location.href = `${JARVIS_LOGOUT_URL}?redirect=${ret}`;
```

흐름:
1. Yess 로그아웃 버튼 클릭 → `jarvis.isusystem.com/api/auth/logout?redirect=https://yess.isusystem.com/<현재경로>`
2. Jarvis가 세션 삭제 + 쿠키 클리어
3. `https://yess.isusystem.com/<현재경로>`로 302
4. Yess 미들웨어가 미인증 감지 → `https://jarvis.isusystem.com/login?redirect=https://yess.isusystem.com/<현재경로>`로 302
5. 사용자가 Jarvis 로그인 페이지를 봄
6. 재로그인 성공 → 자동으로 `https://yess.isusystem.com/<현재경로>`로 복귀 ✓

## 10. 보안 체크리스트

- [ ] `redirect` 파라미터는 `ALLOWED_RETURN_HOSTS` 화이트리스트 검증 (open redirect 방지)
- [ ] 미들웨어를 모든 보호 라우트 + RSC 컴포넌트 진입점에 적용
- [ ] 쿠키 직접 발급/수정 금지
- [ ] `expires_at > NOW()` 조건 누락 금지
- [ ] DB 쓰기 금지 (개발 규약 준수)

## 11. 스키마 변경 커뮤니케이션

- `user_session.data` JSONB 구조 변경 → Yess 영향. Jarvis 팀에서 변경 전 공지 + 양 레포 동시 PR.
- `user`/`role` 컬럼 **추가**는 Yess가 무시하면 OK.
- 컬럼 **삭제**/타입 변경 → 사전 합의 필수.

## 12. 개발 환경 주의

- `localhost:3010`(Jarvis) / `localhost:3011`(Yess)는 부모 도메인 쿠키 공유 안 됨. 개발에선 호스트 한정 쿠키로 폴백되어 SSO가 동작하지 않습니다 (각자 로그인 필요).
- SSO는 운영(`.isusystem.com` 도메인) 배포에서만 동작합니다.

## 13. 참조 구현 (Jarvis 코드)

- 쿠키 옵션: `packages/auth/cookie.ts` (`buildSessionCookieOptions`)
- Return URL 검증: `packages/auth/return-url.ts` (`validateReturnUrl`)
- 로그인 페이지: `apps/web/app/(auth)/login/page.tsx`
- 로그인 라우트: `apps/web/app/api/auth/login/route.ts`
- 로그아웃 라우트: `apps/web/app/api/auth/logout/route.ts`
```

- [ ] **Step 2: 검증**

```bash
ls -la docs/integrations/yess-sso-handover.md
```

Expected: 파일 존재, 0 bytes 아님.

- [ ] **Step 3: Commit**

```bash
git add docs/integrations/yess-sso-handover.md
git commit -m "docs(integrations): add Yess–Jarvis SSO handover guide"
```

---

## Final Verification

모든 task 완료 후 전체 검증 (각 명령 2회 연속):

- [ ] **전체 타입체크**

```bash
pnpm type-check && pnpm type-check
```

Expected: 0 errors.

- [ ] **전체 테스트**

```bash
pnpm test && pnpm test
```

Expected: 모든 테스트 PASS.

- [ ] **전체 lint**

```bash
pnpm lint && pnpm lint
```

Expected: 0 errors (기존 baseline 유지).

- [ ] **커밋 로그 확인**

```bash
git log --oneline main..HEAD
```

Expected: spec 2개 + 본 plan의 task 9개 = 11+ commits, 깔끔한 atomic 단위.

---

## 운영 배포 체크리스트 (본 PR 머지 후)

본 PR이 머지되어도 운영 환경에서 SSO가 동작하려면 환경변수가 설정되어야 합니다:

- [ ] 운영 빌드 환경에 `COOKIE_DOMAIN=.isusystem.com` 설정
- [ ] 운영 빌드 환경에 `ALLOWED_RETURN_HOSTS=jarvis.isusystem.com,yess.isusystem.com` 설정
- [ ] 운영 빌드 환경에 `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS=jarvis.isusystem.com,yess.isusystem.com` 설정 (빌드 타임 인라인)
- [ ] Yess 팀에 `docs/integrations/yess-sso-handover.md` 전달
- [ ] 첫 배포 후 production cookies 확인: 로그인 → DevTools → `sessionId` 쿠키의 `Domain` 컬럼이 `.isusystem.com`인지

배포 후 첫 사용자 로그인부터 부모 도메인 쿠키가 발급되며, 기존 호스트 한정 쿠키는 만료 시 자연 정리됩니다 (강제 로그아웃 불필요).
