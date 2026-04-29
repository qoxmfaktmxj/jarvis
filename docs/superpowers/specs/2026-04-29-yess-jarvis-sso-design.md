# Yess–Jarvis 인증 통합 (서브도메인 SSO) — 2026-04-29

| | |
|---|---|
| **Status** | Draft — awaiting user review |
| **Owner** | Minseok Kim |
| **Scope** | Jarvis (`apps/web`) — 부모 도메인 쿠키 발급 / return URL 처리 / Yess 인계 가이드 |
| **Out-of-scope repo** | Yess 자체 코드 (별도 레포·별도 서버, DB만 공유) |
| **References** | `apps/web/app/api/auth/login/route.ts`, `apps/web/app/api/auth/logout/route.ts`, `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/login/_lib/safe-redirect.ts`, `packages/auth/{index,session,types,rbac}.ts` |
| **Brainstorm Q&A** | 본 문서 §3 |

## 1. Purpose

Yess는 Jarvis와 **같은 사내 직원 풀**을 대상으로 하는 별도 시스템(별도 레포·별도 서버)이다. Postgres DB만 공유한다. 본 변경의 목표:

1. 사용자가 한 번 Jarvis에 로그인하면 `yess.회사.com`(서브도메인)에서도 추가 로그인 없이 접근 가능
2. 로그인 UI/세션 발급 책임을 **Jarvis 한 곳에 응집** (Yess는 검증만)
3. Yess 개발자가 cold-start로 받아 바로 작업할 수 있는 **인계 가이드 발행**
4. Yess가 별도 레포라도 코드 의존성 0 — 인증 데이터는 DB SELECT, 타입만 복사

## 2. In-scope / Out-of-scope

**In-scope (이 PR)**

- `apps/web/app/api/auth/login/route.ts` — 쿠키 발급 시 `domain` 옵션을 환경변수(`COOKIE_DOMAIN`) 기반으로 조건부 적용
- `apps/web/app/api/auth/logout/route.ts` — 쿠키 클리어 시 같은 `domain` 적용 + `?return=` 화이트리스트 리다이렉트 지원
- `apps/web/app/(auth)/login/_lib/safe-redirect.ts` — 새 함수 `safeReturnUrl(raw, allowedHosts, fallback)` 추가 (path 또는 화이트리스트 호스트의 풀 URL만 통과)
- `apps/web/app/(auth)/login/page.tsx` — 로그인 성공 후 `safeReturnUrl()` 사용해 풀 URL redirect 허용 (`yess.회사.com/...` 등)
- `packages/auth/cookie.ts` 신설 — `buildSessionCookieOptions(env, lifetimeMs)` 단일 소스 (login/logout이 공유)
- `packages/auth/return-url.ts` 신설 — `validateReturnUrl(raw, allowedHosts, fallback)` 서버사이드 검증 (logout 라우트 등에서 사용)
- `.env.example` — `COOKIE_DOMAIN`, `ALLOWED_RETURN_HOSTS` 신설 + 주석
- `docs/integrations/yess-sso-handover.md` 신설 — Yess 개발자 인계 가이드 (전문)
- 단위 테스트: `safe-redirect.test.ts` 확장, `packages/auth/return-url.test.ts` 신설, `packages/auth/cookie.test.ts` 신설
- 통합 테스트: 로그인 라우트가 `COOKIE_DOMAIN` 설정 시 응답 `Set-Cookie`에 Domain 옵션을 포함하는지

**Out-of-scope (후속 작업으로 분리)**

- Yess 레포 자체 코드 (별도 인계, 본 문서 §10 가이드 적용)
- Yess READ-ONLY Postgres user 생성 (DBA 작업)
- JWT 마이그레이션 (현행 DB 세션 유지 — 변경 이유 없음)
- 통합 인증 도메인(`auth.회사.com`) 신설 (3번째 앱 추가 시 재검토)
- OAuth/SAML 외부 IDP 연동
- Yess 메뉴별 권한 코드 추가 (Yess 자체 정의 — 본 PR 변경 0)
- CSRF 토큰 도입 (현재 미구현, 본 PR 외)
- 운영 비밀번호 해싱(bcrypt) 도입 (현재 임시 dev-accounts 기반, 별도 PR)

## 3. Locked decisions (브레인스토밍 Q1–Q4)

| # | 결정 | 요약 |
|---|---|---|
| Q1 | **사용자 풀** | Jarvis `user` 테이블 100% 공유. Yess는 새 user 테이블/회원가입 신설 금지. 일부 직원이 일부 메뉴만 보는 차등 가시성은 RBAC 권한 추가로 해결 |
| Q2 | **도메인 구조** | 같은 등록 도메인 하위 서브도메인 (`jarvis.회사.com` / `yess.회사.com`). 부모 도메인(`.회사.com`)에 쿠키 발급하여 자동 공유 |
| Q3 | **로그인 진입점** | Jarvis 단독. Yess는 미인증 시 `jarvis.회사.com/login?redirect=<full-url>`로 302 |
| Q4 | **코드베이스** | Yess 별도 레포·별도 서버. `packages/auth` 직접 임포트 불가. 인증 데이터는 Postgres SELECT, `JarvisSession` 타입(~30줄) 복사 |

## 4. Architecture

### 4.1 전체 흐름 (콜드 진입)

```
[Browser]
  | (1) yess.회사.com/dashboard 직접 접근 (쿠키 없음)
  v
[Yess App] 미들웨어
  | sessionId 쿠키 없음 → 인증 필요
  | (2) 302 → jarvis.회사.com/login?redirect=https%3A%2F%2Fyess.회사.com%2Fdashboard
  v
[Jarvis App]
  | (3) 로그인 폼 (redirect 쿼리 보존)
  | (4) POST /api/auth/login → user_session INSERT
  | (5) Set-Cookie: sessionId=<id>; Domain=.회사.com; Path=/; HttpOnly; SameSite=Lax
  | (6) 클라이언트가 safeReturnUrl(redirect, ALLOWED_RETURN_HOSTS) 통과 검증 후 location.assign
  v
[Browser]
  | (7) yess.회사.com/dashboard 재요청 (쿠키 자동 attach)
  v
[Yess App] 미들웨어
  | SELECT user_session WHERE id=$1 AND expires_at > NOW()
  | → 통과
```

### 4.2 컴포넌트 책임 매트릭스

| 컴포넌트 | 책임 | 본 PR 변경 |
|---|---|---|
| `apps/web/app/api/auth/login/route.ts` | 자격 검증·세션 생성·쿠키 발급 | **변경** (domain 옵션) |
| `apps/web/app/api/auth/logout/route.ts` | 세션 무효화·쿠키 클리어·return 리다이렉트 | **변경** (domain + return) |
| `apps/web/app/(auth)/login/page.tsx` | 로그인 폼·redirect 쿼리 보존·성공 시 location.assign | **변경** (full-URL redirect 지원) |
| `apps/web/app/(auth)/login/_lib/safe-redirect.ts` | 클라이언트사이드 redirect URL 검증 | **변경** (`safeReturnUrl` 추가) |
| `packages/auth/cookie.ts` | 세션 쿠키 옵션 단일 소스 | **신설** |
| `packages/auth/return-url.ts` | 서버사이드 return URL 화이트리스트 검증 | **신설** |
| `.env.example` | 환경변수 문서 | **변경** |
| `docs/integrations/yess-sso-handover.md` | Yess 개발자 인계 가이드 | **신설** |
| Yess 미들웨어 (별도 레포) | 쿠키 검증·미인증 시 Jarvis로 302 | **별도 PR** |
| Postgres `user_session` | 세션 SSoT (Jarvis만 INSERT/UPDATE/DELETE) | 변경 없음 |

### 4.3 쿠키 옵션 (변경 후)

`packages/auth/cookie.ts`의 `buildSessionCookieOptions()`가 단일 소스. login/logout 양쪽이 같은 함수 사용.

```ts
// packages/auth/cookie.ts (신설)
export interface SessionCookieEnv {
  cookieDomain?: string;       // process.env.COOKIE_DOMAIN
  isProduction: boolean;       // process.env.NODE_ENV === 'production'
}

export function buildSessionCookieOptions(
  env: SessionCookieEnv,
  lifetimeMs: number,
) {
  const opts: Record<string, unknown> = {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(lifetimeMs / 1000),
  };
  if (env.cookieDomain && env.cookieDomain.length > 0) {
    opts.domain = env.cookieDomain;
  }
  return opts;
}
```

운영(`.회사.com` 설정 시) → `Domain=.회사.com` 포함 / 개발(`COOKIE_DOMAIN` 미설정) → `domain` 옵션 미포함 (호스트 한정 폴백, 기존 동작).

### 4.4 Return URL 검증

**클라이언트사이드** (`safe-redirect.ts`에 함수 추가, `page.tsx`에서 사용):

```ts
// 기존 safeRedirectPath()는 그대로 — 같은 도메인 path 전용
// 신규 safeReturnUrl() — path 또는 화이트리스트 호스트의 풀 URL 모두 통과
export function safeReturnUrl(
  raw: string | null | undefined,
  allowedHosts: readonly string[],
  fallback: string,
): string {
  if (!raw) return fallback;
  // path-only는 기존 검증으로 위임
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return safeRedirectPath(raw, fallback);
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    if (!allowedHosts.includes(url.host)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}
```

**서버사이드** (`packages/auth/return-url.ts` 신설, logout 라우트에서 사용):

```ts
export function validateReturnUrl(
  raw: string | null | undefined,
  allowedHosts: readonly string[],
  fallback: string,
): string {
  // 동일 로직, isomorphic. URL은 node + browser 양쪽 동작.
}
```

`safe-redirect.ts`(클라이언트사이드 중심) vs `packages/auth/return-url.ts`(서버사이드 + Yess 인계 참조 구현) 두 곳에 두는 이유: 클라이언트 번들에 `packages/auth` 전체를 끌어들이지 않기 위함. 로직은 동일하게 유지하고, 한 PR 내에서 두 파일이 같은 테스트 케이스를 공유하도록 한다.

### 4.5 환경변수 변경

`.env.example`에 추가:

```dotenv
# === SSO (Yess 등 서브도메인 앱과 세션 공유) ===
# 부모 도메인 쿠키 발급용. 운영 예: ".회사.com" (앞 점 필수)
# 비워두면 호스트 한정 쿠키 (기존 동작 유지). 개발/단일 앱 운영 시 비워둔다.
COOKIE_DOMAIN=

# 로그인/로그아웃의 ?redirect= 파라미터 화이트리스트 (콤마 구분 host)
# 운영 예: "jarvis.회사.com,yess.회사.com"
# 비어 있으면 path-only redirect만 허용 (외부 호스트 거부, fallback)
ALLOWED_RETURN_HOSTS=
```

운영 배포 시 두 값을 동시에 설정. 개발 로컬(`localhost:3010`)은 기본값(빈 문자열) 그대로 → 호스트 한정 쿠키, path-only redirect.

## 5. 상세 변경 사항

### 5.1 `apps/web/app/api/auth/login/route.ts`

현재 (line 82-88):
```ts
response.cookies.set("sessionId", sessionId, {
  httpOnly: true,
  secure: false,
  maxAge: Math.floor(sessionLifetimeMs / 1000),
  sameSite: "lax",
  path: "/",
});
```

변경 후:
```ts
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
// ...
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
```

부수 효과: `secure` 옵션이 기존 `false` 하드코딩에서 `NODE_ENV === 'production'` 기반으로 바뀜 → **운영에선 자동으로 `Secure` 플래그 활성**(보안 강화). 개발은 그대로 false. 이는 의도된 개선.

### 5.2 `apps/web/app/api/auth/logout/route.ts`

변경 후:
```ts
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

  const returnRaw = new URL(request.url).searchParams.get("redirect");
  const allowedHosts = (process.env.ALLOWED_RETURN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = new URL("/login", request.url).toString();
  const target = validateReturnUrl(returnRaw, allowedHosts, fallback);

  const response = NextResponse.redirect(target);
  // 쿠키 삭제도 발급과 같은 domain 옵션 사용해야 브라우저가 제대로 제거함
  const cookieOpts = buildSessionCookieOptions(
    {
      cookieDomain: process.env.COOKIE_DOMAIN,
      isProduction: process.env.NODE_ENV === "production",
    },
    0,
  );
  response.cookies.set("sessionId", "", { ...cookieOpts, maxAge: 0 });
  response.cookies.set("jarvis_session", "", { ...cookieOpts, maxAge: 0 });
  return response;
}
```

핵심: 쿠키 삭제는 발급과 **동일한 `domain` 옵션**을 명시해야 브라우저가 부모 도메인 쿠키를 제대로 제거한다. 단순 `cookies.delete()`는 호스트 한정으로 동작해 부모 도메인 쿠키가 남는 버그를 만든다.

### 5.3 `apps/web/app/(auth)/login/page.tsx`

현재 (line 19, 48):
```ts
const redirectTo = searchParams.get('redirect') ?? '/dashboard';
// ...
const safeRedirect = safeRedirectPath(redirectTo, '/dashboard');
window.location.assign(safeRedirect);
```

변경 후:
```ts
const redirectTo = searchParams.get('redirect') ?? '/dashboard';
const allowedHosts = (process.env.NEXT_PUBLIC_ALLOWED_RETURN_HOSTS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
// ...
const safeRedirect = safeReturnUrl(redirectTo, allowedHosts, '/dashboard');
window.location.assign(safeRedirect);
```

⚠️ **환경변수 노출**: 클라이언트에서 화이트리스트를 알아야 하므로 `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS`로 별도 노출. 서버는 `ALLOWED_RETURN_HOSTS`(비퍼블릭). **`.env.example`에 둘 다 명시 + 운영 배포 시 같은 값 설정**.

대안: 클라이언트에서 풀 URL redirect를 만들지 않고, 서버가 응답 body에 검증된 `redirectUrl`을 담아 반환. 이 경우 `route.ts`도 검증 책임을 가져야 함. **이번 PR에서는 클라이언트 검증 채택** — 기존 흐름과 일관, 추가 라운드트립 없음. 서버 검증은 logout 라우트에만 적용.

### 5.4 `_lib/safe-redirect.ts`

기존 `safeRedirectPath()`는 그대로 유지(다른 호출처가 path-only 의미를 기대). 새 함수 `safeReturnUrl()`을 같은 파일에 추가.

### 5.5 `packages/auth/cookie.ts`, `packages/auth/return-url.ts`

위 §4.3, §4.4 코드를 신설. `packages/auth/index.ts`의 re-export에 추가:

```ts
export * from "./cookie.js";
export * from "./return-url.js";
```

## 6. 마이그레이션 / 호환성

- DB 스키마 변경 **없음**
- 기존 `sessionId` 쿠키는 호스트 한정으로 발급되어 있음. 운영 배포 후 첫 로그인부터 `Domain=.회사.com`로 발급, 기존 호스트 한정 쿠키는 만료 시 자연 정리
- 강제 로그아웃 불필요
- **개발 환경**: `COOKIE_DOMAIN` 미설정 → 기존 동작 그대로(호스트 한정 쿠키)
- **레거시 `jarvis_session` 쿠키**: logout이 양쪽 다 클리어하던 기존 동작 유지

## 7. 보안 고려사항

| 위협 | 대응 |
|---|---|
| Open redirect (`?redirect=https://악성.com/phish`) | `safeReturnUrl` / `validateReturnUrl` 화이트리스트 검증 후 부적합 시 fallback |
| `?redirect=//악성.com` (스킴-relative) | 기존 `safeRedirectPath`에서 차단 (변경 없음) |
| `?redirect=javascript:...` | URL 객체 파싱 시 `protocol`이 `http(s):`가 아니면 reject |
| 쿠키 도메인 과확장 (`Domain=.com`) | 환경변수 검증 시 도메인 토큰 ≥ 2 (점 포함) 권장 — 본 PR에선 운영 환경 설정자 책임으로 위임, 코드에는 문서로만 경고. (자동 검증은 §11 후속 검토) |
| Yess가 user_session 쓰기 | 인계 가이드에 명시 금지 + DBA가 READ-ONLY user 생성 (별도 후속 작업) |
| Yess가 자체 쿠키 발급 | 인계 가이드에 명시 금지 |
| 세션 데이터 JSONB 스키마 drift | `JarvisSession` 타입을 `packages/auth/types.ts` 단일 소스 유지, 변경 PR엔 "Yess 영향 있음" 라벨 + 인계 가이드 §스키마 변경 항목 |
| `Secure` 플래그 누락 (HTTP 전송) | 본 PR에서 운영(`NODE_ENV=production`) 자동 활성으로 개선 |
| CSRF (POST /login) | 본 PR 범위 외 (현 코드와 동일, 별도 PR로 분리) |

## 8. 테스트 전략

**TDD 순서**: 검증 함수 → 쿠키 빌더 → 라우트 통합.

### 8.1 단위 테스트

- `packages/auth/__tests__/cookie.test.ts` 신설
  - `cookieDomain` 미설정 시 결과에 `domain` 키 없음
  - `cookieDomain=".회사.com"` 시 결과 `domain === ".회사.com"`
  - `isProduction=true`일 때 `secure: true`
  - `lifetimeMs` → `maxAge` 변환 (ms → s, floor)
- `packages/auth/__tests__/return-url.test.ts` 신설
  - null/empty → fallback
  - path 시작(`/foo`) → 그대로 통과
  - `//host`, `/\\host` → fallback (스킴-relative 차단)
  - 풀 URL + 화이트리스트 호스트 → 통과
  - 풀 URL + 비화이트리스트 호스트 → fallback
  - `javascript:` / `data:` 스킴 → fallback
  - malformed URL → fallback (예외 안 던짐)
- `apps/web/app/(auth)/login/_lib/safe-redirect.test.ts` 확장
  - 기존 `safeRedirectPath` 케이스 유지
  - 새 `safeReturnUrl` 케이스 위와 동일

### 8.2 통합 테스트

- `apps/web/app/api/auth/login/route.test.ts` 확장
  - `COOKIE_DOMAIN` 환경변수 설정 시 응답 `Set-Cookie` 헤더에 `Domain=.회사.com` 포함
  - 미설정 시 Domain 옵션 없음
  - `NODE_ENV=production` 시 `Secure` 플래그 포함
- `apps/web/app/api/auth/logout/route.test.ts` 신설(없으면)
  - `?redirect=https://yess.회사.com/foo` + 화이트리스트 매칭 시 해당 URL로 302
  - 비화이트리스트 호스트 시 `/login` fallback
  - `Set-Cookie`로 `sessionId=; Max-Age=0; Domain=.회사.com` 발행 (도메인 일치)

### 8.3 E2E (Playwright, 선택)

이번 PR에선 추가 안 함. Yess 레포에서 통합 검증 시 도입.

### 8.4 CLAUDE.md 규칙: **테스트는 2회 연속 실행**

`pnpm test`, `pnpm type-check` 등 검증 명령은 `&&` 연쇄로 2회 (flaky 차단).

## 9. 영향도 체크 (jarvis-architecture 17계층)

| 계층 | 영향 | 비고 |
|---|---|---|
| L1 schema (Drizzle) | ❌ | 스키마 변경 없음 |
| L2 packages/auth | ✅ | cookie.ts / return-url.ts 신설, types/session 변경 없음 |
| L3 packages/db | ❌ | |
| L4 wiki-fs / wiki-agent | ❌ | |
| L5 ai (Ask AI) | ❌ | |
| L6 RBAC matrix | ❌ | 권한 코드 추가 없음 (Yess 자체 정의) |
| L7 apps/web routes | ✅ | login/logout 라우트, login page |
| L8 RSC boundary | ❌ | client-only 변경 없음 (page는 이미 'use client') |
| L9 i18n | ❌ | UI 문자열 변경 없음 |
| L10 worker | ❌ | |
| L11 middleware | ❌ | Jarvis 미들웨어는 변경 없음 (Yess 미들웨어는 별도 레포) |
| L12 .env.example | ✅ | COOKIE_DOMAIN, ALLOWED_RETURN_HOSTS 추가 |
| L13 tests | ✅ | 단위·통합 테스트 추가 |
| L14 docs | ✅ | docs/integrations/yess-sso-handover.md 신설 |
| L15 hooks/CI | ❌ | |
| L16 deploy infra | ⚠️ | 운영 환경변수 설정 필요(배포 체크리스트에 포함) |
| L17 외부 시스템 | ⚠️ | Yess 레포(별도 후속 작업) |

## 10. Yess 개발자 인계 가이드 (`docs/integrations/yess-sso-handover.md` 발행 내용)

> 본 spec과 별도로 `docs/integrations/yess-sso-handover.md`를 신설하여 Yess 팀에 그대로 전달. 아래는 가이드 본문 골자.

### 10.1 컨텍스트

- Yess는 사내 업무 시스템 Jarvis와 **같은 Postgres DB**·**같은 사용자 풀** 공유
- 로그인 UI/로그아웃은 Jarvis 단독 책임. Yess는 세션 검증과 권한 체크만 함
- 새 user 테이블/회원가입 라우트 신설 금지

### 10.2 도메인·쿠키

- Jarvis: `https://jarvis.회사.com`
- Yess: `https://yess.회사.com`
- 쿠키 `sessionId`는 부모 도메인 `.회사.com`에 발급되어 양쪽 자동 공유

### 10.3 환경변수 (Yess 레포)

```dotenv
DATABASE_URL=postgresql://...        # Jarvis와 동일 인스턴스, READ-ONLY user 권장
COOKIE_DOMAIN=.회사.com              # 검증/리다이렉트 시 참조 (Yess가 발급은 안 함)
JARVIS_LOGIN_URL=https://jarvis.회사.com/login
JARVIS_LOGOUT_URL=https://jarvis.회사.com/api/auth/logout
ALLOWED_RETURN_HOSTS=jarvis.회사.com,yess.회사.com
```

### 10.4 미들웨어 의사코드

```ts
async function requireSession(req) {
  const sessionId = req.cookies.get('sessionId')?.value;
  if (!sessionId) return redirectToJarvisLogin(req);

  const row = await db.execute(
    `SELECT data, expires_at FROM user_session
     WHERE id = $1 AND expires_at > NOW() LIMIT 1`,
    [sessionId],
  );
  if (!row) return redirectToJarvisLogin(req);

  const session: JarvisSession = row.data;
  return session;
}

function redirectToJarvisLogin(req) {
  const ret = encodeURIComponent(req.url);
  return Response.redirect(`${JARVIS_LOGIN_URL}?redirect=${ret}`, 302);
}
```

### 10.5 `JarvisSession` 타입 (복사)

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

> ⚠️ 이 타입은 Jarvis `packages/auth/types.ts`의 단일 소스에서 복사한 것. Jarvis 측에서 변경되면 별도 PR/공지를 통해 동기화한다.

### 10.6 DB 접근 규칙

- `user_session`, `user`, `user_role`, `role` 테이블에 **INSERT/UPDATE/DELETE 금지**. SSoT는 Jarvis.
- Yess만의 활동 로그 등은 `yess_*` 접두 자체 테이블 신설.
- 별도 DB user 생성 후 SELECT 권한만 grant 권장.

### 10.7 절대 만들지 말 것

- `/api/auth/login`, `/api/auth/signup` 같은 인증 발급 라우트
- 자체 비밀번호 검증·해싱
- `sessionId` 쿠키 직접 set/clear (로그아웃은 `JARVIS_LOGOUT_URL?redirect=...`로 리다이렉트)

### 10.8 Yess 전용 권한

- `JarvisSession.permissions[]`에는 Jarvis 글로벌 권한만 포함
- Yess 메뉴별 권한(예: `yess:menu_a:read`)은 Yess 자체 매핑 (자체 `yess_role_permission` 테이블 또는 코드 상수)
- 매핑 키는 `JarvisSession.roles[]` 또는 `userId`

### 10.9 보안 체크리스트

- [ ] `redirect` 파라미터는 `ALLOWED_RETURN_HOSTS` 화이트리스트 검증 (open redirect 방지)
- [ ] 미들웨어를 모든 보호 라우트 + RSC 컴포넌트 진입점에 적용
- [ ] DB 커넥션은 READ-ONLY user 사용
- [ ] 쿠키 직접 발급/수정 금지
- [ ] `expires_at > NOW()` 조건 누락 금지

### 10.10 스키마 변경 커뮤니케이션

- `user_session.data` JSONB 구조 변경 → Yess 영향. Jarvis 팀이 변경 전 공지 + 양 레포 동시 PR
- `user`/`role` 컬럼 **추가**는 Yess가 무시하면 OK
- 컬럼 **삭제**/타입 변경 → 사전 합의 필수

## 11. Open questions (구현 전 확인 필요)

1. **실제 회사 도메인** placeholder(`.회사.com`) → 운영 환경 진짜 값. (`isu.co.kr`? — login page에 `it-support@isu.co.kr` 있음. 확인 필요)
2. **`COOKIE_DOMAIN` 형식 검증을 코드에 넣을지** — 현재는 운영 설정자 책임. 자동 검증(`startsWith('.')` + 도메인 토큰 ≥ 2)을 `buildSessionCookieOptions`에 넣을지?
3. **Yess READ-ONLY DB user 생성 책임자** — DBA 작업. 본 PR과 별개로 진행.
4. **로그아웃 후 return 동작** — 본 spec에선 지원으로 결정. 다만 사용자 의도가 "Yess에서 로그아웃 → Yess로 돌아옴"인지, "어디서 로그아웃 하든 Jarvis 로그인 페이지로"인지 한 번 더 확인.
5. **개발 로컬에서 두 앱을 어떻게 띄우는지** — `localhost:3010`(Jarvis) / `localhost:3011`(Yess)면 부모 도메인 쿠키 안 됨. 개발에선 호스트 한정 쿠키로 폴백되니 SSO 동작 안 함 (각자 로그인 필요). 운영 배포에서만 SSO 동작 — 이게 OK인가?

## 12. 후속 작업 (이 PR 외)

- Yess 레포 미들웨어 구현 + 인계 가이드 적용 (Yess 팀)
- Yess READ-ONLY Postgres user 생성 (DBA)
- 운영 배포 시 환경변수 설정 (`COOKIE_DOMAIN`, `ALLOWED_RETURN_HOSTS`, `NEXT_PUBLIC_ALLOWED_RETURN_HOSTS`)
- 향후 3번째 앱 추가 시 통합 인증 도메인(`auth.회사.com`) 도입 검토
- CSRF 토큰 도입 (현재 미구현, 별도 PR)
- 운영 비밀번호 해싱(bcrypt) 도입 (별도 PR)

## 13. 변경 파일 요약

```
apps/web/app/api/auth/login/route.ts                 변경
apps/web/app/api/auth/login/route.test.ts            확장
apps/web/app/api/auth/logout/route.ts                변경
apps/web/app/api/auth/logout/route.test.ts           신설
apps/web/app/(auth)/login/page.tsx                   변경
apps/web/app/(auth)/login/_lib/safe-redirect.ts      함수 추가
apps/web/app/(auth)/login/_lib/safe-redirect.test.ts 확장
packages/auth/cookie.ts                              신설
packages/auth/__tests__/cookie.test.ts               신설
packages/auth/return-url.ts                          신설
packages/auth/__tests__/return-url.test.ts           신설
packages/auth/index.ts                               re-export 추가
.env.example                                         변수 추가
docs/integrations/yess-sso-handover.md               신설
```
