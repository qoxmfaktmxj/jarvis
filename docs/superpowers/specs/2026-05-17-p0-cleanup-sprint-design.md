# 2026-05-17 — P0 Cleanup Sprint Design

## 배경

외부 정적 감사 보고서(2026-05-17)가 Jarvis repo에서 14건의 결함 후보를 보고했다. 7개 그룹 병렬 검증 결과, 다음과 같이 분류되었다:

| 분류 | 항목 수 | 항목 |
|------|---------|------|
| **진짜 P0** | 2 | Upload RBAC, Login status guard |
| **운영 critical (false alarm로 판명)** | 0 | Cron timezone — 현재 코드는 이미 UTC 표기로 KST 의도 시각에 정확히 실행 중 (감사 보고서 오류). 단 가독성 개선만 별도 진행 |
| **의도된 설계 한계** | 2 | Rate limit single-instance (코드 주석 명시), DB script 부재 (외부 사용자=SQL 직접 적용 정책) |
| **의도된 단일 ko 로케일** | 1 | i18n — `jarvis-architecture` skill에 단일 ko 로케일이 SoT로 명시됨. en.json 1,012줄은 부분 마이그레이션 상태 (별도 결정 필요) |
| **transitional / 진행 중** | 1 | leave_request enum — Phase 2 plan 진행 중 |
| **false detection** | 2 | admin/codes auth (local helper가 공통 함수 호출), ESLint 9 호환 (백워드 호환 레이어 정상) |
| **CI 인프라 부재** | 1 | `.github/workflows/` 폴더 비어있음 — audit:rsc는 로컬 검증용. CI 도입은 별도 결정 |
| **trivial 결함 (보류)** | 1 | DATABASE_URL fallback 포트 5432 vs .env.example 5436 |
| **권장 사항 (코드 결함 아님)** | 1 | README 비대 — 사용자 판단 영역 |
| **추가 결함 (감사 보고서 누락)** | 1 | DataGrid save/discard semantic — 진짜 P0 발견되었으나 사용자 결정으로 이번 스프린트 제외 |

본 spec은 사용자가 확정한 **P0 2건 + cron 주석 강화 1건**을 다룬다.

## 범위

### 1. Upload RBAC (P0)

**문제**: `/api/upload` 및 `/api/upload/presign` route가 `requireApiSession(req, 'files:write')`를 호출하지만, RBAC simplification (2026-05-16, 47→23권한)으로 `files:write` 권한이 PERMISSIONS 상수에서 제거됨 (주석상 `admin:all`에 흡수됨). 그러나 `hasPermission()`은 단순 `session.permissions.includes()`만 검사하므로 ADMIN_ALL 보유자조차 `'files:write'` 리터럴 미보유 → **현재 모든 사용자 업로드 403**. SALES_ADMIN 사용자가 `/sales/contract-uploads` 페이지(SALES_ADMIN 가드)에 들어와도 업로드 불가.

**해결**: AWS IAM `AdministratorAccess` 모델 정착 (`hasPermission()` ADMIN_ALL bypass) + OR-match helper 신설 + upload route 권한 명시화.

### 2. Login status guard (P0)

**문제**: `packages/db/schema/user.ts`에 user status enum `["active", "inactive", "locked"]` 정의됨. `searchEmployees` (`apps/web/lib/server/employees.ts:61`)는 `eq(user.status, "active")` 가드 있음. 그러나 `apps/web/app/api/auth/login/route.ts:88-152`는 password 검증 후 status 검사 없이 `buildLoginResponse()` 호출 → **locked 사용자가 유효 비밀번호로 로그인 가능**. 테스트도 0건.

**해결**: password 검증 후 status 분기 + 403 응답 + audit log.

### 3. Cron 주석 강화 (가독성)

**문제**: 외부 감사 보고서가 "QUIZ_GENERATE / EXTERNAL_SIGNAL_FETCH / WIKI_LINT가 `{tz:'Asia/Seoul'}` 누락"으로 결함 보고했으나, 실제 검증 결과 3건 모두 **cron 표현식이 이미 UTC 기준으로 KST 의도 시각에 정확히 실행 중** (각 jobs 파일 주석에 명시). `tz` 옵션 추가하면 9시간 더 시프트되어 깨진다. 단 worker `index.ts` 호출처를 봤을 때 UTC/KST 변환 의도가 한 번에 보이지 않아 미래 drift 위험.

**해결**: worker `index.ts`의 `boss.schedule()` 3개 호출처에 한 줄 주석 추가 — "cron은 UTC 표기, KST 의도 시각은 X시"

---

## 1. Upload RBAC — 상세 설계

### 변경 파일 (5)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `packages/auth/rbac.ts` | `hasPermission()` 첫 줄에 ADMIN_ALL bypass + `hasAnyPermission()` 신설 |
| 2 | `apps/web/lib/server/api-auth.ts` | `requireAnyApiPermission()` 신설 (`requireApiSession` 옆) |
| 3 | `apps/web/app/api/upload/route.ts` | `requireApiSession(req, 'files:write')` → `requireAnyApiPermission(req, [SALES_ADMIN, KNOWLEDGE_ADMIN, PROJECT_ADMIN, NOTICE_ADMIN, MAINTENANCE_ADMIN])` |
| 4 | `apps/web/app/api/upload/presign/route.ts` | 동일 |
| 5 | `packages/auth/__tests__/rbac.test.ts` (신설) | ADMIN_ALL bypass + hasAnyPermission 케이스. 기존 `rbac-contractor.test.ts`와 분리 |

### 코드 스케치

**`packages/auth/rbac.ts`** — `hasPermission` 첫 줄에 ADMIN_ALL bypass 추가. 기존 `isAdmin()` 헬퍼는 동일 로직이지만 별도 시그니처 유지(가독성). 

```ts
export function hasPermission(
  session: JarvisSession,
  permission: string,
): boolean {
  if (session.permissions.includes(PERMISSIONS.ADMIN_ALL)) return true;
  return session.permissions.includes(permission);
}

export function hasAnyPermission(
  session: JarvisSession,
  permissions: readonly string[],
): boolean {
  if (session.permissions.includes(PERMISSIONS.ADMIN_ALL)) return true;
  return permissions.some((p) => session.permissions.includes(p));
}
```

**`apps/web/lib/server/api-auth.ts`** — 기존 `requireApiSession` 동일 패턴으로 신규 helper.

```ts
export async function requireAnyApiPermission(
  request: NextRequest,
  permissions: readonly string[],
): Promise<ApiAuthResult> {
  const sessionId = resolveRequestSessionId(request);
  if (!sessionId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const session = await getSession(sessionId);
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasAnyPermission(session, permissions)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}
```

**`apps/web/app/api/upload/route.ts`** 및 **`presign/route.ts`** — import + 호출 교체. resourceType 분기 없이 단일 OR-match (사용자 결정).

```ts
import { requireAnyApiPermission } from "@/lib/server/api-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const UPLOAD_PERMISSIONS = [
  PERMISSIONS.SALES_ADMIN,
  PERMISSIONS.KNOWLEDGE_ADMIN,
  PERMISSIONS.PROJECT_ADMIN,
  PERMISSIONS.NOTICE_ADMIN,
  PERMISSIONS.MAINTENANCE_ADMIN,
] as const;

const auth = await requireAnyApiPermission(req, UPLOAD_PERMISSIONS);
if (auth.response) return auth.response;
const { session } = auth;
```

### 영향 검토

- **`hasPermission()` ADMIN_ALL bypass = 전역 동작 변경**
  - 영향 호출처: `requireApiSession`, `requirePermission`, `Authorized` HOC, 모든 server action 가드
  - 의도된 거부 케이스: **없음** — ADMIN_ALL은 마스터 권한으로 정의됨 (CLAUDE.md 2026-05-16 entry: "AWS IAM ReadOnlyAccess + AdministratorAccess 동일")
  - owner check (knowledge/schedule)에서 ADMIN_ALL 우회는 **이미 명시된 패턴** (`jarvis-architecture` skill §3) → 일관성 강화
- **OR-match 5개 권한**: 사용자 결정에 따라 모든 도메인 admin이 업로드 가능. ADMIN_ALL은 bypass로 자동 통과. 일반 사용자 (MEMBER/YEAREND)는 여전히 차단

### 회귀 검증

1. ADMIN_ALL 보유자가 임의의 권한 검사 통과 (unit test)
2. SALES_ADMIN 보유자가 `/api/upload`·`/api/upload/presign` 통과 (integration test)
3. MEMBER 사용자가 `/api/upload` 차단 → 403 (integration test)
4. 미인증 요청 → 401 (integration test)

---

## 2. Login status guard — 상세 설계

### 변경 파일 (2)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `apps/web/app/api/auth/login/route.ts` | password 검증 통과 후 + `buildLoginResponse` 호출 전, status 분기 + audit log + 403 |
| 2 | `apps/web/app/api/auth/login/route.test.ts` | TC: inactive·locked 사용자 + 올바른 비밀번호 → 403 / active → 200 regression |

### 코드 스케치

기존 audit log 패턴(`action: "auth.login.fail"`)을 재사용하고 `details.reason`으로 사유 구분. `buildLoginResponse` 호출 직전 두 곳(line 119 dev-account branch, line 152 정상 branch)에서 동일 가드 적용. dbUser 타입에 `status` 필드 명시 추가 필요 (현재 `select * from user`로 가져오므로 status는 이미 포함됨).

```ts
// helper 신설 (route.ts 내부 또는 별도 추출)
async function rejectIfNotActive(
  dbUser: { id: string; workspaceId: string; status: string },
  ip: string,
  username: string,
): Promise<NextResponse | null> {
  if (dbUser.status === "active") return null;
  await db
    .insert(auditLog)
    .values({
      workspaceId: dbUser.workspaceId,
      userId: dbUser.id,
      action: "auth.login.fail",
      resourceType: "login",
      ipAddress: ip === "unknown" ? null : ip,
      details: {
        ip,
        username,
        reason: "account_not_active",
        status: dbUser.status,
        usernameHash: createHash("sha256").update(username).digest("hex").slice(0, 16),
      },
      success: false,
    })
    .catch(() => undefined);
  return NextResponse.json(
    { error: "account_disabled", status: dbUser.status },
    { status: 403 },
  );
}
```

```ts
// dev-account branch (line 119 부근)
if (!devDbUser) {
  return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
}
const disabled = await rejectIfNotActive(devDbUser, ip, payload.username);
if (disabled) return disabled;
return buildLoginResponse(devDbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
```

```ts
// 정상 branch (line 152 부근)
if (!dbUser) {
  return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
}
const disabled = await rejectIfNotActive(dbUser, ip, payload.username);
if (disabled) return disabled;
return buildLoginResponse(dbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
```

### 테스트 케이스

| TC | 상황 | 기대 |
|----|------|------|
| TC: locked + 올바른 비밀번호 | dbUser.status="locked" | 403 + body `{error: "account_disabled", status: "locked"}` + audit `auth.login.fail` reason=account_not_active |
| TC: inactive + 올바른 비밀번호 | dbUser.status="inactive" | 403 + 동일 패턴 |
| TC: active + 올바른 비밀번호 (regression) | dbUser.status="active" | 200 + 세션 쿠키 + audit `auth.login.success` |
| TC: locked + 잘못된 비밀번호 | password verify fail | 401 + audit `auth.login.fail` reason=invalid_credentials (기존 동작 유지 — status 검사 전에 이미 차단) |

### 영향 검토

- password 검증 후 status 분기 → invalid_credentials와 account_disabled 응답 구분 가능. enumeration 공격 측면에서 약간의 정보 노출이 있으나, login 페이지에 status가 노출되는 게 운영 디버깅에 더 가치 있다는 판단 (사용자 결정)
- 기존 `searchEmployees` 가드와 도메인 일관성: search는 listing 보호 (enumeration 방지 측면), login은 인증 결과 명확화 (UX 측면) → 도메인별 분리 유지

---

## 3. Cron 주석 강화 — 상세 설계

### 변경 파일 (1)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `apps/worker/src/index.ts` | line 91·99·143의 `boss.schedule()` 호출 직전에 한 줄 주석 추가 — "cron은 UTC 표기, KST 의도 시각" |

### 코드 스케치

```ts
// Phase-Dashboard (2026-04-30) — 위키 퀴즈 주간 batch + 시즌 rotate.
// cron `0 21 * * 0` = UTC 일요일 21:00 = KST 월요일 06:00 (의도)
await boss.schedule(QUIZ_GENERATE_QUEUE, QUIZ_GENERATE_CRON, {});
```

```ts
// cron `0 22,23,0-10,12,15,18 * * *` = UTC 시간 표기
// 의도: KST 07-19시 매시 + 21·00·03시 = 하루 16회
await boss.schedule(EXTERNAL_SIGNAL_FETCH_QUEUE, EXTERNAL_SIGNAL_FETCH_CRON, {});
```

```ts
// cron `0 18 * * 6` = UTC 토요일 18:00 = KST 일요일 03:00 (의도)
await boss.schedule(WIKI_LINT_QUEUE, WIKI_LINT_CRON, {});
```

코드 동작 변경 없음. 미래 drift 방지 목적.

---

## 영향도 (jarvis-architecture 17계층)

| 계층 | 변경 |
|------|------|
| DB 스키마 | 없음 |
| Validation | 없음 |
| 권한 (23 상수) | 상수 변경 없음. **`hasPermission()` 헬퍼 동작 변경 (전역 ADMIN_ALL bypass)** + `hasAnyPermission` 신설 |
| 세션 vs 권한 모델 | 동일 |
| workspaceId 격리 | 없음 |
| Ask AI | 없음 |
| Wiki-fs | 없음 |
| 검색 | 없음 |
| 서버 액션/API | login route 1 + upload route 2 |
| 서버 로직 (lib) | `apps/web/lib/server/api-auth.ts` (`requireAnyApiPermission` 추가) |
| UI 라우트 | 없음 |
| UI 컴포넌트 | 없음 |
| i18n 키 | 없음 |
| 테스트 | rbac.test (신설/확장) + login route.test (3 TC 추가) |
| 워커 잡 | `apps/worker/src/index.ts` 주석 3건 |
| LLM 호출 | 없음 |
| Audit | login fail 가지에 `auth.login.fail` + reason=account_not_active 1건 추가 |

---

## 파일 변경 순서

1. `packages/auth/rbac.ts` — `hasPermission` bypass + `hasAnyPermission`
2. `packages/auth/__tests__/rbac.test.ts` (신설) — 회귀 테스트 먼저
3. `apps/web/lib/server/api-auth.ts` — `requireAnyApiPermission`
4. `apps/web/app/api/upload/route.ts` — OR-match 적용
5. `apps/web/app/api/upload/presign/route.ts` — 동일
6. `apps/web/app/api/auth/login/route.ts` — status guard
7. `apps/web/app/api/auth/login/route.test.ts` — TC 추가
8. `apps/worker/src/index.ts` — 주석 3건

---

## 검증 게이트

| 명령 | 범위 | 횟수 |
|------|------|------|
| `pnpm --filter @jarvis/web type-check` | rbac + login + upload routes | 2회 (feedback_test_twice) |
| `pnpm --filter @jarvis/web lint` | 동일 | 2회 |
| `pnpm test --filter @jarvis/auth` 또는 `pnpm vitest run packages/auth` | rbac.test | 2회 |
| `pnpm --filter @jarvis/web test apps/web/app/api/auth/login` | login route.test | 2회 |
| `pnpm --filter @jarvis/worker type-check` | index.ts | 1회 (주석만 — type-check 변동 없음) |

E2E (Playwright)는 본 스프린트에서 선택. 위 unit + integration으로 충분.

---

## 명시적 비-범위

다음 항목은 외부 감사 보고서가 거론했으나 본 스프린트에서 다루지 않는다:

| 항목 | 사유 |
|------|------|
| DataGrid save/discard semantic | 진짜 P0 결함으로 검증됨. **사용자 결정**으로 별도 스프린트로 분리 |
| DATABASE_URL fallback (5432 vs 5436) | trivial 결함. 별도 PR. 본 스프린트 범위 외 |
| i18n locale runtime | 단일 ko 로케일은 의도된 설계 (`jarvis-architecture` skill SoT). en.json 마이그레이션 결정은 별도 |
| `.github/workflows/` 비어있음 (CI 미도입) | 인프라 결정 — 별도 |
| README 분리·축소 | 사용자 판단 영역 (코드 결함 아님) |
| Rate limit single-instance | 코드 주석 명시 "Single-instance deployment assumed" — known limit, 3인 팀 단일 인스턴스 운영 |
| admin/codes auth helper 중복 | false detection — local helper가 내부에서 공통 `getSession`/`hasPermission` 호출. drift 위험 없음 |
| leave_request status enum | Phase 2 plan 진행 중 (transitional) |
| ESLint 9 호환성 | 백워드 호환 레이어로 정상 동작 |
| Cron tz 누락 (3건) | **false alarm** — cron 표현식이 이미 UTC 기준으로 KST 의도 시각에 정확히 실행 중. tz 추가 시 오히려 9시간 시프트 발생. 본 스프린트에선 주석 강화만 |

---

## 참고

- 외부 감사 보고서 원문: 사용자 메시지 (2026-05-17)
- 7개 그룹 병렬 검증 결과: 본 spec 작성 직전 brainstorming 세션
- 관련 skill: `jarvis-architecture` (17계층 영향도, 23 PERMISSIONS, owner check 패턴), `jarvis-db-patterns` (RBAC + workspaceId 격리)
- 관련 CLAUDE.md entry: 2026-05-16 RBAC simplification (47→23권한, AWS IAM 모델), 2026-05-04 DB 정책 (외부 사용자 SQL 직접 적용)
