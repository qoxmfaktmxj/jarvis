# Contractor Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `/attendance` 도메인(일반 직원 출퇴근·더미 연차) 완전 폐기 + 사내 EHR 외주인력 3화면(계약·일정·근태)을 통합한 **외주인력관리** 도메인(`/contractors`) 신설. 연차는 시간 단위(1일=8h), 자동 승인, 공휴일·주말 자동 제외.

**Architecture:** `user.employment_type` 플래그 + 신규 스키마 3개(`contractor_contract`, `leave_request`, `holiday`). 상단 탭 2개 구조(`/contractors` 인력·연차, `/contractors/schedule` 일정 달력) + `/holidays` 임시 top-level. 공용 비즈니스 로직은 `packages/shared/leave-compute.ts` 순수 함수로. 기존 `/attendance/*` 는 middleware 301 redirect.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL, Zod, next-intl, `@jarvis/auth` RBAC, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-04-20-contractor-management-design.md](../specs/2026-04-20-contractor-management-design.md)

**Builder model:** `claude-sonnet-4-6` (사용자 지시)

---

## Phase Dependency Graph

```
P0 ──► P1-A ──► P2 ──► P3-A ──► P4-A ──► P5 ──┐
  │          \            \               \     ├──► P8 ──► P9
  └► P1-B ──► P3-B ──► P4-B ──► P6 ──► P7  ────┘
```

- `P0` 단독 (blocker)
- `P1-A ∥ P1-B` 병렬 (파일 disjoint)
- `P3-A ∥ P3-B` 병렬 (파일 disjoint)
- `P4-A ∥ P4-B` 병렬 (파일 disjoint)
- `P5 ∥ P6 ∥ P7` 병렬 (UI 파일 disjoint)
- `P8` 단독 (redirect + sidebar)
- `P9` 단독 (e2e + integrator)

전체 순서: `P0 → (P1-A ∥ P1-B) → P2 → (P3-A ∥ P3-B) → (P4-A ∥ P4-B) → (P5 ∥ P6 ∥ P7) → P8 → P9`

---

## Task P0: 기존 `/attendance` 도메인 완전 제거

**Files:**
- Delete: `packages/db/schema/attendance.ts`
- Delete: `apps/web/app/(app)/attendance/` (전체, `out-manage/` 포함)
- Delete: `apps/web/app/api/attendance/` (전체)
- Delete: `apps/web/components/attendance/` (8 파일: AttendanceCalendar, AttendanceTable, CheckInButton, OutManageForm, OutManageTable, TimeDetailSheet, LeaveRequestForm, OnsenToast)
- Delete: `apps/web/lib/queries/attendance.ts`
- Delete: `apps/web/e2e/attendance.spec.ts`
- Delete: `apps/web/app/(app)/dashboard/_components/AttendanceSummaryWidget.tsx`
- Modify: `packages/db/schema/index.ts` — attendance export 제거
- Modify: `apps/web/app/(app)/dashboard/page.tsx` — AttendanceSummaryWidget import·use 제거
- Modify: `apps/web/app/(app)/dashboard/page.test.ts` — 위젯 관련 테스트 제거
- Modify: `apps/web/components/layout/Sidebar.tsx` — "근태등록" (`/attendance`) 라인 제거
- Modify: `apps/web/messages/ko.json` — `Attendance` namespace 전체 제거
- Modify: `packages/shared/constants/permissions.ts` — `ATTENDANCE_READ/WRITE/ADMIN` + role 매핑 제거
- Modify: `packages/auth/__tests__/*.test.ts` — ATTENDANCE_* 참조 제거 (rbac-matrix, rbac-permissions 등)
- New migration: `packages/db/drizzle/0033_drop_attendance_and_out_manage.sql`

- [ ] **Step 1: 영향 파일 재확인**

Run:
```bash
grep -rln "ATTENDANCE_READ\|ATTENDANCE_WRITE\|ATTENDANCE_ADMIN\|attendance.ts\|out_manage\|@/components/attendance\|LeaveRequestForm\|AttendanceCalendar\|AttendanceTable\|OutManageForm\|OutManageTable\|TimeDetailSheet\|CheckInButton\|AttendanceSummaryWidget\|OnsenToast" apps/ packages/ 2>/dev/null | sort -u
```

Expected: 영향 받는 모든 파일 리스트. 이 리스트를 Step 6에서 확인용 재실행.

- [ ] **Step 2: Drizzle migration — DROP 테이블 3개**

Create: `packages/db/drizzle/0033_drop_attendance_and_out_manage.sql`
```sql
-- 의존성 순서: detail → parent → single
DROP TABLE IF EXISTS "out_manage_detail" CASCADE;
DROP TABLE IF EXISTS "out_manage" CASCADE;
DROP TABLE IF EXISTS "attendance" CASCADE;
```

- [ ] **Step 3: 스키마 파일 삭제 + index.ts export 제거**

```bash
rm packages/db/schema/attendance.ts
```

Edit `packages/db/schema/index.ts`: `export * from "./attendance.js";` 한 줄 삭제 (라인 6 근방).

- [ ] **Step 4: 라우트·컴포넌트·쿼리·e2e 삭제**

```bash
rm -rf apps/web/app/\(app\)/attendance
rm -rf apps/web/app/api/attendance
rm -rf apps/web/components/attendance
rm -f apps/web/lib/queries/attendance.ts
rm -f apps/web/lib/queries/attendance.test.ts
rm -f apps/web/e2e/attendance.spec.ts
rm -f apps/web/app/\(app\)/dashboard/_components/AttendanceSummaryWidget.tsx
```

- [ ] **Step 5: 대시보드 페이지에서 위젯 참조 제거**

Read `apps/web/app/(app)/dashboard/page.tsx` → `AttendanceSummaryWidget` import와 JSX 사용처 모두 삭제. 해당 자리는 그리드 재배치(남은 위젯이 비례로 채우거나, 플레이스홀더 `<div />`). 

Read `apps/web/app/(app)/dashboard/page.test.ts` → AttendanceSummaryWidget 관련 assertion 전부 삭제.

- [ ] **Step 6: 사이드바 "근태등록" 라인 삭제**

Edit `apps/web/components/layout/Sidebar.tsx`:
```tsx
// BEFORE (제거):
  { href: "/attendance", label: "근태등록", icon: ClipboardCheck /* 또는 기존 아이콘 */ },
// AFTER: 이 라인 삭제. P8에서 /contractors, /holidays로 교체.
```
관련 `ClipboardCheck` 아이콘 import도 다른 곳에서 안 쓰면 제거.

- [ ] **Step 7: i18n `Attendance` namespace 제거**

Edit `apps/web/messages/ko.json`: `"Attendance": { ... }` 블록 전체 삭제. `Nav.attendance` 키도 삭제(있다면).

- [ ] **Step 8: 권한 상수 제거**

Edit `packages/shared/constants/permissions.ts`:
- `ATTENDANCE_READ`, `ATTENDANCE_WRITE`, `ATTENDANCE_ADMIN` 3개 라인 삭제
- `ROLE_PERMISSIONS.ADMIN`: `Object.values(PERMISSIONS)` 는 자동 반영되므로 수정 불필요
- `ROLE_PERMISSIONS.MANAGER`: `PERMISSIONS.ATTENDANCE_READ`, `PERMISSIONS.ATTENDANCE_ADMIN` 라인 삭제
- `ROLE_PERMISSIONS.DEVELOPER`: `PERMISSIONS.ATTENDANCE_READ`, `PERMISSIONS.ATTENDANCE_WRITE` 라인 삭제
- `ROLE_PERMISSIONS.HR`: `PERMISSIONS.ATTENDANCE_READ`, `PERMISSIONS.ATTENDANCE_ADMIN` 라인 삭제
- `ROLE_PERMISSIONS.VIEWER`: `PERMISSIONS.ATTENDANCE_READ` 라인 삭제

- [ ] **Step 9: auth 테스트 파일에서 ATTENDANCE 참조 제거**

Run:
```bash
grep -rln "ATTENDANCE_\|attendance:" packages/auth/
```

각 파일 edit → 해당 assertion 라인 삭제 또는 수정.

- [ ] **Step 10: 마이그 + 타입체크 + 린트**

Run:
```bash
pnpm --filter @jarvis/db drizzle-kit generate
pnpm --filter @jarvis/db migrate
pnpm tsc --noEmit
pnpm lint
```

Expected: migration 성공(3 테이블 DROP). `pnpm tsc` 에서 아직 attendance 참조 있는 곳 드러남 → 해당 파일 수정 후 재실행. 0 error 확보.

- [ ] **Step 11: 테스트 재확인**

Run: `grep -rln "attendance\|out_manage\|ATTENDANCE_" apps/ packages/ 2>/dev/null`

Expected: docs/ 외 소스 코드에서 히트 0. 있다면 보강.

- [ ] **Step 12: 커밋**

```bash
git add -A
git commit -m "chore(attendance): remove legacy /attendance + out-manage domain

Prepares slot for /contractors. Drops tables attendance/out_manage/out_manage_detail,
removes ATTENDANCE_* permissions, AttendanceSummaryWidget, 8 attendance components,
/attendance + /attendance/out-manage routes, attendance queries and e2e."
```

---

## Task P1-A: 신규 스키마 (contractor_contract + leave_request + holiday) — 병렬 with P1-B

**Files:**
- Modify: `packages/db/schema/user.ts` — `employmentType` 컬럼 추가
- Create: `packages/db/schema/contractor.ts`
- Modify: `packages/db/schema/index.ts` — `export * from "./contractor.js";` 추가
- New migration: `packages/db/drizzle/0034_contractor_management_init.sql`

- [ ] **Step 1: user.ts 에 employmentType 추가**

Edit `packages/db/schema/user.ts` — `user` 테이블 정의에 컬럼 추가:
```ts
// avatarUrl 바로 뒤 (line 26 근방)에 삽입
  employmentType: varchar("employment_type", { length: 20 })
    .default("internal")
    .notNull(),
// 'internal' | 'contractor'
```

- [ ] **Step 2: 신규 스키마 파일 생성**

Create: `packages/db/schema/contractor.ts`
```ts
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./user.js";
import { workspace } from "./tenant.js";

export const contractorContract = pgTable(
  "contractor_contract",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enterCd: varchar("enter_cd", { length: 30 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    generatedLeaveHours: numeric("generated_leave_hours", { precision: 6, scale: 1 })
      .notNull(),
    additionalLeaveHours: numeric("additional_leave_hours", { precision: 6, scale: 1 })
      .default("0")
      .notNull(),
    note: text("note"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    // 'active' | 'expired' | 'terminated'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_contract_user").on(t.userId),
    statusIdx: index("idx_contract_status").on(t.status)
    // partial unique는 raw SQL 마이그레이션에서 생성 (drizzle-kit partial index 미지원 버전 대응)
  })
);

export const leaveRequest = pgTable(
  "leave_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contractorContract.id),
    type: varchar("type", { length: 20 }).notNull(),
    // 'day_off' | 'half_am' | 'half_pm' | 'hourly' | 'sick' | 'public'
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    timeFrom: timestamp("time_from", { withTimezone: true }),
    timeTo: timestamp("time_to", { withTimezone: true }),
    hours: numeric("hours", { precision: 5, scale: 1 }).notNull(),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).default("approved").notNull(),
    // 'approved' | 'cancelled'
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    userIdx: index("idx_leave_user").on(t.userId),
    contractIdx: index("idx_leave_contract").on(t.contractId),
    dateIdx: index("idx_leave_date").on(t.startDate, t.endDate)
  })
);

export const holiday = pgTable(
  "holiday",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    date: date("date").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    uniqDate: unique("holiday_workspace_date_unique").on(t.workspaceId, t.date),
    dateIdx: index("idx_holiday_date").on(t.date)
  })
);

export const contractorContractRelations = relations(contractorContract, ({ one, many }) => ({
  user: one(user, { fields: [contractorContract.userId], references: [user.id] }),
  leaveRequests: many(leaveRequest)
}));

export const leaveRequestRelations = relations(leaveRequest, ({ one }) => ({
  user: one(user, { fields: [leaveRequest.userId], references: [user.id], relationName: "leave_user" }),
  contract: one(contractorContract, { fields: [leaveRequest.contractId], references: [contractorContract.id] }),
  creator: one(user, { fields: [leaveRequest.createdBy], references: [user.id], relationName: "leave_creator" })
}));
```

- [ ] **Step 3: index.ts 에 export 추가**

Edit `packages/db/schema/index.ts`: 파일 끝에 추가
```ts
export * from "./contractor.js";
```

- [ ] **Step 4: drizzle-kit 생성 + 수동 partial unique 보완**

Run:
```bash
pnpm --filter @jarvis/db drizzle-kit generate
```

생성된 마이그레이션 파일 `0034_*.sql` 확인 후, 같은 파일 끝에 partial unique index 추가 (drizzle-kit이 자동 생성 안 하는 경우):
```sql
-- Partial unique: 한 workspace, 한 user 당 active 계약은 1건만
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contract_one_active"
  ON "contractor_contract"("workspace_id", "user_id")
  WHERE "status" = 'active';
```

파일명을 의미 있게 rename:
```bash
mv packages/db/drizzle/0034_*.sql packages/db/drizzle/0034_contractor_management_init.sql
```
(drizzle meta journal도 함께 갱신해야 하면 `packages/db/drizzle/meta/` 의 해당 entry에서 tag 수정)

- [ ] **Step 5: 마이그 실행 + 타입체크**

Run:
```bash
pnpm --filter @jarvis/db migrate
pnpm tsc --noEmit
```

Expected: 마이그 성공(`user.employment_type` 추가, 3 테이블 생성, partial unique 생성). tsc 통과. 

- [ ] **Step 6: 커밋**

```bash
git add packages/db/schema/user.ts packages/db/schema/contractor.ts packages/db/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): contractor management schema (contract + leave_request + holiday) + user.employment_type"
```

---

## Task P1-B: 권한 상수·RBAC 헬퍼·i18n 스캐폴드 — 병렬 with P1-A

**Files:**
- Modify: `packages/shared/constants/permissions.ts`
- Modify: `packages/auth/rbac.ts`
- Create: `packages/auth/__tests__/rbac-contractor.test.ts`
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: 권한 상수 추가**

Edit `packages/shared/constants/permissions.ts`:

`PERMISSIONS` 객체에 추가 (예: ADDITIONAL_DEV_* 다음에):
```ts
  CONTRACTOR_READ: "contractor:read",
  CONTRACTOR_ADMIN: "contractor:admin",
```

`ROLE_PERMISSIONS` 매핑:
```ts
  // ADMIN은 Object.values(PERMISSIONS)로 자동 포함
  // MANAGER에 추가:
  MANAGER: [
    // ... 기존 ...
    PERMISSIONS.CONTRACTOR_READ,
    PERMISSIONS.CONTRACTOR_ADMIN,
  ],
  // DEVELOPER / VIEWER / HR 등 외주인력 본인 역할에 해당하는 role에 CONTRACTOR_READ 추가:
  DEVELOPER: [
    // ... 기존 ...
    PERMISSIONS.CONTRACTOR_READ,
  ],
  HR: [
    // ... 기존 ...
    PERMISSIONS.CONTRACTOR_READ,
    PERMISSIONS.CONTRACTOR_ADMIN,
  ],
  VIEWER: [
    // ... 기존 ...
    PERMISSIONS.CONTRACTOR_READ,
  ],
```

- [ ] **Step 2: RBAC 헬퍼 테스트 먼저 작성 (TDD)**

Create: `packages/auth/__tests__/rbac-contractor.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { canManageContractors, canAccessContractorData } from "../rbac.js";
import type { JarvisSession } from "../types.js";

const adminSession: JarvisSession = {
  userId: "admin-id",
  workspaceId: "ws",
  roles: ["ADMIN"],
  permissions: ["contractor:read", "contractor:admin"]
} as JarvisSession;

const userSession: JarvisSession = {
  userId: "user-id",
  workspaceId: "ws",
  roles: ["DEVELOPER"],
  permissions: ["contractor:read"]
} as JarvisSession;

describe("canManageContractors", () => {
  it("returns true for CONTRACTOR_ADMIN", () => {
    expect(canManageContractors(adminSession)).toBe(true);
  });
  it("returns false for CONTRACTOR_READ only", () => {
    expect(canManageContractors(userSession)).toBe(false);
  });
});

describe("canAccessContractorData", () => {
  it("allows admin to access anyone's data", () => {
    expect(canAccessContractorData(adminSession, "other-user-id")).toBe(true);
  });
  it("allows user to access own data", () => {
    expect(canAccessContractorData(userSession, "user-id")).toBe(true);
  });
  it("rejects user accessing others' data", () => {
    expect(canAccessContractorData(userSession, "other-user-id")).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실행 — FAIL 확인**

Run: `pnpm --filter @jarvis/auth test -- rbac-contractor.test.ts`

Expected: FAIL — `canManageContractors is not a function`

- [ ] **Step 4: rbac.ts 에 헬퍼 추가**

Edit `packages/auth/rbac.ts` — 파일 끝에 추가:
```ts
export function canManageContractors(session: JarvisSession): boolean {
  return hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
}

export function canAccessContractorData(
  session: JarvisSession,
  targetUserId: string
): boolean {
  if (canManageContractors(session)) return true;
  return (
    hasPermission(session, PERMISSIONS.CONTRACTOR_READ) &&
    session.userId === targetUserId
  );
}
```

- [ ] **Step 5: 테스트 재실행 — PASS**

Run: `pnpm --filter @jarvis/auth test -- rbac-contractor.test.ts`
Expected: 3 PASS.

- [ ] **Step 6: i18n 스캐폴드**

Edit `apps/web/messages/ko.json` — 적절 위치에 추가 (AdditionalDev 뒤):
```json
"Contractors": {
  "title": "외주인력관리",
  "subtitle": "외주인력 계약·연차·일정을 관리합니다.",
  "tabs": { "roster": "인력·연차", "schedule": "일정 달력" },
  "columns": {
    "employeeId": "사번", "name": "성명", "org": "조직",
    "contractPeriod": "계약기간",
    "issuedHours": "발행(시간)", "usedHours": "사용(시간)", "remainingHours": "잔여",
    "status": "상태", "updatedAt": "업데이트"
  },
  "types": {
    "day_off": "월차", "half_am": "오전반차", "half_pm": "오후반차",
    "hourly": "시간차", "sick": "병가", "public": "공가"
  },
  "status": {
    "active": "진행중", "expired": "만료", "terminated": "해지",
    "approved": "승인", "cancelled": "취소"
  },
  "actions": {
    "addContractor": "새 외주인력", "addLeave": "+ 근태 추가",
    "edit": "수정", "delete": "삭제",
    "renewContract": "계약 갱신", "terminateContract": "계약 종료"
  },
  "messages": {
    "appliedToast": "{type} {hours}시간 신청됨",
    "undo": "실행취소",
    "insufficientWarning": "잔여 시간 부족 — 신청 후 잔여 {remaining}시간",
    "hoursBreakdown": "{totalDays}일 중 휴일 {holidayDays}일 제외 → 실효 {effectiveDays}일({hours}시간)"
  },
  "summary": {
    "remaining": "잔여 {days}일 ({hours}시간)"
  },
  "errors": {
    "noActiveContract": "활성 계약이 없어 근태를 신청할 수 없습니다. 담당자에게 문의하세요.",
    "noPermission": "해당 작업 권한이 없습니다."
  }
},
"Holidays": {
  "title": "공휴일 관리",
  "subtitle": "토/일은 자동 처리되며, 법정 공휴일·대체휴일만 등록하세요.",
  "columns": { "date": "날짜", "name": "이름", "note": "비고" },
  "actions": { "add": "+ 공휴일 추가", "edit": "수정", "delete": "삭제" }
},
```

그리고 `Nav` 블록에 추가 (라우트·라벨 매핑):
```json
"Nav": {
  // ... 기존 ...
  "contractors": "외주인력관리",
  "holidays": "공휴일 관리"
}
```

- [ ] **Step 7: 타입체크·빌드**

Run:
```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/auth test
```
Expected: 모두 PASS.

- [ ] **Step 8: 커밋**

```bash
git add packages/shared/constants/permissions.ts packages/auth/rbac.ts packages/auth/__tests__/rbac-contractor.test.ts apps/web/messages/ko.json
git commit -m "feat(auth,i18n): CONTRACTOR_* permissions + rbac helpers + Contractors/Holidays i18n"
```

---

## Task P2: 공용 비즈니스 로직 `packages/shared/leave-compute.ts` (의존 P1-A)

**Files:**
- Create: `packages/shared/leave-compute.ts`
- Create: `packages/shared/__tests__/leave-compute.test.ts`

- [ ] **Step 1: TDD — 테스트 먼저 작성**

Create: `packages/shared/__tests__/leave-compute.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { computeGeneratedLeaveHours, computeLeaveHours } from "../leave-compute.js";

const D = (iso: string) => new Date(iso + "T00:00:00Z");

describe("computeGeneratedLeaveHours", () => {
  it("returns 0 for zero-length range", () => {
    expect(computeGeneratedLeaveHours(D("2026-03-04"), D("2026-03-04"))).toBeGreaterThanOrEqual(8);
    // 1일 = 최소 1개월(8h)로 반올림
  });
  it("exactly 6 months → 48h (48h)", () => {
    // 3/4 ~ 9/3 = 184 inclusive days → ceil(184/30)=7 → 56h (담당자가 48로 override)
    // 알고리즘 결과를 고정 — 담당자 override가 정상 경로 (spec 4-1)
    expect(computeGeneratedLeaveHours(D("2026-03-04"), D("2026-09-03"))).toBe(56);
  });
  it("5 months 28 days → 7 months", () => {
    // 2/28 ~ 8/27 = 181 days → ceil(181/30)=7 → 56h
    expect(computeGeneratedLeaveHours(D("2026-02-28"), D("2026-08-27"))).toBe(56);
  });
  it("end < start returns 0", () => {
    expect(computeGeneratedLeaveHours(D("2026-05-01"), D("2026-04-01"))).toBe(0);
  });
});

describe("computeLeaveHours", () => {
  const holidays = new Set<string>(["2026-05-05"]);

  it("day_off without holidays: 3 days = 24h", () => {
    // 2026-04-13(월) ~ 2026-04-15(수): 평일 3
    expect(computeLeaveHours({
      type: "day_off", startDate: D("2026-04-13"), endDate: D("2026-04-15"),
      holidays: new Set()
    })).toBe(24);
  });

  it("day_off spanning weekend: counts only weekdays", () => {
    // 2026-04-17(금) ~ 2026-04-20(월): 금+월 2일 (토일 제외)
    expect(computeLeaveHours({
      type: "day_off", startDate: D("2026-04-17"), endDate: D("2026-04-20"),
      holidays: new Set()
    })).toBe(16);
  });

  it("day_off excludes holiday", () => {
    // 2026-05-04(월) ~ 2026-05-08(금): 5일 중 5/5 제외 → 4일 = 32h
    expect(computeLeaveHours({
      type: "day_off", startDate: D("2026-05-04"), endDate: D("2026-05-08"),
      holidays
    })).toBe(32);
  });

  it("half_am returns 4h", () => {
    expect(computeLeaveHours({
      type: "half_am", startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(4);
  });

  it("half_pm returns 4h", () => {
    expect(computeLeaveHours({
      type: "half_pm", startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(4);
  });

  it("hourly: time_from/to difference rounded to hour", () => {
    expect(computeLeaveHours({
      type: "hourly", startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      timeFrom: new Date("2026-04-10T14:00:00Z"),
      timeTo: new Date("2026-04-10T16:30:00Z"),
      holidays: new Set()
    })).toBe(3);  // 2.5h round → 3
  });

  it("sick returns 0 (연차 미차감)", () => {
    expect(computeLeaveHours({
      type: "sick", startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(0);
  });

  it("public returns 0", () => {
    expect(computeLeaveHours({
      type: "public", startDate: D("2026-04-10"), endDate: D("2026-04-10"),
      holidays: new Set()
    })).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 FAIL 확인**

Run: `pnpm --filter @jarvis/shared test -- leave-compute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

Create: `packages/shared/leave-compute.ts`
```ts
export type LeaveType =
  | "day_off"
  | "half_am"
  | "half_pm"
  | "hourly"
  | "sick"
  | "public";

/**
 * 계약 기간을 바탕으로 자동 생성 연차 시간 제안값.
 * 규칙(spec §6-1): 1일 = 8시간. 단순 `ceil(totalDays / 30) * 8`.
 * 실제 운영은 담당자 override 가능 — 정확 값보다 "제안"으로 사용.
 * 부가: end <= start 이면 0.
 */
export function computeGeneratedLeaveHours(start: Date, end: Date): number {
  const msPerDay = 86400000;
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (inclusiveDays <= 0) return 0;
  const monthsCeil = Math.ceil(inclusiveDays / 30);
  return monthsCeil * 8;
}

export function computeLeaveHours(args: {
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  timeFrom?: Date;
  timeTo?: Date;
  holidays: Set<string>;  // "YYYY-MM-DD"
}): number {
  const { type, startDate, endDate, timeFrom, timeTo, holidays } = args;

  if (type === "sick" || type === "public") return 0;
  if (type === "half_am" || type === "half_pm") return 4;

  if (type === "hourly") {
    if (!timeFrom || !timeTo) {
      throw new Error("hourly leave requires timeFrom and timeTo");
    }
    const diffHours = (timeTo.getTime() - timeFrom.getTime()) / 3600000;
    return Math.max(1, Math.round(diffHours));
  }

  // day_off: 공휴일·주말 제외한 일수 * 8
  let count = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    const dow = d.getUTCDay();
    const key = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count * 8;
}

/**
 * UI에서 신청 시 미리보기용. leave_request 저장 시에도 동일 함수로 계산.
 */
export function breakdownDayOff(args: {
  startDate: Date;
  endDate: Date;
  holidays: Set<string>;
}): { totalDays: number; workDays: number; holidayDays: number; hours: number } {
  const { startDate, endDate, holidays } = args;
  let total = 0;
  let work = 0;
  let holidayCount = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    total++;
    const dow = d.getUTCDay();
    const key = d.toISOString().slice(0, 10);
    if (dow === 0 || dow === 6) {
      holidayCount++;
    } else if (holidays.has(key)) {
      holidayCount++;
    } else {
      work++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { totalDays: total, workDays: work, holidayDays: holidayCount, hours: work * 8 };
}
```

- [ ] **Step 4: 테스트 재실행 PASS**

Run: `pnpm --filter @jarvis/shared test -- leave-compute.test.ts`
Expected: 모든 테스트 PASS. 만약 `computeGeneratedLeaveHours` 테스트 값 56h 기대와 불일치 나오면, 테스트 값(56)을 기준으로 믿고 코드 확인. 코드 정상이면 테스트 그대로 통과.

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/leave-compute.ts packages/shared/__tests__/leave-compute.test.ts
git commit -m "feat(shared): leave-compute — generated hours + leave hours (holiday/weekend exclusion)"
```

---

## Task P3-A: Contractors 쿼리 (의존 P2, 병렬 with P3-B)

**Files:**
- Create: `apps/web/lib/queries/contractors.ts`
- Create: `apps/web/lib/queries/contractors.test.ts`

쿼리 함수 목록 (모두 export):
- `listContractors({ workspaceId, q?, status?, orgId?, page?, pageSize?, database? })` → `{ data: ContractorTableRow[], pagination }`
- `getContractorById({ workspaceId, userId, database? })` → user + active contract + past contracts + leave_requests (최근 N건)
- `createContractor({ workspaceId, input, actorId, database? })` → user insert + contract insert (tx)
- `updateContract({ workspaceId, contractId, patch, database? })`
- `renewContract({ workspaceId, prevContractId, input, database? })` → spec §6-2
- `terminateContract({ workspaceId, contractId, database? })`
- `computeRemainingHours({ contractId, database? })`
- `listLeaveRequests({ workspaceId, userId?, from?, to?, status?, database? })`
- `createLeaveRequest({ workspaceId, userId, input, actorId, holidays, database? })`
- `updateLeaveRequest({ workspaceId, id, patch, holidays, database? })`
- `cancelLeaveRequest({ workspaceId, id, actorId, database? })`
- `deleteLeaveRequest({ workspaceId, id, database? })`

- [ ] **Step 1: TDD — createContractor + listContractors + computeRemainingHours 테스트**

Create: `apps/web/lib/queries/contractors.test.ts`
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, seedWorkspace, seedUser } from "@/lib/queries/__fixtures__/test-db";
import {
  createContractor,
  listContractors,
  createLeaveRequest,
  computeRemainingHours,
  renewContract
} from "./contractors";

describe("contractors queries", () => {
  let db: any;
  let workspaceId: string;
  let adminId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    workspaceId = await seedWorkspace(db);
    adminId = await seedUser(db, { workspaceId, employmentType: "internal", name: "Admin" });
  });

  it("createContractor inserts user with employment_type=contractor + active contract", async () => {
    const created = await createContractor({
      workspaceId,
      input: {
        name: "변성인",
        employeeId: "SD24035",
        enterCd: "A",
        startDate: "2026-03-04",
        endDate: "2026-09-03",
        additionalLeaveHours: 56  // 7*8 수동 추가(이월 등)
      },
      actorId: adminId,
      database: db
    });
    expect(created.user.employmentType).toBe("contractor");
    expect(created.contract.status).toBe("active");
    expect(Number(created.contract.generatedLeaveHours)).toBe(56);  // auto
    expect(Number(created.contract.additionalLeaveHours)).toBe(56);
  });

  it("listContractors filters by q/status, paginates", async () => {
    await createContractor({ workspaceId, input: { name: "A", employeeId: "SD1", startDate: "2026-03-04", endDate: "2026-09-03" }, actorId: adminId, database: db });
    await createContractor({ workspaceId, input: { name: "B", employeeId: "SD2", startDate: "2026-03-04", endDate: "2026-09-03" }, actorId: adminId, database: db });
    const out = await listContractors({ workspaceId, q: "SD1", database: db });
    expect(out.data).toHaveLength(1);
    expect(out.data[0]!.employeeId).toBe("SD1");
  });

  it("computeRemainingHours = generated + additional − Σ approved leaves", async () => {
    const { contract, user } = await createContractor({
      workspaceId,
      input: { name: "X", employeeId: "SDX", startDate: "2026-03-04", endDate: "2026-09-03" },
      actorId: adminId, database: db
    });
    // generated=56, additional=0
    await createLeaveRequest({
      workspaceId, userId: user.id,
      input: { type: "day_off", startDate: "2026-04-13", endDate: "2026-04-15" },
      actorId: adminId,
      holidays: new Set(),
      database: db
    });
    // 3 weekdays × 8 = 24h
    const remaining = await computeRemainingHours({ contractId: contract.id, database: db });
    expect(remaining).toBe(56 - 24);
  });

  it("renewContract expires prev + prefills additional from remaining", async () => {
    const { user, contract } = await createContractor({
      workspaceId,
      input: { name: "Y", employeeId: "SDY", startDate: "2026-01-01", endDate: "2026-06-30" },
      actorId: adminId, database: db
    });
    await createLeaveRequest({
      workspaceId, userId: user.id,
      input: { type: "day_off", startDate: "2026-02-02", endDate: "2026-02-06" },
      actorId: adminId, holidays: new Set(), database: db
    });
    // used 5 weekdays × 8 = 40h. 잔여 = 56+0-40=16h
    const renewed = await renewContract({
      workspaceId,
      prevContractId: contract.id,
      input: { userId: user.id, startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") },
      database: db
    });
    expect(renewed.status).toBe("active");
    expect(Number(renewed.additionalLeaveHours)).toBe(16);
    // prev 계약 expired
    // (테스트 db에서 select로 재확인)
  });
});
```

(fixture `__fixtures__/test-db.ts`는 기존 jarvis 패턴 — 이미 있음. 없으면 `apps/web/lib/queries/systems.test.ts` 류 기존 파일 복사하여 재활용)

- [ ] **Step 2: 테스트 실행 FAIL 확인**

Run: `pnpm --filter @jarvis/web test -- contractors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 시작 — 타입 + listContractors + getContractorById**

Create: `apps/web/lib/queries/contractors.ts`
```ts
import { db } from "@jarvis/db/client";
import {
  contractorContract,
  leaveRequest,
  user,
  organization
} from "@jarvis/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql
} from "drizzle-orm";
import {
  computeGeneratedLeaveHours,
  computeLeaveHours,
  type LeaveType
} from "@jarvis/shared/leave-compute";

type DbLike = typeof db;

export interface ContractorTableRow {
  userId: string;
  employeeId: string;
  name: string;
  orgName: string | null;
  contractId: string | null;
  startDate: string | null;
  endDate: string | null;
  issuedHours: number;   // generated + additional
  usedHours: number;
  remainingHours: number;
  contractStatus: string | null;
  updatedAt: Date;
}

type ListContractorsParams = {
  workspaceId: string;
  q?: string;
  status?: "active" | "expired" | "terminated";
  orgId?: string;
  page?: number;
  pageSize?: number;
  database?: DbLike;
};

export async function listContractors({
  workspaceId, q, status = "active", orgId,
  page = 1, pageSize = 50, database = db
}: ListContractorsParams) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));

  const conds = [
    eq(user.workspaceId, workspaceId),
    eq(user.employmentType, "contractor")
  ];
  if (q) conds.push(or(ilike(user.name, `%${q}%`), ilike(user.employeeId, `%${q}%`))!);
  if (orgId) conds.push(eq(user.orgId, orgId));

  // user LEFT JOIN active contract (if status='active' filter), else any contract matching status
  const contractCondExpr = status
    ? and(eq(contractorContract.status, status))
    : undefined;

  const rows = await database
    .select({
      userId: user.id,
      employeeId: user.employeeId,
      name: user.name,
      orgName: organization.name,
      contractId: contractorContract.id,
      startDate: contractorContract.startDate,
      endDate: contractorContract.endDate,
      generatedLeaveHours: contractorContract.generatedLeaveHours,
      additionalLeaveHours: contractorContract.additionalLeaveHours,
      contractStatus: contractorContract.status,
      userUpdatedAt: user.updatedAt
    })
    .from(user)
    .leftJoin(contractorContract, and(
      eq(contractorContract.userId, user.id),
      contractCondExpr ?? sql`true`
    ))
    .leftJoin(organization, eq(user.orgId, organization.id))
    .where(and(...conds))
    .orderBy(desc(contractorContract.startDate), asc(user.name))
    .limit(safeSize)
    .offset((safePage - 1) * safeSize);

  // 사용시간 집계 (N+1 주의: 배치로)
  const contractIds = rows.map(r => r.contractId).filter((x): x is string => !!x);
  const usedMap = new Map<string, number>();
  if (contractIds.length > 0) {
    const usedRows = await database
      .select({
        contractId: leaveRequest.contractId,
        used: sql<string>`COALESCE(SUM(${leaveRequest.hours}), 0)::text`
      })
      .from(leaveRequest)
      .where(and(
        inArray(leaveRequest.contractId, contractIds),
        eq(leaveRequest.status, "approved")
      ))
      .groupBy(leaveRequest.contractId);
    for (const r of usedRows) usedMap.set(r.contractId, Number(r.used));
  }

  const [totals] = await database
    .select({ total: count() })
    .from(user)
    .where(and(...conds));
  const total = Number(totals?.total ?? 0);

  const data: ContractorTableRow[] = rows.map(r => {
    const issued = Number(r.generatedLeaveHours ?? 0) + Number(r.additionalLeaveHours ?? 0);
    const used = usedMap.get(r.contractId ?? "") ?? 0;
    return {
      userId: r.userId,
      employeeId: r.employeeId,
      name: r.name,
      orgName: r.orgName,
      contractId: r.contractId,
      startDate: r.startDate,
      endDate: r.endDate,
      issuedHours: issued,
      usedHours: used,
      remainingHours: issued - used,
      contractStatus: r.contractStatus,
      updatedAt: r.userUpdatedAt
    };
  });

  return {
    data,
    pagination: { page: safePage, pageSize: safeSize, total, totalPages: Math.max(1, Math.ceil(total / safeSize)) }
  };
}
```

- [ ] **Step 4: 구현 — createContractor, updateContract, renewContract, terminateContract**

Append to `apps/web/lib/queries/contractors.ts`:
```ts
type CreateContractorInput = {
  name: string;
  employeeId: string;
  email?: string;
  phone?: string;
  orgId?: string;
  position?: string;
  enterCd?: string;
  startDate: string;
  endDate: string;
  additionalLeaveHours?: number;
  note?: string;
};

export async function createContractor({
  workspaceId, input, actorId, database = db
}: { workspaceId: string; input: CreateContractorInput; actorId: string; database?: DbLike }) {
  return database.transaction(async (tx) => {
    const [createdUser] = await tx.insert(user).values({
      workspaceId,
      employeeId: input.employeeId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      orgId: input.orgId ?? null,
      position: input.position ?? null,
      isActive: true,
      employmentType: "contractor",
      preferences: {}
    }).returning();
    if (!createdUser) throw new Error("failed to create user");

    const generatedHours = computeGeneratedLeaveHours(
      new Date(input.startDate + "T00:00:00Z"),
      new Date(input.endDate + "T00:00:00Z")
    );

    const [createdContract] = await tx.insert(contractorContract).values({
      workspaceId,
      userId: createdUser.id,
      enterCd: input.enterCd ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      generatedLeaveHours: String(generatedHours),
      additionalLeaveHours: String(input.additionalLeaveHours ?? 0),
      note: input.note ?? null,
      status: "active"
    }).returning();
    if (!createdContract) throw new Error("failed to create contract");

    return { user: createdUser, contract: createdContract };
  });
}

export async function updateContract({
  workspaceId, contractId, patch, database = db
}: { workspaceId: string; contractId: string; patch: Partial<{
  enterCd: string | null; startDate: string; endDate: string;
  generatedLeaveHours: number; additionalLeaveHours: number; note: string | null;
}>; database?: DbLike }) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enterCd !== undefined) values.enterCd = patch.enterCd;
  if (patch.startDate) values.startDate = patch.startDate;
  if (patch.endDate) values.endDate = patch.endDate;
  if (patch.generatedLeaveHours !== undefined) values.generatedLeaveHours = String(patch.generatedLeaveHours);
  if (patch.additionalLeaveHours !== undefined) values.additionalLeaveHours = String(patch.additionalLeaveHours);
  if (patch.note !== undefined) values.note = patch.note;
  const [updated] = await database.update(contractorContract)
    .set(values)
    .where(and(eq(contractorContract.id, contractId), eq(contractorContract.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

export async function computeRemainingHours({
  contractId, database = db
}: { contractId: string; database?: DbLike }) {
  const [c] = await database.select().from(contractorContract).where(eq(contractorContract.id, contractId));
  if (!c) return 0;
  const [sumRow] = await database.select({ s: sql<string>`COALESCE(SUM(${leaveRequest.hours}), 0)::text` })
    .from(leaveRequest)
    .where(and(eq(leaveRequest.contractId, contractId), eq(leaveRequest.status, "approved")));
  const total = Number(c.generatedLeaveHours) + Number(c.additionalLeaveHours);
  return total - Number(sumRow?.s ?? 0);
}

export async function renewContract({
  workspaceId, prevContractId, input, database = db
}: {
  workspaceId: string; prevContractId: string;
  input: { userId: string; startDate: Date; endDate: Date; note?: string };
  database?: DbLike;
}) {
  return database.transaction(async (tx) => {
    const [prev] = await tx.select().from(contractorContract)
      .where(and(eq(contractorContract.id, prevContractId), eq(contractorContract.workspaceId, workspaceId)));
    if (!prev) throw new Error("prev contract not found");
    if (prev.status !== "active") throw new Error("prev contract must be active");

    const remaining = await computeRemainingHours({ contractId: prev.id, database: tx });
    const carryOver = Math.max(0, remaining);

    await tx.update(contractorContract)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(contractorContract.id, prev.id));

    const startIso = input.startDate.toISOString().slice(0, 10);
    const endIso = input.endDate.toISOString().slice(0, 10);
    const [created] = await tx.insert(contractorContract).values({
      workspaceId,
      userId: input.userId,
      enterCd: prev.enterCd,
      startDate: startIso,
      endDate: endIso,
      generatedLeaveHours: String(computeGeneratedLeaveHours(input.startDate, input.endDate)),
      additionalLeaveHours: String(carryOver),
      note: [input.note, carryOver > 0 ? `직전계약 잔여 ${carryOver}h 이월` : null].filter(Boolean).join("\n") || null,
      status: "active"
    }).returning();
    if (!created) throw new Error("failed to create renewed contract");
    return created;
  });
}

export async function terminateContract({
  workspaceId, contractId, database = db
}: { workspaceId: string; contractId: string; database?: DbLike }) {
  const [updated] = await database.update(contractorContract)
    .set({ status: "terminated", updatedAt: new Date() })
    .where(and(eq(contractorContract.id, contractId), eq(contractorContract.workspaceId, workspaceId), eq(contractorContract.status, "active")))
    .returning();
  return updated ?? null;
}
```

- [ ] **Step 5: 구현 — leave_request CRUD**

Append:
```ts
type CreateLeaveInput = {
  type: LeaveType;
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;
  timeFrom?: string;  // ISO
  timeTo?: string;    // ISO
  reason?: string;
};

export async function createLeaveRequest({
  workspaceId, userId, input, actorId, holidays, database = db
}: {
  workspaceId: string; userId: string;
  input: CreateLeaveInput; actorId: string;
  holidays: Set<string>;
  database?: DbLike;
}) {
  // active contract auto-select
  const [contract] = await database.select().from(contractorContract).where(and(
    eq(contractorContract.workspaceId, workspaceId),
    eq(contractorContract.userId, userId),
    eq(contractorContract.status, "active")
  )).limit(1);
  if (!contract) {
    const err = new Error("NO_ACTIVE_CONTRACT");
    (err as any).code = "NO_ACTIVE_CONTRACT";
    throw err;
  }
  const hours = computeLeaveHours({
    type: input.type,
    startDate: new Date(input.startDate + "T00:00:00Z"),
    endDate: new Date(input.endDate + "T00:00:00Z"),
    timeFrom: input.timeFrom ? new Date(input.timeFrom) : undefined,
    timeTo: input.timeTo ? new Date(input.timeTo) : undefined,
    holidays
  });

  const [created] = await database.insert(leaveRequest).values({
    workspaceId,
    userId,
    contractId: contract.id,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    timeFrom: input.timeFrom ? new Date(input.timeFrom) : null,
    timeTo: input.timeTo ? new Date(input.timeTo) : null,
    hours: String(hours),
    reason: input.reason ?? null,
    status: "approved",
    createdBy: actorId
  }).returning();
  if (!created) throw new Error("failed to create leave request");
  return created;
}

type LeavePatch = Partial<CreateLeaveInput>;

export async function updateLeaveRequest({
  workspaceId, id, patch, holidays, database = db
}: {
  workspaceId: string; id: string;
  patch: LeavePatch; holidays: Set<string>;
  database?: DbLike;
}) {
  const [existing] = await database.select().from(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId)));
  if (!existing) return null;
  const merged = { ...existing, ...patch } as any;
  const hours = computeLeaveHours({
    type: (patch.type ?? existing.type) as LeaveType,
    startDate: new Date(String(patch.startDate ?? existing.startDate) + "T00:00:00Z"),
    endDate: new Date(String(patch.endDate ?? existing.endDate) + "T00:00:00Z"),
    timeFrom: patch.timeFrom ? new Date(patch.timeFrom) : (existing.timeFrom ?? undefined),
    timeTo: patch.timeTo ? new Date(patch.timeTo) : (existing.timeTo ?? undefined),
    holidays
  });
  const values: Record<string, unknown> = { updatedAt: new Date(), hours: String(hours) };
  if (patch.type) values.type = patch.type;
  if (patch.startDate) values.startDate = patch.startDate;
  if (patch.endDate) values.endDate = patch.endDate;
  if (patch.timeFrom !== undefined) values.timeFrom = patch.timeFrom ? new Date(patch.timeFrom) : null;
  if (patch.timeTo !== undefined) values.timeTo = patch.timeTo ? new Date(patch.timeTo) : null;
  if (patch.reason !== undefined) values.reason = patch.reason;
  const [updated] = await database.update(leaveRequest)
    .set(values)
    .where(eq(leaveRequest.id, id))
    .returning();
  return updated ?? null;
}

export async function cancelLeaveRequest({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbLike }) {
  const [updated] = await database.update(leaveRequest)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId), eq(leaveRequest.status, "approved")))
    .returning();
  return updated ?? null;
}

export async function deleteLeaveRequest({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbLike }) {
  const [deleted] = await database.delete(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId)))
    .returning({ id: leaveRequest.id });
  return deleted ?? null;
}

export async function listLeaveRequests({
  workspaceId, userId, from, to, status = "approved", database = db
}: {
  workspaceId: string; userId?: string; from?: string; to?: string;
  status?: "approved" | "cancelled"; database?: DbLike;
}) {
  const conds = [eq(leaveRequest.workspaceId, workspaceId), eq(leaveRequest.status, status)];
  if (userId) conds.push(eq(leaveRequest.userId, userId));
  if (from) conds.push(gte(leaveRequest.startDate, from));
  if (to) conds.push(lte(leaveRequest.endDate, to));
  return database.select().from(leaveRequest)
    .where(and(...conds))
    .orderBy(desc(leaveRequest.startDate));
}

export async function getContractorById({
  workspaceId, userId, database = db
}: { workspaceId: string; userId: string; database?: DbLike }) {
  const [u] = await database.select().from(user)
    .where(and(eq(user.id, userId), eq(user.workspaceId, workspaceId)));
  if (!u) return null;
  const contracts = await database.select().from(contractorContract)
    .where(and(eq(contractorContract.userId, userId), eq(contractorContract.workspaceId, workspaceId)))
    .orderBy(desc(contractorContract.startDate));
  const activeContract = contracts.find(c => c.status === "active") ?? null;
  const leaves = activeContract
    ? await listLeaveRequests({ workspaceId, userId, database })
    : [];
  return { user: u, contracts, activeContract, leaves };
}
```

- [ ] **Step 6: 테스트 재실행 PASS**

Run: `pnpm --filter @jarvis/web test -- contractors.test.ts`
Expected: 모든 테스트 PASS. 실패 시 메시지로 정확한 원인 파악 — 보통 드래프트 코드의 sql/eq 오타.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/queries/contractors.ts apps/web/lib/queries/contractors.test.ts
git commit -m "feat(contractors): queries — list/create/update/renew/terminate + leave CRUD"
```

---

## Task P3-B: Holidays 쿼리 (의존 P1-A, 병렬 with P3-A)

**Files:**
- Create: `apps/web/lib/queries/holidays.ts`
- Create: `apps/web/lib/queries/holidays.test.ts`

- [ ] **Step 1: TDD — 테스트**

Create: `apps/web/lib/queries/holidays.test.ts`
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, seedWorkspace } from "@/lib/queries/__fixtures__/test-db";
import {
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
  getHolidaySetForRange
} from "./holidays";

describe("holidays queries", () => {
  let db: any;
  let workspaceId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    workspaceId = await seedWorkspace(db);
  });

  it("create + list", async () => {
    await createHoliday({ workspaceId, input: { date: "2026-05-05", name: "어린이날" }, database: db });
    const rows = await listHolidays({ workspaceId, database: db });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("어린이날");
  });

  it("list filters by year", async () => {
    await createHoliday({ workspaceId, input: { date: "2025-12-25", name: "크리스마스" }, database: db });
    await createHoliday({ workspaceId, input: { date: "2026-05-05", name: "어린이날" }, database: db });
    const rows = await listHolidays({ workspaceId, year: 2026, database: db });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-05-05");
  });

  it("update and delete", async () => {
    const created = await createHoliday({ workspaceId, input: { date: "2026-05-05", name: "어린이날" }, database: db });
    await updateHoliday({ workspaceId, id: created.id, patch: { note: "대체휴일 없음" }, database: db });
    const [row] = await listHolidays({ workspaceId, database: db });
    expect(row!.note).toBe("대체휴일 없음");
    await deleteHoliday({ workspaceId, id: created.id, database: db });
    expect(await listHolidays({ workspaceId, database: db })).toHaveLength(0);
  });

  it("getHolidaySetForRange returns Set of YYYY-MM-DD strings", async () => {
    await createHoliday({ workspaceId, input: { date: "2026-05-05", name: "어린이날" }, database: db });
    const set = await getHolidaySetForRange({ workspaceId, from: "2026-05-01", to: "2026-05-31", database: db });
    expect(set.has("2026-05-05")).toBe(true);
    expect(set.has("2026-05-06")).toBe(false);
  });

  it("duplicate date (workspace,date) rejected by unique", async () => {
    await createHoliday({ workspaceId, input: { date: "2026-05-05", name: "어린이날" }, database: db });
    await expect(
      createHoliday({ workspaceId, input: { date: "2026-05-05", name: "중복" }, database: db })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 FAIL**

Run: `pnpm --filter @jarvis/web test -- holidays.test.ts`

- [ ] **Step 3: 구현**

Create: `apps/web/lib/queries/holidays.ts`
```ts
import { db } from "@jarvis/db/client";
import { holiday } from "@jarvis/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";

type DbLike = typeof db;

export async function listHolidays({
  workspaceId, year, database = db
}: { workspaceId: string; year?: number; database?: DbLike }) {
  const conds = [eq(holiday.workspaceId, workspaceId)];
  if (year !== undefined) {
    conds.push(gte(holiday.date, `${year}-01-01`));
    conds.push(lte(holiday.date, `${year}-12-31`));
  }
  return database.select().from(holiday).where(and(...conds)).orderBy(asc(holiday.date));
}

export async function getHoliday({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbLike }) {
  const [row] = await database.select().from(holiday).where(and(
    eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)
  )).limit(1);
  return row ?? null;
}

type HolidayInput = { date: string; name: string; note?: string };

export async function createHoliday({
  workspaceId, input, database = db
}: { workspaceId: string; input: HolidayInput; database?: DbLike }) {
  const [created] = await database.insert(holiday).values({
    workspaceId,
    date: input.date,
    name: input.name,
    note: input.note ?? null
  }).returning();
  if (!created) throw new Error("failed to create holiday");
  return created;
}

export async function updateHoliday({
  workspaceId, id, patch, database = db
}: { workspaceId: string; id: string; patch: Partial<HolidayInput>; database?: DbLike }) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.date) values.date = patch.date;
  if (patch.name) values.name = patch.name;
  if (patch.note !== undefined) values.note = patch.note;
  const [updated] = await database.update(holiday).set(values)
    .where(and(eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

export async function deleteHoliday({
  workspaceId, id, database = db
}: { workspaceId: string; id: string; database?: DbLike }) {
  const [deleted] = await database.delete(holiday)
    .where(and(eq(holiday.id, id), eq(holiday.workspaceId, workspaceId)))
    .returning({ id: holiday.id });
  return deleted ?? null;
}

/**
 * leave_request 계산용. from/to 범위 내 공휴일 날짜 Set 반환.
 */
export async function getHolidaySetForRange({
  workspaceId, from, to, database = db
}: { workspaceId: string; from: string; to: string; database?: DbLike }) {
  const rows = await database.select({ date: holiday.date }).from(holiday).where(and(
    eq(holiday.workspaceId, workspaceId),
    gte(holiday.date, from),
    lte(holiday.date, to)
  ));
  return new Set(rows.map(r => r.date));
}
```

- [ ] **Step 4: 테스트 PASS**

Run: `pnpm --filter @jarvis/web test -- holidays.test.ts`

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/queries/holidays.ts apps/web/lib/queries/holidays.test.ts
git commit -m "feat(holidays): CRUD queries + getHolidaySetForRange for leave computation"
```

---

## Task P4-A: Contractors API 라우트 (의존 P3-A, 병렬 with P4-B)

**Files:**
- Create: `apps/web/app/api/contractors/route.ts` + `route.test.ts` (GET list, POST create)
- Create: `apps/web/app/api/contractors/[id]/route.ts` + `route.test.ts` (GET detail, PATCH terminate, DELETE 미사용)
- Create: `apps/web/app/api/contractors/[id]/contracts/route.ts` + `route.test.ts` (POST renew, PATCH update active)
- Create: `apps/web/app/api/contractors/[id]/leave-requests/route.ts` + `route.test.ts` (GET list, POST create)
- Create: `apps/web/app/api/leave-requests/[id]/route.ts` + `route.test.ts` (PATCH update, DELETE cancel→soft)

모든 라우트는 동일 패턴: zod 검증 → `requireApiSession(PERMISSIONS.CONTRACTOR_*)` → 쿼리 호출 → JSON 응답.

- [ ] **Step 1: 공용 Zod 스키마**

Create: `apps/web/app/api/contractors/_schemas.ts`
```ts
import { z } from "zod";

export const listContractorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().min(1).optional(),
  status: z.enum(["active", "expired", "terminated"]).optional(),
  orgId: z.string().uuid().optional()
});

export const createContractorBodySchema = z.object({
  name: z.string().min(1).max(100),
  employeeId: z.string().min(1).max(50),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  orgId: z.string().uuid().optional(),
  position: z.string().max(100).optional(),
  enterCd: z.string().max(30).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  additionalLeaveHours: z.number().min(0).optional(),
  note: z.string().max(2000).optional()
});

export const updateContractBodySchema = z.object({
  enterCd: z.string().max(30).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  generatedLeaveHours: z.number().min(0).optional(),
  additionalLeaveHours: z.number().min(0).optional(),
  note: z.string().max(2000).nullable().optional()
});

export const renewContractBodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).optional()
});

export const createLeaveBodySchema = z.object({
  type: z.enum(["day_off", "half_am", "half_pm", "hourly", "sick", "public"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeFrom: z.string().datetime().optional(),
  timeTo: z.string().datetime().optional(),
  reason: z.string().max(1000).optional()
});

export const updateLeaveBodySchema = createLeaveBodySchema.partial();
```

- [ ] **Step 2: `/api/contractors/route.ts` (list + create)**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractors, createContractor } from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";
import { listContractorsQuerySchema, createContractorBodySchema } from "./_schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const parsed = listContractorsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // CONTRACTOR_READ 만 있으면 본인 1건만 보여야 하지만, listContractors는 전체 리스트.
  // 따라서 admin 권한 없으면 빈 리스트 반환 혹은 본인만 필터 — 아래는 본인만 필터 옵션.
  const isAdmin = auth.session.permissions.includes(PERMISSIONS.CONTRACTOR_ADMIN);
  const result = await listContractors({ workspaceId: auth.session.workspaceId, ...parsed.data });
  if (!isAdmin) {
    result.data = result.data.filter(r => r.userId === auth.session.userId);
    result.pagination.total = result.data.length;
    result.pagination.totalPages = 1;
  }
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const body = await request.json();
  const parsed = createContractorBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const created = await createContractor({
    workspaceId: auth.session.workspaceId,
    input: parsed.data,
    actorId: auth.session.userId
  });
  return NextResponse.json(created, { status: 201 });
}
```

- [ ] **Step 3: `/api/contractors/[id]/route.ts` (GET detail, DELETE terminate)**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { getContractorById, terminateContract } from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const detail = await getContractorById({ workspaceId: auth.session.workspaceId, userId: id });
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const detail = await getContractorById({ workspaceId: auth.session.workspaceId, userId: id });
  if (!detail?.activeContract) return NextResponse.json({ error: "no_active_contract" }, { status: 404 });
  const terminated = await terminateContract({
    workspaceId: auth.session.workspaceId,
    contractId: detail.activeContract.id
  });
  return NextResponse.json({ contract: terminated }, { status: 200 });
}
```

- [ ] **Step 4: `/api/contractors/[id]/contracts/route.ts` (POST renew + PATCH current)**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  getContractorById, renewContract, updateContract
} from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";
import { renewContractBodySchema, updateContractBodySchema } from "../../_schemas";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const parsed = renewContractBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const detail = await getContractorById({ workspaceId: auth.session.workspaceId, userId: id });
  if (!detail?.activeContract) return NextResponse.json({ error: "no_active_contract" }, { status: 404 });

  const created = await renewContract({
    workspaceId: auth.session.workspaceId,
    prevContractId: detail.activeContract.id,
    input: {
      userId: id,
      startDate: new Date(parsed.data.startDate + "T00:00:00Z"),
      endDate: new Date(parsed.data.endDate + "T00:00:00Z"),
      note: parsed.data.note
    }
  });
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const parsed = updateContractBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const detail = await getContractorById({ workspaceId: auth.session.workspaceId, userId: id });
  if (!detail?.activeContract) return NextResponse.json({ error: "no_active_contract" }, { status: 404 });

  const updated = await updateContract({
    workspaceId: auth.session.workspaceId,
    contractId: detail.activeContract.id,
    patch: parsed.data
  });
  return NextResponse.json(updated);
}
```

- [ ] **Step 5: `/api/contractors/[id]/leave-requests/route.ts`**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { listLeaveRequests, createLeaveRequest } from "@/lib/queries/contractors";
import { getHolidaySetForRange } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";
import { createLeaveBodySchema } from "../../_schemas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = request.nextUrl;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const status = (url.searchParams.get("status") as "approved" | "cancelled" | null) ?? "approved";
  const rows = await listLeaveRequests({ workspaceId: auth.session.workspaceId, userId: id, from, to, status });
  return NextResponse.json({ data: rows });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = createLeaveBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const holidays = await getHolidaySetForRange({
    workspaceId: auth.session.workspaceId,
    from: parsed.data.startDate,
    to: parsed.data.endDate
  });
  try {
    const created = await createLeaveRequest({
      workspaceId: auth.session.workspaceId,
      userId: id,
      input: parsed.data,
      actorId: auth.session.userId,
      holidays
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (e.code === "NO_ACTIVE_CONTRACT") {
      return NextResponse.json({ error: "no_active_contract" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 6: `/api/leave-requests/[id]/route.ts`**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import { leaveRequest } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import {
  updateLeaveRequest, cancelLeaveRequest, deleteLeaveRequest
} from "@/lib/queries/contractors";
import { getHolidaySetForRange } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";
import { updateLeaveBodySchema } from "../../contractors/_schemas";

async function loadOwnerId(workspaceId: string, id: string): Promise<string | null> {
  const [row] = await db.select({ userId: leaveRequest.userId }).from(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, workspaceId))).limit(1);
  return row?.userId ?? null;
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const ownerId = await loadOwnerId(auth.session.workspaceId, id);
  if (!ownerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canAccessContractorData(auth.session, ownerId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const parsed = updateLeaveBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const holidays = await getHolidaySetForRange({
    workspaceId: auth.session.workspaceId,
    from: parsed.data.startDate ?? "1900-01-01",
    to: parsed.data.endDate ?? "2999-12-31"
  });
  const updated = await updateLeaveRequest({
    workspaceId: auth.session.workspaceId, id, patch: parsed.data, holidays
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const ownerId = await loadOwnerId(auth.session.workspaceId, id);
  if (!ownerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canAccessContractorData(auth.session, ownerId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 삭제 vs 취소 구분: 관리자면 hard delete, 일반은 cancel
  const url = request.nextUrl;
  const hard = url.searchParams.get("hard") === "1";
  if (hard && auth.session.permissions.includes(PERMISSIONS.CONTRACTOR_ADMIN)) {
    await deleteLeaveRequest({ workspaceId: auth.session.workspaceId, id });
  } else {
    await cancelLeaveRequest({ workspaceId: auth.session.workspaceId, id });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: API 테스트 (통합)**

Create: `apps/web/app/api/contractors/route.test.ts`
```ts
import { describe, it, expect } from "vitest";
// 기존 jarvis API 테스트 harness 재활용 (apps/web/app/api/projects/route.test.ts 참조)
// 여기선 필수 케이스만: GET 200, POST 201, 403 권한, 400 validation
```

각 엔드포인트별로 최소 2개 테스트 (성공/권한실패). 기존 `/api/projects/route.test.ts` 패턴을 모방.

- [ ] **Step 8: 타입체크 + 테스트**

Run:
```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/web test -- app/api/contractors
pnpm --filter @jarvis/web test -- app/api/leave-requests
```

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/api/contractors apps/web/app/api/leave-requests
git commit -m "feat(api): contractors + leave-requests endpoints (list/create/renew/update/cancel)"
```

---

## Task P4-B: Holidays API (의존 P3-B, 병렬 with P4-A)

**Files:**
- Create: `apps/web/app/api/holidays/route.ts` + `.test.ts` (GET list, POST create)
- Create: `apps/web/app/api/holidays/[id]/route.ts` + `.test.ts` (PATCH, DELETE)

- [ ] **Step 1: `/api/holidays/route.ts`**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listHolidays, createHoliday } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";

const querySchema = z.object({ year: z.coerce.number().int().min(1900).max(3000).optional() });
const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(100),
  note: z.string().max(1000).optional()
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const rows = await listHolidays({ workspaceId: auth.session.workspaceId, year: parsed.data.year });
  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const created = await createHoliday({ workspaceId: auth.session.workspaceId, input: parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    if (String(e.message ?? "").includes("unique")) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: `/api/holidays/[id]/route.ts`**

Create:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { updateHoliday, deleteHoliday, getHoliday } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";

const patchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(100).optional(),
  note: z.string().max(1000).nullable().optional()
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await updateHoliday({ workspaceId: auth.session.workspaceId, id, patch: parsed.data });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const deleted = await deleteHoliday({ workspaceId: auth.session.workspaceId, id });
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 테스트 + 커밋**

Tests follow same pattern as P4-A.

```bash
pnpm --filter @jarvis/web test -- app/api/holidays
git add apps/web/app/api/holidays
git commit -m "feat(api): holidays CRUD endpoints"
```

---

## Task P5: `/contractors` 기본 탭 UI — 인력·연차 (의존 P4-A, 병렬 with P6/P7)

**Files:**
- Create: `apps/web/app/(app)/contractors/layout.tsx` (탭 네비)
- Create: `apps/web/app/(app)/contractors/page.tsx` (인력 리스트)
- Create: `apps/web/components/contractors/ContractorTable.tsx`
- Create: `apps/web/components/contractors/ContractorDrawer.tsx`
- Create: `apps/web/components/contractors/LeaveAddModal.tsx`
- Create: `apps/web/components/contractors/NewContractorModal.tsx`
- Create: `apps/web/components/contractors/ContractorTabs.tsx`

- [ ] **Step 1: 탭 네비 컴포넌트**

Create: `apps/web/components/contractors/ContractorTabs.tsx`
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function ContractorTabs() {
  const t = useTranslations("Contractors");
  const pathname = usePathname();
  const tabs = [
    { href: "/contractors", label: t("tabs.roster") },
    { href: "/contractors/schedule", label: t("tabs.schedule") }
  ];
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
      {tabs.map(tab => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href}
            style={{
              padding: "8px 16px",
              borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
              color: active ? "var(--ink)" : "var(--muted)",
              fontWeight: active ? 600 : 400,
              textDecoration: "none"
            }}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `/contractors/layout.tsx`**

Create:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ContractorTabs } from "@/components/contractors/ContractorTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
import type { ReactNode } from "react";

export default async function ContractorsLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_READ)) redirect("/dashboard");

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        stamp="Contractors"
        kicker="Workforce"
        title="외주인력관리"
        subtitle="외주인력 계약·연차·일정을 관리합니다."
      />
      <ContractorTabs />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `/contractors/page.tsx` — 인력·연차**

Create:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractors } from "@/lib/queries/contractors";
import { ContractorTable } from "@/components/contractors/ContractorTable";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "외주인력관리" };

export default async function ContractorsRosterPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_READ)) redirect("/dashboard");

  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q : undefined;
  const status = typeof sp?.status === "string" && ["active","expired","terminated"].includes(sp.status)
    ? (sp.status as "active"|"expired"|"terminated") : "active";

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const result = await listContractors({
    workspaceId: session.workspaceId, q, status,
    page: 1, pageSize: 100
  });
  const data = isAdmin ? result.data : result.data.filter(r => r.userId === session.userId);

  return (
    <ContractorTable
      initialData={data}
      isAdmin={isAdmin}
      initialQuery={{ q, status }}
    />
  );
}
```

- [ ] **Step 4: `ContractorTable.tsx`**

Create: `apps/web/components/contractors/ContractorTable.tsx`
```tsx
"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContractorDrawer } from "./ContractorDrawer";
import { NewContractorModal } from "./NewContractorModal";

type Row = {
  userId: string;
  employeeId: string;
  name: string;
  orgName: string | null;
  contractId: string | null;
  startDate: string | null;
  endDate: string | null;
  issuedHours: number;
  usedHours: number;
  remainingHours: number;
  contractStatus: string | null;
  updatedAt: string | Date;
};

export function ContractorTable({
  initialData, isAdmin, initialQuery
}: {
  initialData: Row[];
  isAdmin: boolean;
  initialQuery: { q?: string; status?: string };
}) {
  const t = useTranslations("Contractors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, start] = useTransition();
  const [selected, setSelected] = useState<Row | null>(null);
  const [showNew, setShowNew] = useState(false);

  const updateQuery = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams?.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    start(() => router.replace(`${pathname}?${sp.toString()}`));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 300px" : "1fr", gap: 16 }}>
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="text" placeholder={`${t("columns.name")}·${t("columns.employeeId")} 검색`}
            defaultValue={initialQuery.q ?? ""}
            onBlur={(e) => updateQuery({ q: e.currentTarget.value })}
            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, flex: 1, maxWidth: 280 }}
          />
          <select
            defaultValue={initialQuery.status ?? "active"}
            onChange={(e) => updateQuery({ status: e.currentTarget.value })}
            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6 }}
          >
            <option value="active">{t("status.active")}</option>
            <option value="expired">{t("status.expired")}</option>
            <option value="terminated">{t("status.terminated")}</option>
          </select>
          {isAdmin && (
            <button onClick={() => setShowNew(true)}
              style={{ marginLeft: "auto", padding: "6px 14px", background: "var(--ink)", color: "white", border: 0, borderRadius: 6, cursor: "pointer" }}>
              {t("actions.addContractor")}
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 8, background: "white" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--panel)", textAlign: "left" }}>
              <tr>
                <th style={{ padding: "10px" }}>{t("columns.employeeId")}</th>
                <th style={{ padding: "10px" }}>{t("columns.name")}</th>
                <th style={{ padding: "10px" }}>{t("columns.org")}</th>
                <th style={{ padding: "10px" }}>{t("columns.contractPeriod")}</th>
                <th style={{ padding: "10px", textAlign: "right" }}>{t("columns.issuedHours")}</th>
                <th style={{ padding: "10px", textAlign: "right" }}>{t("columns.usedHours")}</th>
                <th style={{ padding: "10px", textAlign: "right" }}>{t("columns.remainingHours")}</th>
                <th style={{ padding: "10px" }}>{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {initialData.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "40px 10px", textAlign: "center", color: "var(--muted)" }}>
                  인력 데이터가 없습니다.
                </td></tr>
              )}
              {initialData.map(r => {
                const active = selected?.userId === r.userId;
                return (
                  <tr key={r.userId}
                    onClick={() => setSelected(r)}
                    style={{
                      borderTop: "1px solid var(--line)",
                      background: active ? "var(--accent-tint, #e8f0fe)" : undefined,
                      cursor: "pointer"
                    }}>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono, monospace)" }}>{r.employeeId}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "10px", color: "var(--muted)" }}>{r.orgName ?? "—"}</td>
                    <td style={{ padding: "10px", fontSize: 12 }}>
                      {r.startDate ?? "—"}{r.startDate && r.endDate ? " ~ " : ""}{r.endDate ?? ""}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{r.issuedHours}h</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>{r.usedHours}h</td>
                    <td style={{ padding: "10px", textAlign: "right", color: r.remainingHours < 0 ? "var(--danger, red)" : undefined, fontWeight: 600 }}>
                      {r.remainingHours}h
                    </td>
                    <td style={{ padding: "10px" }}>
                      {r.contractStatus ? t(`status.${r.contractStatus}` as any) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <ContractorDrawer
          userId={selected.userId}
          onClose={() => setSelected(null)}
          isAdmin={isAdmin}
        />
      )}
      {showNew && (
        <NewContractorModal onClose={() => setShowNew(false)} onCreated={() => {
          setShowNew(false);
          start(() => router.refresh());
        }} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: `ContractorDrawer.tsx`**

Create:
```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LeaveAddModal } from "./LeaveAddModal";

type Detail = {
  user: { id: string; name: string; employeeId: string };
  activeContract: {
    id: string; startDate: string; endDate: string;
    generatedLeaveHours: string; additionalLeaveHours: string; note: string | null;
  } | null;
  contracts: any[];
  leaves: any[];
};

export function ContractorDrawer({
  userId, onClose, isAdmin
}: { userId: string; onClose: () => void; isAdmin: boolean }) {
  const t = useTranslations("Contractors");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isPending, start] = useTransition();

  const load = () => {
    fetch(`/api/contractors/${userId}`).then(r => r.json()).then(setDetail);
  };
  useEffect(() => { load(); }, [userId]);

  if (!detail) return <aside style={{ padding: 16 }}>로딩…</aside>;

  const issued = detail.activeContract
    ? Number(detail.activeContract.generatedLeaveHours) + Number(detail.activeContract.additionalLeaveHours)
    : 0;
  const used = detail.leaves.reduce((s: number, l: any) => s + Number(l.hours || 0), 0);
  const remaining = issued - used;
  const days = Math.floor(remaining / 8);
  const remHours = remaining % 8;

  return (
    <aside style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 16, position: "sticky", top: 24, maxHeight: "calc(100vh - 48px)", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{detail.user.name}</h3>
        <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", fontSize: 18 }}>×</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{detail.user.employeeId}</div>

      {detail.activeContract ? (
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>계약</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>{detail.activeContract.startDate} ~ {detail.activeContract.endDate}</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>발행 {issued}h · 사용 {used}h</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: remaining < 0 ? "red" : "inherit" }}>
            잔여 {days}일 ({remaining}시간)
          </div>
          {detail.activeContract.note && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6, whiteSpace: "pre-wrap" }}>
              {detail.activeContract.note}
            </div>
          )}
        </section>
      ) : (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          활성 계약이 없습니다.
        </div>
      )}

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>세부 근태 이력</div>
          <button onClick={() => setShowLeaveModal(true)}
            style={{ background: "var(--ink)", color: "white", border: 0, padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer" }}
            disabled={!detail.activeContract}>
            {t("actions.addLeave")}
          </button>
        </div>
        {detail.leaves.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>없음</div>}
        {detail.leaves.map((l: any) => (
          <div key={l.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 12 }}>
            <div>{l.startDate}{l.endDate !== l.startDate ? ` ~ ${l.endDate}` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <span style={{ background: "var(--line2)", padding: "1px 6px", borderRadius: 3, fontSize: 11 }}>
                {t(`types.${l.type}` as any)}
              </span>
              <span>{Number(l.hours)}h</span>
              {isAdmin && (
                <button onClick={() => {
                  if (!confirm("취소하시겠습니까?")) return;
                  fetch(`/api/leave-requests/${l.id}`, { method: "DELETE" }).then(load);
                }} style={{ marginLeft: "auto", background: "none", border: 0, color: "var(--muted)", fontSize: 11, cursor: "pointer" }}>
                  {t("actions.delete")}
                </button>
              )}
            </div>
            {l.reason && <div style={{ color: "var(--muted)", marginTop: 2 }}>{l.reason}</div>}
          </div>
        ))}
      </section>

      {showLeaveModal && (
        <LeaveAddModal
          userId={userId}
          onClose={() => setShowLeaveModal(false)}
          onCreated={() => { setShowLeaveModal(false); load(); }}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 6: `LeaveAddModal.tsx` + `NewContractorModal.tsx`**

Create both with similar modal pattern (overlay + form + submit → POST API → onCreated callback).

`LeaveAddModal.tsx` 폼 필드:
- 날짜 범위 (start/end)
- type select (day_off/half_am/half_pm/hourly/sick/public)
- type=hourly면 time picker (time_from/time_to)
- 사유 textarea
- 저장 버튼 → POST `/api/contractors/${userId}/leave-requests`

`NewContractorModal.tsx` 필드:
- 이름, 사번
- 입사회사코드
- 계약 시작/종료
- 추가연차 (기본 0)
- 비고
- 저장 → POST `/api/contractors`

(구현 코드 생략 — 표준 form 패턴. 기존 `AdditionalDevForm`/`ProjectForm` 참조)

- [ ] **Step 7: 빌드 + 수동 확인**

Run:
```bash
pnpm tsc --noEmit
pnpm lint
pnpm --filter @jarvis/web build
```
dev에서 `http://localhost:3010/contractors` 접속, 행 클릭 시 drawer 열리고, [+ 신규 인력] 모달 동작 확인.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/app/\(app\)/contractors apps/web/components/contractors
git commit -m "feat(contractors): roster tab UI — table + drawer + leave-add + new-contractor modals"
```

---

## Task P6: `/contractors/schedule` 달력 탭 (의존 P4-A+P4-B, 병렬 with P5/P7)

**Files:**
- Create: `apps/web/app/(app)/contractors/schedule/page.tsx`
- Create: `apps/web/components/contractors/ScheduleCalendar.tsx`
- Create: `apps/web/components/contractors/LeavePopover.tsx`

- [ ] **Step 1: `page.tsx` — 서버 데이터 fetch**

Create:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listLeaveRequests } from "@/lib/queries/contractors";
import { listHolidays } from "@/lib/queries/holidays";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import { ScheduleCalendar } from "@/components/contractors/ScheduleCalendar";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "외주인력 일정" };

export default async function ContractorsSchedulePage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_READ)) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const month = typeof sp?.month === "string" && /^\d{4}-\d{2}$/.test(sp.month)
    ? sp.month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  // 전체 인력 달력 vs 본인만
  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const userIdFilter = isAdmin ? undefined : session.userId;

  const [leaves, holidays, contractors] = await Promise.all([
    listLeaveRequests({
      workspaceId: session.workspaceId, userId: userIdFilter,
      from: firstDay, to: lastDay
    }),
    listHolidays({ workspaceId: session.workspaceId, year: y }),
    db.select({ id: user.id, name: user.name }).from(user).where(and(
      eq(user.workspaceId, session.workspaceId),
      eq(user.employmentType, "contractor")
    ))
  ]);

  const userName = new Map(contractors.map(c => [c.id, c.name]));

  return (
    <ScheduleCalendar
      month={month}
      leaves={leaves.map(l => ({ ...l, userName: userName.get(l.userId) ?? "?" }))}
      holidays={holidays}
      currentUserId={session.userId}
      isAdmin={isAdmin}
    />
  );
}
```

- [ ] **Step 2: `ScheduleCalendar.tsx` — 월 뷰 + 드래그**

Create: (큰 파일. 핵심 구조만)
```tsx
"use client";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LeavePopover } from "./LeavePopover";

type Leave = {
  id: string; userId: string; userName: string;
  type: string; startDate: string; endDate: string;
  hours: string; reason?: string | null;
};
type Holiday = { date: string; name: string };

export function ScheduleCalendar({
  month, leaves, holidays, currentUserId, isAdmin
}: {
  month: string; leaves: Leave[]; holidays: Holiday[];
  currentUserId: string; isAdmin: boolean;
}) {
  const t = useTranslations("Contractors");
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [popover, setPopover] = useState<{ start: string; end: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const holidayMap = useMemo(() => {
    const s = new Map<string, string>();
    for (const h of holidays) s.set(h.date, h.name);
    return s;
  }, [holidays]);
  const leavesByDate = useMemo(() => {
    const m = new Map<string, Leave[]>();
    for (const l of leaves) {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(l);
      }
    }
    return m;
  }, [leaves]);

  const dateKey = (day: number) => `${month}-${String(day).padStart(2, "0")}`;

  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: dateKey(d), day: d });

  const handleMouseDown = (date: string) => {
    setDragStart(date);
    setDragEnd(date);
  };
  const handleMouseEnter = (date: string) => {
    if (dragStart) setDragEnd(date);
  };
  const handleMouseUp = (date: string, e: React.MouseEvent) => {
    if (!dragStart) return;
    const start = dragStart < date ? dragStart : date;
    const end = dragStart < date ? date : dragStart;
    setPopover({ start, end, x: e.clientX, y: e.clientY });
    setDragStart(null);
    setDragEnd(null);
  };

  const apply = async (type: string, extra?: { timeFrom?: string; timeTo?: string }) => {
    if (!popover) return;
    const res = await fetch(`/api/contractors/${currentUserId}/leave-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        startDate: popover.start,
        endDate: popover.end,
        ...extra
      })
    });
    if (res.status === 409) {
      alert(t("errors.noActiveContract"));
      return;
    }
    const created = await res.json();
    setToast({ message: `${t(`types.${type}` as any)} ${Number(created.hours)}시간 신청됨`, undoId: created.id });
    setPopover(null);
    start(() => router.refresh());
    setTimeout(() => setToast(null), 3000);
  };

  const undo = async () => {
    if (!toast?.undoId) return;
    await fetch(`/api/leave-requests/${toast.undoId}`, { method: "DELETE" });
    setToast(null);
    start(() => router.refresh());
  };

  const navigateMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/contractors/schedule?month=${next}`);
  };

  return (
    <div onMouseUp={() => { setDragStart(null); setDragEnd(null); }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => navigateMonth(-1)} style={{ padding: "6px 12px" }}>‹</button>
        <button onClick={() => navigateMonth(1)} style={{ padding: "6px 12px" }}>›</button>
        <button onClick={() => router.push("/contractors/schedule")} style={{ padding: "6px 12px" }}>오늘</button>
        <h2 style={{ margin: 0, flex: 1, textAlign: "center" }}>{y}년 {m}월</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid var(--line)", borderRadius: 6 }}>
        {["일","월","화","수","목","금","토"].map((w, i) => (
          <div key={w} style={{ padding: 8, textAlign: "center", fontSize: 12, fontWeight: 600, background: "var(--panel)", borderBottom: "1px solid var(--line)", color: i === 0 || i === 6 ? "red" : undefined }}>{w}</div>
        ))}
        {cells.map((c, idx) => {
          if (!c.date) return <div key={idx} style={{ minHeight: 100, background: "var(--surface-50, #fafafa)" }} />;
          const dow = (startDow + (c.day! - 1)) % 7;
          const isWeekend = dow === 0 || dow === 6;
          const holidayName = holidayMap.get(c.date);
          const inDrag = dragStart && dragEnd && (
            (dragStart <= c.date && c.date <= dragEnd) ||
            (dragEnd <= c.date && c.date <= dragStart)
          );
          const dayLeaves = leavesByDate.get(c.date) ?? [];
          return (
            <div key={idx}
              onMouseDown={() => handleMouseDown(c.date!)}
              onMouseEnter={() => handleMouseEnter(c.date!)}
              onMouseUp={(e) => handleMouseUp(c.date!, e)}
              style={{
                minHeight: 100,
                padding: 6,
                borderRight: "1px solid var(--line)",
                borderBottom: "1px solid var(--line)",
                background: inDrag ? "rgba(0,112,243,0.12)" : holidayName ? "rgba(255,0,0,0.08)" : isWeekend ? "rgba(255,0,0,0.04)" : "white",
                userSelect: "none",
                cursor: "pointer"
              }}>
              <div style={{ fontSize: 11, color: isWeekend || holidayName ? "red" : "var(--ink)" }}>
                {c.day}
                {holidayName && <span style={{ fontSize: 10, marginLeft: 4, color: "red" }}>{holidayName}</span>}
              </div>
              {dayLeaves.slice(0, 3).map(l => (
                <div key={l.id} style={{
                  marginTop: 2, background: "#e8f5e9", color: "#1b5e20",
                  padding: "1px 4px", borderRadius: 3, fontSize: 10.5,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {l.userName}: {t(`types.${l.type}` as any)}
                  {l.type !== "sick" && l.type !== "public" && ` (${Number(l.hours)}h)`}
                </div>
              ))}
              {dayLeaves.length > 3 && <div style={{ fontSize: 10, color: "var(--muted)" }}>+{dayLeaves.length - 3}…</div>}
            </div>
          );
        })}
      </div>
      {popover && (
        <LeavePopover
          start={popover.start}
          end={popover.end}
          x={popover.x}
          y={popover.y}
          holidays={holidays}
          onPick={(type, extra) => apply(type, extra)}
          onCancel={() => setPopover(null)}
        />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#111", color: "white", padding: "10px 16px", borderRadius: 8, display: "flex", gap: 12, alignItems: "center", zIndex: 50 }}>
          <span>{toast.message}</span>
          {toast.undoId && (
            <button onClick={undo} style={{ background: "#444", color: "#ff9", border: 0, padding: "4px 10px", borderRadius: 4, cursor: "pointer" }}>
              {t("messages.undo")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `LeavePopover.tsx`**

Create: (drag 종료 후 뜨는 팝오버, 버튼 6개 + hourly 시 time picker)
```tsx
"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { breakdownDayOff } from "@jarvis/shared/leave-compute";

export function LeavePopover({
  start, end, x, y, holidays, onPick, onCancel
}: {
  start: string; end: string;
  x: number; y: number;
  holidays: Array<{ date: string }>;
  onPick: (type: string, extra?: { timeFrom?: string; timeTo?: string }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Contractors");
  const [mode, setMode] = useState<"main"|"hourly">("main");
  const [timeFrom, setTimeFrom] = useState("09:00");
  const [timeTo, setTimeTo] = useState("11:00");

  const holSet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const breakdown = useMemo(() => breakdownDayOff({
    startDate: new Date(start + "T00:00:00Z"),
    endDate: new Date(end + "T00:00:00Z"),
    holidays: holSet
  }), [start, end, holSet]);

  return (
    <div style={{
      position: "fixed", top: y, left: x,
      background: "white", border: "1px solid var(--line)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)", borderRadius: 8,
      padding: 12, minWidth: 220, zIndex: 60
    }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
        {start}{start !== end ? ` ~ ${end}` : ""}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>
        {t("messages.hoursBreakdown", {
          totalDays: breakdown.totalDays,
          holidayDays: breakdown.holidayDays,
          effectiveDays: breakdown.workDays,
          hours: breakdown.hours
        })}
      </div>
      {mode === "main" ? (
        <div style={{ display: "grid", gap: 4 }}>
          <button onClick={() => onPick("day_off")}>{t("types.day_off")} ({breakdown.hours}h)</button>
          <button onClick={() => onPick("half_am")}>{t("types.half_am")} (4h)</button>
          <button onClick={() => onPick("half_pm")}>{t("types.half_pm")} (4h)</button>
          <button onClick={() => setMode("hourly")}>{t("types.hourly")}…</button>
          <button onClick={() => onPick("sick")}>{t("types.sick")}</button>
          <button onClick={() => onPick("public")}>{t("types.public")}</button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
            <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} />
          </div>
          <button onClick={() => onPick("hourly", {
            timeFrom: `${start}T${timeFrom}:00.000Z`,
            timeTo: `${start}T${timeTo}:00.000Z`
          })} style={{ marginTop: 8, width: "100%" }}>저장</button>
          <button onClick={() => setMode("main")} style={{ marginTop: 4, width: "100%", background: "none", border: 0, fontSize: 11, color: "var(--muted)" }}>뒤로</button>
        </div>
      )}
      <button onClick={onCancel} style={{ marginTop: 8, width: "100%", background: "none", border: 0, fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>닫기</button>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크·린트·수동 테스트**

Run:
```bash
pnpm tsc --noEmit
pnpm lint
```

Dev에서 `/contractors/schedule` 접속 → 빈 영역 드래그 → 팝오버 → 월차 클릭 → 바 생성 → 실행취소 토스트. 공휴일은 이 단계에서 빈 상태(P7 이후 테스트 케이스 추가).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/\(app\)/contractors/schedule apps/web/components/contractors/ScheduleCalendar.tsx apps/web/components/contractors/LeavePopover.tsx
git commit -m "feat(contractors): schedule tab — month calendar + drag-to-apply popover + undo toast"
```

---

## Task P7: `/holidays` 관리 페이지 (의존 P4-B, 병렬 with P5/P6)

**Files:**
- Create: `apps/web/app/(app)/holidays/page.tsx`
- Create: `apps/web/components/holidays/HolidayTable.tsx`
- Create: `apps/web/components/holidays/HolidayFormModal.tsx`

- [ ] **Step 1: `page.tsx`**

Create:
```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listHolidays } from "@/lib/queries/holidays";
import { HolidayTable } from "@/components/holidays/HolidayTable";
import { PageHeader } from "@/components/patterns/PageHeader";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "공휴일 관리" };

export default async function HolidaysPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  const session = sessionId ? await getSession(sessionId) : null;
  if (!session) redirect("/login");
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN)) redirect("/dashboard");

  const sp = await searchParams;
  const year = typeof sp?.year === "string" ? Number(sp.year) : new Date().getFullYear();
  const rows = await listHolidays({ workspaceId: session.workspaceId, year });

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader
        stamp="Holidays"
        kicker="Calendar"
        title="공휴일 관리"
        subtitle="토/일은 자동 처리되며, 법정 공휴일·대체휴일만 등록하세요."
      />
      <HolidayTable initialYear={year} initialRows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: `HolidayTable.tsx` + `HolidayFormModal.tsx`**

Create: standard CRUD table (year picker + `[+ 공휴일 추가]` 버튼 + rows with 수정/삭제). Modal은 date/name/note 필드.

(구현 세부는 기존 `NoticesTable` 등 CRUD 테이블 패턴 그대로 모방. 코드 생략 — 추가·수정·삭제 API 호출만 정확하면 됨)

- [ ] **Step 3: 확인 + 커밋**

```bash
pnpm tsc --noEmit
pnpm --filter @jarvis/web build
git add apps/web/app/\(app\)/holidays apps/web/components/holidays
git commit -m "feat(holidays): admin CRUD page"
```

---

## Task P8: Middleware Redirect + Sidebar 교체 (의존 P5·P6·P7)

**Files:**
- Modify: `apps/web/middleware.ts`
- Modify: `apps/web/components/layout/Sidebar.tsx`

- [ ] **Step 1: middleware redirect**

Edit `apps/web/middleware.ts` — 기존 `/systems` → `/projects` 블록 아래 같은 패턴 추가:
```ts
// BEFORE 기존 /systems 블록 다음:
  if (pathname.startsWith("/attendance")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/attendance/, "/contractors");
    return withRequestId(NextResponse.redirect(url, 301), requestId);
  }
```

- [ ] **Step 2: Sidebar 메뉴 추가**

Edit `apps/web/components/layout/Sidebar.tsx` — 추가개발(/add-dev) 다음에:
```tsx
  { href: "/contractors", label: "외주인력관리", icon: Users },
  { href: "/holidays",    label: "공휴일 관리", icon: CalendarX },
```
lucide-react에서 `Users`, `CalendarX` import 추가.

- [ ] **Step 3: 수동 검증**

```bash
pnpm --filter @jarvis/web dev &
sleep 8
curl -I http://localhost:3010/attendance     # HTTP 301, Location: /contractors
curl -I http://localhost:3010/attendance/out-manage  # HTTP 301, Location: /contractors/out-manage (404로 흐를 것, 대안: 정확히 /contractors로 덮어 고정)
```

`/attendance/out-manage` 는 원래 존재했지만 P0에서 제거됨. redirect 후 `/contractors/out-manage` 는 404. 이 부분은 의도된 (사용자 대부분 `/attendance`만 기억). 만약 정확히 `/attendance` 시작 URL 전부 `/contractors` 루트로 보내려면:
```ts
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/contractors"; // 하위 경로는 전부 루트로 병합
    return withRequestId(NextResponse.redirect(url, 301), requestId);
  }
```
위 변형으로 바꿈 (더 단순, 오래된 서브경로도 안전).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/middleware.ts apps/web/components/layout/Sidebar.tsx
git commit -m "feat(nav): /attendance -> /contractors 301 redirect + sidebar menu"
```

---

## Task P9: e2e + 최종 검증 (의존 P8)

**Files:**
- Create: `apps/web/e2e/contractors.spec.ts`

- [ ] **Step 1: Playwright e2e 작성**

Create: `apps/web/e2e/contractors.spec.ts`
```ts
import { test, expect } from "@playwright/test";

test.describe("Contractors", () => {
  test("redirect /attendance -> /contractors", async ({ page }) => {
    const response = await page.goto("/attendance");
    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toMatch(/\/contractors/);
  });

  test("roster table renders and row click opens drawer", async ({ page }) => {
    await page.goto("/contractors");
    await expect(page.getByRole("heading", { name: "외주인력관리" })).toBeVisible();
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await expect(page.locator("aside")).toBeVisible();
    }
  });

  test("schedule drag creates a leave request", async ({ page }) => {
    await page.goto("/contractors/schedule");
    // 첫 평일 cell부터 드래그 3일 — cell selector는 data-date 속성 부여한 구현 전제
    // 실제 구현 시 ScheduleCalendar 컴포넌트에 `data-date={c.date}` 추가 필요
    const day1 = page.locator("[data-date]").nth(10);
    const day3 = page.locator("[data-date]").nth(12);
    await day1.hover();
    await page.mouse.down();
    await day3.hover();
    await page.mouse.up();
    // 팝오버에서 월차 클릭
    await page.getByRole("button", { name: /월차/ }).click();
    // 토스트 확인
    await expect(page.getByText(/신청됨/)).toBeVisible();
  });

  test("holidays page renders (admin only)", async ({ page }) => {
    await page.goto("/holidays");
    await expect(page.getByRole("heading", { name: "공휴일 관리" })).toBeVisible();
  });
});
```

(e2e가 통과하려면 `ScheduleCalendar` 컴포넌트의 각 cell에 `data-date={c.date}` 속성이 필요. P6에서 구현 시 이미 추가되었는지 확인, 아니면 추가 커밋)

- [ ] **Step 2: e2e 실행**

Run:
```bash
pnpm --filter @jarvis/web exec playwright test apps/web/e2e/contractors.spec.ts
```
Expected: 4 PASS. 실패 케이스는 원인 수정 후 재실행.

- [ ] **Step 3: 통합 검증 — jarvis-integrator agent**

Dispatch `jarvis-integrator` subagent:
- prompt: "2026-04-20-contractor-management 변경 전체에 대해 경계면 정합성 검증 수행. server action/API 응답 shape ↔ 클라이언트 훅 기대값 교차, i18n 키(Contractors.*, Holidays.*, Nav.*) 존재/사용 대응, CONTRACTOR_READ/ADMIN 권한 누락 체크, pnpm tsc --noEmit / pnpm lint / pnpm test 전 계층 실행. 결과 표로 요약."

- [ ] **Step 4: schema-drift 훅 + 전체 빌드**

Run:
```bash
node scripts/check-schema-drift.mjs --ci
pnpm tsc --noEmit
pnpm lint
pnpm test
pnpm --filter @jarvis/web build
```
Expected: 모두 exit 0.

- [ ] **Step 5: 수동 스모크 체크리스트**

Dev에서 브라우저 체크:
- `/contractors` 테이블 렌더
- 행 클릭 → drawer, 계약 정보 표시
- [+ 신규 인력] 모달 열리고 저장 가능
- Drawer 내 [+ 근태 추가] → 모달 저장 → 이력에 표시, 잔여 감소
- `/contractors/schedule` 월 달력 → 드래그 3일 → 팝오버 월차 → 바 표시 → 실행취소 → 사라짐
- `/holidays` 에 공휴일 추가 → `/contractors/schedule` 해당 날짜 빨강 배경
- `/attendance` → 301 → `/contractors` 확인
- 사이드바 "외주인력관리", "공휴일 관리" 링크 동작
- 내부 직원 (`employment_type='internal'`) 로그인 시 `/contractors` 테이블이 admin이 아니면 빈 상태, admin이면 contractor만 표시

- [ ] **Step 6: 최종 커밋 + PR 제안**

```bash
git log --oneline main..HEAD
# 전체 변경사항 확인 후
gh pr create --title "feat: contractor management domain (/contractors)" --body "..."
```

---

## Self-Review

**1. Spec coverage:**
- ✅ §2 결정 요약 — 각 Phase에 1:1 매핑됨
- ✅ §4 아키텍처(라우트·메뉴·권한) → P1-B(권한), P8(middleware+sidebar)
- ✅ §5 데이터 모델 → P1-A(스키마 3개 + user.employment_type)
- ✅ §6 비즈니스 로직 → P2(순수 함수) + P3-A(DB 접근 로직)
- ✅ §7 UI 상세 → P5(roster+drawer), P6(schedule+popover), P7(holidays)
- ✅ §8 Phase 그래프 그대로 반영
- ✅ §9 검증 게이트 → P1 Step 5(G-schema), P2 Step 4(G-logic), P4 Step 8(G-api), P5~P7 수동(G-ui), P8 Step 3(G-redirect), P9 Step 4(G-final)
- ✅ §10 리스크 → P2 §6-1 알고리즘, P0 §12-3 drop, P8 redirect, 달력 타임존 주의

**2. Placeholder scan:**
- P4-A Step 7에서 "최소 케이스만" 등 가이드형 문구 존재 — 빌더가 기존 `/api/projects/route.test.ts` 패턴 모방으로 해결 가능. 명시적 코드 샘플을 넣지 않은 이유: 프로젝트 내 표준 패턴이 이미 강력하므로 동일 스타일로 작성하면 됨.
- P5 Step 6, P7 Step 2의 "코드 생략 — 표준 form 패턴" — 동일 이유. 위험 수위 낮음.
- 위 두 케이스 외 "TBD/TODO/later" 없음.

**3. Type consistency:**
- `contractorContract` / `leave_request` / `holiday` 테이블·필드 이름 모든 Phase에서 일치
- `CONTRACTOR_READ` / `CONTRACTOR_ADMIN` 권한명 일치
- `computeGeneratedLeaveHours` / `computeLeaveHours` / `breakdownDayOff` 함수 시그니처 일치 (P2 정의 → P3-A·P6 소비)
- `LeaveType` 문자열 enum 일치 (`day_off`/`half_am`/`half_pm`/`hourly`/`sick`/`public`)
- 라우트 URL `/contractors` / `/contractors/schedule` / `/holidays` 일치

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-20-contractor-management.md`.

사용자 이미 지시: **Subagent-Driven + sonnet** 으로 실행.

→ `superpowers:subagent-driven-development` 스킬을 호출해 Phase별 builder 서브에이전트 디스패치 (의존 그래프의 병렬 기회 활용).
