# P0 Cleanup Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two P0 결함 (Upload RBAC가 ADMIN_ALL bypass 없이 모든 사용자 차단 / Login route가 inactive·locked 사용자 통과) + 워커 cron 주석 강화 (가독성).

**Architecture:** `packages/auth/rbac.ts`의 `hasPermission()`에 AWS IAM-style ADMIN_ALL bypass 도입 + `hasAnyPermission()` OR-match helper 신설. `apps/web/lib/server/api-auth.ts`에 `requireAnyApiPermission()` wrapper 신설. Upload route 2개를 stale `'files:write'` 문자열에서 5개 도메인 admin OR-match로 교체. Login route에 `dbUser.status !== "active"` 가드 + audit log 분기 추가. Worker `index.ts`의 KST 의도 cron 호출처 3곳에 UTC 표기 명시 주석 추가.

**Tech Stack:** TypeScript, Drizzle ORM, Next.js 15 App Router, Vitest, pg-boss, Zod, scrypt.

**Spec:** [`docs/superpowers/specs/2026-05-17-p0-cleanup-sprint-design.md`](../specs/2026-05-17-p0-cleanup-sprint-design.md)

---

## File Structure

### Create
- `packages/auth/__tests__/rbac.test.ts` — `hasPermission` ADMIN_ALL bypass + `hasAnyPermission` 회귀 테스트

### Modify
- `packages/auth/rbac.ts` — `hasPermission` 첫 줄에 ADMIN_ALL bypass + `hasAnyPermission` export
- `apps/web/lib/server/api-auth.ts` — `requireAnyApiPermission` export
- `apps/web/app/api/upload/route.ts` (line 84) — `requireApiSession(req, 'files:write')` → `requireAnyApiPermission(req, UPLOAD_PERMISSIONS)`
- `apps/web/app/api/upload/presign/route.ts` (line 53) — 동일 교체
- `apps/web/app/api/auth/login/route.ts` — `rejectIfNotActive` helper + 두 호출처(dev branch, 정상 branch)에 status guard 적용 + `buildLoginResponse` 시그니처에 `status` 필드 추가
- `apps/web/app/api/auth/login/route.test.ts` — `DB_USER` fixture에 `status: "active"` 추가 + TC: inactive→403, locked→403, active regression
- `apps/worker/src/index.ts` (line 91, 99, 143 근처) — 3건 cron 호출에 "cron은 UTC 표기, KST 의도" 주석 1줄씩 추가

---

## Task 1: rbac.test.ts 신설 (failing tests 먼저)

**Files:**
- Create: `packages/auth/__tests__/rbac.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// packages/auth/__tests__/rbac.test.ts
import { describe, expect, it } from "vitest";
import { hasPermission, hasAnyPermission } from "../rbac.js";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "../types.js";

function makeSession(permissions: string[]): JarvisSession {
  return {
    id: "sid",
    userId: "uid",
    workspaceId: "wsid",
    employeeId: "EMP",
    name: "U",
    roles: [],
    permissions,
    createdAt: 0,
    expiresAt: 0,
  };
}

describe("hasPermission", () => {
  it("returns true when session has the exact permission", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasPermission(s, PERMISSIONS.KNOWLEDGE_READ)).toBe(true);
  });

  it("returns false when session lacks the permission", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasPermission(s, PERMISSIONS.SALES_ADMIN)).toBe(false);
  });

  it("returns true for ANY permission when session holds ADMIN_ALL (bypass)", () => {
    const s = makeSession([PERMISSIONS.ADMIN_ALL]);
    expect(hasPermission(s, PERMISSIONS.KNOWLEDGE_ADMIN)).toBe(true);
    expect(hasPermission(s, PERMISSIONS.SALES_ADMIN)).toBe(true);
    expect(hasPermission(s, "files:write")).toBe(true); // 폐기된 stale permission도 통과
  });
});

describe("hasAnyPermission", () => {
  it("returns true when session has at least one of the listed permissions", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_ADMIN]);
    expect(
      hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN, PERMISSIONS.KNOWLEDGE_ADMIN]),
    ).toBe(true);
  });

  it("returns false when session has none of the listed permissions", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(
      hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN, PERMISSIONS.KNOWLEDGE_ADMIN]),
    ).toBe(false);
  });

  it("returns true for any list when session holds ADMIN_ALL (bypass)", () => {
    const s = makeSession([PERMISSIONS.ADMIN_ALL]);
    expect(hasAnyPermission(s, [PERMISSIONS.SALES_ADMIN])).toBe(true);
    expect(hasAnyPermission(s, [])).toBe(true);
  });

  it("returns false for empty list when session has no ADMIN_ALL", () => {
    const s = makeSession([PERMISSIONS.KNOWLEDGE_READ]);
    expect(hasAnyPermission(s, [])).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인 (`hasAnyPermission` 미정의 + bypass 미적용)**

Run: `pnpm vitest run packages/auth/__tests__/rbac.test.ts`
Expected:
- "returns true for ANY permission when session holds ADMIN_ALL (bypass)" → FAIL (현재는 includes만 검사)
- `hasAnyPermission` 관련 4 케이스 → FAIL ("hasAnyPermission" import 에러)

---

## Task 2: hasPermission ADMIN_ALL bypass + hasAnyPermission 구현

**Files:**
- Modify: `packages/auth/rbac.ts`

- [ ] **Step 1: rbac.ts 수정**

기존 파일 첫 부분:
```ts
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "./types.js";

export function hasPermission(
  session: JarvisSession,
  permission: string
): boolean {
  return session.permissions.includes(permission);
}

export function hasRole(session: JarvisSession, roleCode: string): boolean {
  return session.roles.includes(roleCode);
}
```

다음과 같이 교체:

```ts
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "./types.js";

export function hasPermission(
  session: JarvisSession,
  permission: string
): boolean {
  if (session.permissions.includes(PERMISSIONS.ADMIN_ALL)) return true;
  return session.permissions.includes(permission);
}

export function hasAnyPermission(
  session: JarvisSession,
  permissions: readonly string[]
): boolean {
  if (session.permissions.includes(PERMISSIONS.ADMIN_ALL)) return true;
  return permissions.some((p) => session.permissions.includes(p));
}

export function hasRole(session: JarvisSession, roleCode: string): boolean {
  return session.roles.includes(roleCode);
}
```

(나머지 `isAdmin`, `canManageContractors`, `canAccessContractorData`는 변경하지 않는다.)

- [ ] **Step 2: 테스트 재실행 — 모두 PASS 확인**

Run: `pnpm vitest run packages/auth/__tests__/rbac.test.ts`
Expected: 8 PASS, 0 FAIL.

- [ ] **Step 3: 전체 회귀 — `rbac-contractor.test.ts` 영향 없는지 확인**

Run: `pnpm vitest run packages/auth/__tests__/`
Expected: 모든 테스트 PASS (contractor 테스트도 admin이 `isAdmin`로 직접 검사하므로 영향 없음).

- [ ] **Step 4: type-check**

Run: `pnpm --filter @jarvis/auth type-check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/rbac.ts packages/auth/__tests__/rbac.test.ts
git commit -m "feat(auth): add ADMIN_ALL bypass to hasPermission + hasAnyPermission helper

- hasPermission: ADMIN_ALL 보유자는 임의 권한 검사 자동 통과 (AWS IAM AdministratorAccess 모델)
- hasAnyPermission: OR-match 신설. ADMIN_ALL bypass 동일 적용
- packages/auth/__tests__/rbac.test.ts: 8 unit test (bypass + exact match + OR-match + empty list edge)"
```

---

## Task 3: requireAnyApiPermission helper

**Files:**
- Modify: `apps/web/lib/server/api-auth.ts`

- [ ] **Step 1: api-auth.ts 수정**

기존 import 라인:
```ts
import { hasPermission } from "@jarvis/auth/rbac";
```
를 다음으로 교체:
```ts
import { hasAnyPermission, hasPermission } from "@jarvis/auth/rbac";
```

파일 끝(line 43 `}` 다음)에 다음 함수 추가:

```ts
export async function requireAnyApiPermission(
  request: NextRequest,
  permissions: readonly string[]
): Promise<ApiAuthResult> {
  const sessionId = resolveRequestSessionId(request);
  if (!sessionId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  if (!hasAnyPermission(session, permissions)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { session };
}
```

- [ ] **Step 2: type-check**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/server/api-auth.ts
git commit -m "feat(api-auth): add requireAnyApiPermission OR-match helper

Same pattern as requireApiSession but accepts permission list (OR-match).
ADMIN_ALL bypass is inherited from hasAnyPermission."
```

---

## Task 4: Upload route 2개 권한 교체

**Files:**
- Modify: `apps/web/app/api/upload/route.ts` (line 84 근처)
- Modify: `apps/web/app/api/upload/presign/route.ts` (line 53 근처)

- [ ] **Step 1: `apps/web/app/api/upload/route.ts` import 섹션에서 `requireApiSession` → `requireAnyApiPermission` 교체**

기존:
```ts
import { requireApiSession } from "@/lib/server/api-auth";
```
교체:
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
```

(주: `PERMISSIONS`가 이미 import되어 있으면 import 라인은 추가하지 않는다. `UPLOAD_PERMISSIONS` 상수는 import 섹션 직후 module-level에 둔다.)

line 84 호출 교체:

기존:
```ts
  const auth = await requireApiSession(req, 'files:write');
```
교체:
```ts
  const auth = await requireAnyApiPermission(req, UPLOAD_PERMISSIONS);
```

- [ ] **Step 2: `apps/web/app/api/upload/presign/route.ts` 동일 교체**

기존 import:
```ts
import { requireApiSession } from "@/lib/server/api-auth";
```
교체:
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
```

line 53 호출 교체:

기존:
```ts
  const auth = await requireApiSession(req, 'files:write');
```
교체:
```ts
  const auth = await requireAnyApiPermission(req, UPLOAD_PERMISSIONS);
```

- [ ] **Step 3: 동일 `requireApiSession` import의 다른 사용처가 두 파일 안에 없는지 확인**

Run: `grep -n requireApiSession apps/web/app/api/upload/route.ts apps/web/app/api/upload/presign/route.ts`
Expected: 0 hits (모두 교체 완료).

- [ ] **Step 4: type-check**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors.

- [ ] **Step 5: lint**

Run: `pnpm --filter @jarvis/web lint`
Expected: 0 new errors (기존 warn baseline 유지).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/upload/route.ts apps/web/app/api/upload/presign/route.ts
git commit -m "fix(upload): use OR-match permissions instead of stale files:write

RBAC simplification (2026-05-16, 47→23 권한)으로 files:write 권한이 PERMISSIONS에서 제거됨.
hasPermission()이 ADMIN_ALL bypass 없이 단순 includes만 검사하므로 ADMIN_ALL 보유자
조차 'files:write' 리터럴 미보유로 차단되어 모든 사용자 업로드 403.

5개 도메인 admin(SALES_ADMIN, KNOWLEDGE_ADMIN, PROJECT_ADMIN, NOTICE_ADMIN,
MAINTENANCE_ADMIN) OR-match로 교체. ADMIN_ALL은 hasAnyPermission이 bypass로 자동 통과."
```

---

## Task 5: Login route status guard — failing test 먼저

**Files:**
- Modify: `apps/web/app/api/auth/login/route.test.ts`

- [ ] **Step 1: `DB_USER` fixture에 `status: "active"` 추가**

`DB_USER` 정의를 찾아서:
```ts
const DB_USER = {
  id: "user-1",
  workspaceId: "ws-1",
  employeeId: "EMP001",
  name: "Admin User",
  email: "admin@jarvis.dev",
  orgId: null,
};
```
다음으로 교체:
```ts
const DB_USER = {
  id: "user-1",
  workspaceId: "ws-1",
  employeeId: "EMP001",
  name: "Admin User",
  email: "admin@jarvis.dev",
  orgId: null,
  status: "active" as const,
};
```

- [ ] **Step 2: 파일 맨 아래 `describe` 블록 안에 3개 TC 추가**

(이전 TC들의 끝부분 `});` 뒤, `describe` 블록 닫기 `});` 직전에 다음을 추가)

```ts
  it("TC: locked user + correct password → 403 account_disabled", async () => {
    checkRateLimitMock.mockReturnValue(ALLOWED_RL);
    userLookupQueue.push([
      { ...DB_USER, status: "locked", passwordHash: "stub-hash" },
    ]);
    const verifyPasswordMock = vi.fn().mockResolvedValue(true);
    vi.doMock("@jarvis/auth/password", () => ({
      verifyPassword: verifyPasswordMock,
    }));

    const req = buildRequest({ username: "EMP001", password: "correct" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "account_disabled", status: "locked" });
    expect(auditInsertMock).toHaveBeenCalled();
  });

  it("TC: inactive user + correct password → 403 account_disabled", async () => {
    checkRateLimitMock.mockReturnValue(ALLOWED_RL);
    userLookupQueue.push([
      { ...DB_USER, status: "inactive", passwordHash: "stub-hash" },
    ]);
    const verifyPasswordMock = vi.fn().mockResolvedValue(true);
    vi.doMock("@jarvis/auth/password", () => ({
      verifyPassword: verifyPasswordMock,
    }));

    const req = buildRequest({ username: "EMP001", password: "correct" });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "account_disabled", status: "inactive" });
  });

  it("TC: active user + correct password → 200 (regression guard)", async () => {
    checkRateLimitMock.mockReturnValue(ALLOWED_RL);
    userLookupQueue.push([
      { ...DB_USER, status: "active", passwordHash: "stub-hash" },
    ]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);
    createSessionMock.mockResolvedValue(undefined);
    const verifyPasswordMock = vi.fn().mockResolvedValue(true);
    vi.doMock("@jarvis/auth/password", () => ({
      verifyPassword: verifyPasswordMock,
    }));

    const req = buildRequest({ username: "EMP001", password: "correct" });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
```

(주: 기존 테스트 파일이 `verifyPassword` mock을 어떻게 처리하는지 확인. 만약 hoisted vi.mock 또는 top-level mock이 이미 있다면 위 `vi.doMock` 라인은 제거하고 기존 mock의 `mockResolvedValue(true)` 사용. 실행 시 첫 fail 메시지로 확정 후 조정.)

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `pnpm --filter @jarvis/web vitest run apps/web/app/api/auth/login/route.test.ts`
Expected: 새 3 TC 중 첫 2건 (locked, inactive)이 FAIL — 현재 route는 status 검사 없으므로 200 (정상 흐름) 반환. regression TC는 PASS여야 함.

---

## Task 6: Login route status guard 구현

**Files:**
- Modify: `apps/web/app/api/auth/login/route.ts`

- [ ] **Step 1: `buildLoginResponse` 시그니처에 `status` 추가**

기존:
```ts
async function buildLoginResponse(
  dbUser: { id: string; workspaceId: string; employeeId: string; name: string; email: string | null; orgId: string | null },
  sessionLifetimeMs: number,
  ip: string,
  keepSignedIn = false,
) {
```

교체:
```ts
async function buildLoginResponse(
  dbUser: { id: string; workspaceId: string; employeeId: string; name: string; email: string | null; orgId: string | null; status: string },
  sessionLifetimeMs: number,
  ip: string,
  keepSignedIn = false,
) {
```

- [ ] **Step 2: `rejectIfNotActive` helper를 파일 하단(buildLoginResponse 다음)에 추가**

```ts
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

- [ ] **Step 3: dev-account branch (line 119 부근)에 guard 적용**

기존:
```ts
        if (!devDbUser) {
          return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
        }
        return buildLoginResponse(devDbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
```

교체:
```ts
        if (!devDbUser) {
          return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
        }
        const devDisabled = await rejectIfNotActive(devDbUser, ip, payload.username);
        if (devDisabled) return devDisabled;
        return buildLoginResponse(devDbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
```

- [ ] **Step 4: 정상 branch (line 152 부근)에 guard 적용**

기존:
```ts
  if (!dbUser) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  return buildLoginResponse(dbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
}
```

교체:
```ts
  if (!dbUser) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const disabled = await rejectIfNotActive(dbUser, ip, payload.username);
  if (disabled) return disabled;

  return buildLoginResponse(dbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
}
```

- [ ] **Step 5: 테스트 재실행 — 3 TC 모두 PASS 확인**

Run: `pnpm --filter @jarvis/web vitest run apps/web/app/api/auth/login/route.test.ts`
Expected: 모든 테스트 PASS (기존 12 TC + 신규 3 TC).

만약 mock 패턴 mismatch로 실패하면 step 5에서 출력된 error message 기반으로 Task 5 step 2의 `vi.doMock` 부분만 조정 (기존 hoisted mock 패턴과 일치시킴). 코드 변경 자체는 그대로 둔다.

- [ ] **Step 6: type-check**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/auth/login/route.ts apps/web/app/api/auth/login/route.test.ts
git commit -m "fix(auth/login): reject login for inactive/locked users

user.status enum (active|inactive|locked)는 정의되어 있으나 login route가 password
검증만 하고 status 검사 없이 세션 생성 → locked 사용자가 유효 비밀번호로 로그인 가능.

password 검증 통과 후 rejectIfNotActive() 가드 추가 (dev-account branch + 정상 branch
모두). 403 account_disabled 응답 + audit_log auth.login.fail reason=account_not_active.

테스트: locked/inactive/active 3 TC 추가 (login route.test.ts)."
```

---

## Task 7: Worker cron 주석 강화

**Files:**
- Modify: `apps/worker/src/index.ts` (line 91, 99, 143 근처)

- [ ] **Step 1: QUIZ_GENERATE 호출 직전 주석 보강 (line 91 근처)**

기존:
```ts
  // Phase-Dashboard (2026-04-30) — 위키 퀴즈 주간 batch + 시즌 rotate.
  await boss.schedule(QUIZ_GENERATE_QUEUE, QUIZ_GENERATE_CRON, {});
```

교체:
```ts
  // Phase-Dashboard (2026-04-30) — 위키 퀴즈 주간 batch + 시즌 rotate.
  // cron `0 21 * * 0` = UTC 일요일 21:00 = KST 월요일 06:00 (의도)
  await boss.schedule(QUIZ_GENERATE_QUEUE, QUIZ_GENERATE_CRON, {});
```

- [ ] **Step 2: EXTERNAL_SIGNAL_FETCH 호출 직전 주석 보강 (line 99 근처)**

기존:
```ts
  // Phase-Dashboard (2026-04-30) — 외부 시그널(FX + 날씨) 캐시.
  // KST 07-19시 매시 + KST 21·00·03시 = 하루 16회 (단일 cron 표현식으로 등록).
  // pg-boss schedule()은 큐 이름을 PK로 사용하므로 두 번 호출하면 마지막 값만 남는다.
  await boss.schedule(EXTERNAL_SIGNAL_FETCH_QUEUE, EXTERNAL_SIGNAL_FETCH_CRON, {});
```

교체:
```ts
  // Phase-Dashboard (2026-04-30) — 외부 시그널(FX + 날씨) 캐시.
  // KST 07-19시 매시 + KST 21·00·03시 = 하루 16회 (단일 cron 표현식으로 등록).
  // cron `0 22,23,0-10,12,15,18 * * *` = UTC 시간 표기, KST = UTC + 9h
  // pg-boss schedule()은 큐 이름을 PK로 사용하므로 두 번 호출하면 마지막 값만 남는다.
  await boss.schedule(EXTERNAL_SIGNAL_FETCH_QUEUE, EXTERNAL_SIGNAL_FETCH_CRON, {});
```

- [ ] **Step 3: WIKI_LINT 호출 직전 주석 보강 (line 143 근처)**

기존:
```ts
  if (featureWikiLintCron()) {
    await boss.createQueue(WIKI_LINT_QUEUE);
    await boss.schedule(WIKI_LINT_QUEUE, WIKI_LINT_CRON, {});
    await boss.work(WIKI_LINT_QUEUE, wikiLintHandler);
    logger.info({ cron: WIKI_LINT_CRON }, '[worker] wiki-lint cron registered');
```

교체:
```ts
  if (featureWikiLintCron()) {
    await boss.createQueue(WIKI_LINT_QUEUE);
    // cron `0 18 * * 6` = UTC 토요일 18:00 = KST 일요일 03:00 (의도)
    await boss.schedule(WIKI_LINT_QUEUE, WIKI_LINT_CRON, {});
    await boss.work(WIKI_LINT_QUEUE, wikiLintHandler);
    logger.info({ cron: WIKI_LINT_CRON }, '[worker] wiki-lint cron registered');
```

- [ ] **Step 4: type-check (주석만이지만 의도 확인용)**

Run: `pnpm --filter @jarvis/worker type-check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "docs(worker): annotate KST-intent cron schedules with UTC mapping

3개 cron(QUIZ_GENERATE, EXTERNAL_SIGNAL_FETCH, WIKI_LINT)은 cron 표현식이 이미 UTC
기준으로 KST 의도 시각에 정확히 실행되도록 작성됨. 그러나 worker index.ts 호출처에서
UTC/KST 변환이 한 번에 보이지 않아 미래 drift 위험이 있어 한 줄 주석 추가.

코드 동작 변경 없음. tz 옵션은 의도적으로 추가하지 않음 — 추가하면 9시간 더 시프트되어
실제 실행 시각이 깨진다 (cron 표현식이 이미 UTC 표기이기 때문)."
```

---

## Task 8: 최종 검증 게이트 (feedback_test_twice 룰 — 2회 실행)

**Files:** 없음 (검증만).

- [ ] **Step 1: web type-check 1회**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors.

- [ ] **Step 2: web type-check 2회 (반복)**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors.

- [ ] **Step 3: web lint 1회**

Run: `pnpm --filter @jarvis/web lint`
Expected: 0 새 errors (기존 unused-var warn baseline 유지).

- [ ] **Step 4: web lint 2회**

Run: `pnpm --filter @jarvis/web lint`
Expected: 1회와 동일.

- [ ] **Step 5: auth unit test 1회**

Run: `pnpm vitest run packages/auth/__tests__/`
Expected: 모든 테스트 PASS (8 신규 + 기존 모두).

- [ ] **Step 6: auth unit test 2회**

Run: `pnpm vitest run packages/auth/__tests__/`
Expected: 1회와 동일.

- [ ] **Step 7: login route test 1회**

Run: `pnpm --filter @jarvis/web vitest run apps/web/app/api/auth/login/route.test.ts`
Expected: 모든 테스트 PASS (기존 12 + 신규 3).

- [ ] **Step 8: login route test 2회**

Run: `pnpm --filter @jarvis/web vitest run apps/web/app/api/auth/login/route.test.ts`
Expected: 1회와 동일.

- [ ] **Step 9: worker type-check 1회**

Run: `pnpm --filter @jarvis/worker type-check`
Expected: 0 errors.

- [ ] **Step 10: worker type-check 2회**

Run: `pnpm --filter @jarvis/worker type-check`
Expected: 0 errors.

- [ ] **Step 11: 모든 게이트 통과 시 — 작업 완료 메시지**

`superpowers:verification-before-completion`의 기준을 충족했음을 확인. 어느 게이트라도 실패하면 우회하지 말고 root cause 해결 후 재실행.

---

## 검증 게이트 매트릭스 (jarvis-architecture 영향도 기반)

| 명령 | 범위 | 본 plan에서 실행 여부 |
|------|------|---------------------|
| `pnpm --filter @jarvis/web type-check` × 2 | upload + login route + api-auth | ✅ Task 8 step 1·2 |
| `pnpm --filter @jarvis/web lint` × 2 | 동일 | ✅ Task 8 step 3·4 |
| `pnpm vitest run packages/auth/__tests__/` × 2 | rbac.test, rbac-contractor.test | ✅ Task 8 step 5·6 |
| `pnpm --filter @jarvis/web vitest ... login/route.test.ts` × 2 | login route | ✅ Task 8 step 7·8 |
| `pnpm --filter @jarvis/worker type-check` × 2 | index.ts | ✅ Task 8 step 9·10 |
| 운영 DB에 ALTER/CREATE SQL 적용 | — | ❌ 스키마 변경 없음 |
| `pnpm wiki:check` | — | ❌ wiki-fs/wiki-agent 변경 없음 |
| `pnpm audit:rsc` | — | ❌ RSC/client 경계 변경 없음 |
| `pnpm eval:budget-test` | — | ❌ packages/ai 변경 없음 |
| `pnpm --filter @jarvis/web exec playwright test` | — | ❌ (선택) UI 라우트 변경 없음. 본 plan 범위 외 |

---

## 비-범위 재확인

[spec §명시적 비-범위](../specs/2026-05-17-p0-cleanup-sprint-design.md)를 참조. 본 plan에서 다루지 않는 외부 감사 보고서 거론 항목 11건:

- DataGrid save/discard semantic (별도 스프린트)
- DATABASE_URL fallback 5432 vs 5436 (별도 PR)
- i18n runtime locale (단일 ko 의도)
- `.github/workflows/` 빈 폴더 (CI 도입 결정 별도)
- README 분리 (사용자 판단)
- Rate limit single-instance (known limit)
- admin/codes auth 중복 (false detection)
- leave_request enum (Phase 2 진행 중)
- ESLint 9 호환 (정상)
- Cron tz "결함" (false alarm — cron이 이미 UTC 표기로 KST 실행 중)

---

## 자가 검토 (writing-plans Self-Review)

- **Spec coverage**: spec §1·2·3 모두 task 1-7로 매핑 ✓. 영향도 17계층 변경 사항 (rbac · api-auth · upload route × 2 · login route + test · worker index) 모두 task에 포함 ✓. 검증 게이트 매트릭스 (spec)와 plan Task 8 일치 ✓.
- **Placeholder scan**: TBD/TODO/"implement later" 없음. 코드 블록 모두 완전 ✓. 단 Task 5 step 2의 `vi.doMock` 패턴은 실제 mock 패턴에 따라 조정 명시 (실행 단계에서 첫 fail message 기반) — placeholder 아닌 conditional adjustment ✓.
- **Type consistency**: `hasPermission` / `hasAnyPermission` 시그니처가 Task 1 (test) ↔ Task 2 (impl) ↔ Task 3 (api-auth) 일관 ✓. `rejectIfNotActive` 시그니처가 Task 6 step 2 정의와 step 3·4 호출 일관 ✓. `UPLOAD_PERMISSIONS` 상수가 Task 4 step 1·2에서 동일 5권한 목록 ✓.
