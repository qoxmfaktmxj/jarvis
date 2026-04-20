---
title: "외주인력관리 도메인 설계 (/contractors) — /attendance 완전 교체"
date: 2026-04-20
status: approved
author: brainstorming-session (Claude Opus 4.7)
implementation:
  approach: superpowers:subagent-driven-development
  builder_model: claude-sonnet-4-6
related:
  - 스크린샷: C:\Users\kms\Pictures\Screenshots\스크린샷 2026-04-20 15310*.png (원본 이수시스템 3화면)
  - 엑셀 데이터: C:\Users\kms\Downloads\외주인력계약관리.xls
---

# 외주인력관리 도메인 설계 (`/contractors`)

## 0. 한 문장 요약

기존 `/attendance`(일반 직원 출퇴근·연차 신청 화면, 더미 데이터 다수)를 완전 폐기하고, 사내 EHR 외주인력 3화면(외주인력계약관리·외주인력일정관리·외주인력근태현황)을 통합한 **외주인력관리** 도메인을 `/contractors`에 신설한다. 연차는 **시간 단위**(1일 = 8시간), **자동 승인**, 공휴일·주말 자동 제외.

## 1. 배경

- 이수시스템 EHR에 "외주인력계약관리 / 외주인력일정관리 / 외주인력근태현황" 3메뉴가 있고, 공통 엔티티(외주인력)를 각기 다른 뷰로 보여주다 보니 중복·일관성 부족.
  - 계약관리 컬럼(사번/성명/계약기간/생성연차/추가연차/비고) ↔ 근태현황 상단(사번/성명/계약기간/발행일수/사용일수/잔여일수/비고): 사실상 같은 테이블, 집계 컬럼만 다름.
  - 일정관리 달력(셀의 "이름: 휴가명(승인)" 바) ↔ 근태현황 하단 세부 테이블: 같은 데이터의 공간적 vs 시간순 뷰.
- 현재 jarvis `/attendance`는 일반 직원 출퇴근·더미 연차 신청 페이지로, 외주인력 개념 없음. `attendance`·`out_manage`·`out_manage_detail` 테이블 보유.
- "월차 / 반차 / 오후반차 / 오후반차2" 같은 이산 타입은 해석이 어려움(오후반차2 의미 불명). 실무 시간 사용을 유연히 담으려면 **시간 단위**가 본질.
- 외주인력도 jarvis에 로그인 가능. 기본 프로필은 `user` 테이블(`employeeId`/`name`/`phone`/`orgId`/`position`)로 커버되고, 계약·연차는 별도 엔티티로 분리해야 user 테이블이 무거워지지 않음.

## 2. 결정 요약 (브레인스토밍 합의)

| 결정 | 값 |
|---|---|
| 기존 `/attendance` 및 관련 자산 | **완전 폐기** (테이블·라우트·컴포넌트·권한·i18n·e2e 전부) |
| 신규 URL | **`/contractors`** (301 redirect `/attendance/*` → `/contractors/*`) |
| 화면명 / 사이드바 라벨 | **외주인력관리** |
| 탭 구조 | 상단 2탭: **① 인력·연차** · **② 일정 달력** |
| 인력·연차 탭 레이아웃 | 좌측 인력 테이블 + 우측 Drawer(Master-Detail). Drawer에 [+근태 추가]·[수정]·[삭제] |
| 일정 달력 탭 | **월 뷰만**, 드래그 → 팝오버(월차/오전반차/오후반차/시간차/병가/공가) → 즉시 저장 + 3초 [실행취소] 토스트 |
| 외주인력 식별 | `user.employment_type = 'contractor'` 플래그 추가 |
| 계약·연차 테이블 | **신규 `contractor_contract`** (user:contract = 1:N, active 1건 partial unique) |
| 근태 신청 테이블 | **신규 `leave_request`** (시간 단위 차감, auto-approved) |
| 공휴일 관리 | **신규 `holiday`** + `/holidays` 임시 top-level 메뉴 (사이드바 일괄 재정리는 TODO) |
| 연차 단위 | **시간 단위** (1일 = 8시간), 최소 신청 1시간 |
| 휴가 타입 | 프리셋 `day_off`(8h) / `half_am`(4h) / `half_pm`(4h) + `hourly`(가변) + `sick` / `public` (연차 차감 X, 기록만) |
| 공휴일·주말 | 신청 일수 계산 시 **자동 제외**. 토/일 런타임 판정, 법정휴일은 매년 수동 입력 |
| 생성연차 자동 계산 | 담당자 **기본값 제안** 용도. `ceil(totalDays / 30) * 8` 로 출발, 실제 검증 케이스는 TDD로 고정. **override 우선** |
| 계약 갱신 | `[계약 갱신]` 버튼 → 직전 active 계약 `expired` + 새 계약 생성, `additional_leave_hours`에 직전 잔여 자동 prefill |
| 잔여 부족 | **누구나 허용 + 경고**, 마이너스 잔여 빨강 표시 |
| 승인 플로우 | **자동 승인** (`status='approved'` default). 본인/관리자 즉시 취소 가능 |
| 권한 | 2개: `CONTRACTOR_READ`(본인) / `CONTRACTOR_ADMIN`(전체·공휴일). 기존 `ATTENDANCE_*` 제거 |
| 초기 데이터 | **빈 상태 시작**. dev seed/xls 마이그는 CRUD 완성 후 후속 (TODO) |
| 구현 방식 | **superpowers:subagent-driven-development** + **claude-sonnet-4-6** |

## 3. 범위 & 전제

### 3-1. IN scope

- `user.employment_type` 컬럼 추가 + 마이그레이션
- 신규 스키마 3개: `contractor_contract`, `leave_request`, `holiday`
- 기존 테이블 drop: `attendance`, `out_manage`, `out_manage_detail`
- 기존 라우트/컴포넌트/쿼리/테스트 삭제: `apps/web/app/(app)/attendance/**`, `apps/web/app/api/attendance/**`, `apps/web/components/attendance/**`, `apps/web/lib/queries/attendance.ts`, `apps/web/e2e/attendance.spec.ts`
- 대시보드 위젯 `AttendanceSummaryWidget.tsx` 제거(후속에서 외주인력 요약 위젯 재설계 가능)
- 신규 라우트: `/contractors` (탭 기본=인력·연차), `/contractors/schedule`, `/holidays`
- 신규 API: `/api/contractors/*`, `/api/contractors/[id]/leave-requests`, `/api/holidays`
- Next 미들웨어: `/attendance/*` → `/contractors/*` 301 redirect
- i18n: `Attendance.*` 네임스페이스 삭제, `Contractors.*`·`Holidays.*`·`Nav.contractors`·`Nav.holidays` 신설
- 권한 상수 교체 (`ATTENDANCE_*` → `CONTRACTOR_*`), role mapping 갱신
- 사이드바에 "외주인력관리", "공휴일 관리" 항목 추가(기존 "근태등록" 자리)
- 비즈니스 로직: 생성연차 계산, 공휴일·주말 제외 hours 계산, 계약 갱신 잔여 이월
- 테스트: unit·query·API·e2e 전 계층

### 3-2. 대상 사용자 범위

- 본 도메인(`/contractors`)은 **`employment_type='contractor'`** 인 user만 대상.
- **내부 직원**(`internal`)은 `/contractors` 테이블에 표시되지 않으며, 내부 직원 근태 관리는 본 스펙 범위 밖(차후 별도 설계).
- 내부 직원도 로그인 후 `/contractors`에 접근 가능하지만, 본인이 contractor 아니므로 "인력·연차" 탭은 빈 테이블, "일정 달력" 탭은 권한에 따라 전체 조회만 가능(CONTRACTOR_ADMIN이면).

### 3-3. OUT of scope (TODO 보존)

1. **초기 데이터 seed / xls 마이그 스크립트** — CRUD 완성 후 dev 환경 일괄 주입
2. `user` 스키마에 `enter_cd`·`sex_type`·`birth_ymd` 추가 — 후속 "사용자관리" 화면 설계 때
3. **사이드바 메뉴 일괄 재정리** — 프로젝트·추가개발·외주인력관리·공휴일 관리·Admin 구조 최적화
4. 계약 만료 자동 `active → expired` 전환 cron/worker 잡
5. 주/일 달력 뷰 추가
6. 공휴일 recurring 플래그 / 음력 휴일 자동 계산
7. 전자결재(승인 워크플로) 연동
8. 병가·공가의 별도 할당량 관리 (현 설계는 type만 다르고 연차 차감 없이 기록만)
9. 리포트(월별 사용 추이, 팀별 통계)
10. 대시보드 위젯 재설계(외주인력 요약)

## 4. 아키텍처 (라우트·메뉴·권한)

### 4-1. 라우트

```
/contractors                           (기본 탭: 인력·연차)
/contractors/schedule                  (탭: 일정 달력)
/holidays                              (공휴일 관리, 임시 top-level)

/api/contractors                       (GET list, POST create)
/api/contractors/[id]                  (GET, PATCH, DELETE)
/api/contractors/[id]/contracts        (GET, POST renew)
/api/contractors/[id]/leave-requests   (GET, POST)
/api/leave-requests/[id]               (PATCH, DELETE — 본인/관리자)
/api/holidays                          (GET, POST)
/api/holidays/[id]                     (PATCH, DELETE)
```

Next 미들웨어(`apps/web/middleware.ts`)에 matcher `/attendance/:path*` 추가 → 301 redirect.

### 4-2. 사이드바 (임시)

```
대시보드 / AI 질문 / 검색 / 위키 / Knowledge
프로젝트
추가개발
외주인력관리   ← 신규 (/contractors)
공휴일 관리    ← 신규 (/holidays)
Admin
```

아이콘: 외주인력관리 = `Users`(lucide-react), 공휴일 관리 = `CalendarX`.

### 4-3. 권한 상수 (`packages/shared/constants/permissions.ts`)

**제거**: `ATTENDANCE_READ`, `ATTENDANCE_ADMIN` (+ role mapping).

**신설**:
```ts
CONTRACTOR_READ: "contractor:read",      // 본인 조회·신청·취소
CONTRACTOR_ADMIN: "contractor:admin",    // 전체 계약·추가연차·공휴일
```

**Role 기본 매핑**:
- `ADMIN`, `MANAGER` → `CONTRACTOR_ADMIN` (+ `CONTRACTOR_READ` 자동 포함)
- `DEVELOPER`, `VIEWER`, 그 외 외주인력 전용 role → `CONTRACTOR_READ` 만

### 4-4. RBAC 헬퍼

- `canManageContractors(session): boolean` → `hasPermission(CONTRACTOR_ADMIN)`
- `canAccessContractorData(session, targetUserId)` → `targetUserId===session.userId || canManageContractors(session)`

## 5. 데이터 모델

### 5-1. `user` 확장

```sql
ALTER TABLE "user"
  ADD COLUMN "employment_type" VARCHAR(20) NOT NULL DEFAULT 'internal';
-- 'internal' | 'contractor'
```

Drizzle:
```ts
employmentType: varchar("employment_type", { length: 20 }).default("internal").notNull(),
```

### 5-2. `contractor_contract` (신규)

```sql
CREATE TABLE contractor_contract (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  enter_cd VARCHAR(30),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  generated_leave_hours NUMERIC(6,1) NOT NULL,
  additional_leave_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 'active' | 'expired' | 'terminated'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contract_user ON contractor_contract(user_id);
CREATE INDEX idx_contract_status ON contractor_contract(status);
CREATE UNIQUE INDEX idx_contract_one_active
  ON contractor_contract(workspace_id, user_id)
  WHERE status = 'active';
```

- 한 workspace 안 한 user 당 active 계약은 최대 1건 (partial unique index).
- `generated_leave_hours`: `computeGeneratedLeaveHours` 자동 제안, 담당자 override 가능.
- `additional_leave_hours`: 담당자 부여 + 계약 갱신 시 직전 계약 `잔여시간` 자동 prefill.
- **잔여시간** = `generated + additional − SUM(leave_request.hours WHERE status='approved')`. 쿼리 함수로 계산(컬럼 비저장).

### 5-3. `leave_request` (신규)

```sql
CREATE TABLE leave_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contractor_contract(id),

  type VARCHAR(20) NOT NULL,
  -- 'day_off' | 'half_am' | 'half_pm' | 'hourly' | 'sick' | 'public'

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  time_from TIMESTAMPTZ,   -- type='hourly' 일 때만 NOT NULL 효과 (app-level)
  time_to TIMESTAMPTZ,
  hours NUMERIC(5,1) NOT NULL,  -- 차감 시간(공휴일·주말 제외 반영). sick/public는 0

  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'approved',
  -- 'approved' | 'cancelled'
  cancelled_at TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_leave_user ON leave_request(user_id);
CREATE INDEX idx_leave_contract ON leave_request(contract_id);
CREATE INDEX idx_leave_date ON leave_request(start_date, end_date);
CREATE INDEX idx_leave_status_approved ON leave_request(status) WHERE status = 'approved';
```

- `contract_id` FK: 어느 계약의 연차 풀에서 차감하는지 명시. 계약 갱신 시 과거 이력도 유지.
  - **자동 선택 규칙**: 신청 시점(`start_date` 기준)에 `user_id` 의 `status='active'` 계약을 서버에서 자동 조회해 주입. active 계약이 없으면 신청 거부(`409 Conflict`, i18n: `Contractors.errors.noActiveContract`).
  - `start_date` 가 active 계약 기간을 벗어나면 경고(UI) 후 그대로 허용 (active 계약의 `additional_leave_hours` 에서 차감).
- `hours` 는 저장 시점에 계산된 "실제 차감 시간" (공휴일·주말 제외 적용 후).
- `status='cancelled'` 는 soft delete. 리스트/잔여 계산에서 제외.
- `type='sick'` / `'public'` 은 `hours=0` 저장(연차 미차감). 달력 바에는 hours 생략하고 타입명만 표시(예: "최미정 · 병가"). 이력 리스트에서는 "0h"로 표기.

### 5-4. `holiday` (신규)

```sql
CREATE TABLE holiday (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id),
  date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, date)
);
CREATE INDEX idx_holiday_date ON holiday(date);
```

- 토/일은 저장 안 함 (런타임 `Date.prototype.getDay()`).
- `(workspace_id, date)` UNIQUE 로 같은 날 중복 방지.

### 5-5. 제거 마이그레이션

```sql
-- 순서 주의: FK 의존성 때문에 detail → parent → single
DROP TABLE IF EXISTS "out_manage_detail" CASCADE;
DROP TABLE IF EXISTS "out_manage" CASCADE;
DROP TABLE IF EXISTS "attendance" CASCADE;
```

Drizzle: `packages/db/schema/attendance.ts` 파일 삭제 + `schema/index.ts` export 제거.

## 6. 비즈니스 로직

### 6-1. 생성연차 자동 계산 — `computeGeneratedLeaveHours`

**위치**: `packages/shared/leave-compute.ts` (공용, FE·API 양쪽에서 사용).

**알고리즘 (초안)**:
```ts
export function computeGeneratedLeaveHours(start: Date, end: Date): number {
  // 1일이라도 초과되면 한 달 추가 (사용자 규칙: "5개월 20일 → 6개")
  const msPerDay = 86400000;
  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (inclusiveDays <= 0) return 0;
  const monthsCeil = Math.ceil(inclusiveDays / 30);
  return monthsCeil * 8;
}
```

**테스트 케이스(고정)**:
| 계약 기간 | inclusiveDays | 기대 hours | 비고 |
|---|---|---|---|
| 2026-03-04 ~ 2026-09-03 | 184 | 56 (7개월) | 원본 48h 기대하나 초안은 56h — **테스트 시 실제 값 확인 후 알고리즘 조정** |
| 2026-02-28 ~ 2026-08-27 | 181 | 56 | 원본 48h |
| 2025-12-01 ~ 2026-05-30 | 181 | 56 | 원본 48h |

> **중요**: 원본 스크린샷 값은 "월 1개" 규칙이 `floor(개월수) * 8` 에 가까운데, 사용자가 말한 "5개월 20일 → 6개" 는 올림에 가까움. 이 모순은 **"원본 값도 수동 override 가능성 존재"** 로 해석.
>
> **빌더 지시**: 초안 `ceil(days/30)` 으로 시작. 테스트에서 원본 값과 어긋나면, 사용자에게 기대값 재확인 요청하는 에스컬레이션. 최종 알고리즘은 **테스트 통과로 고정**. 담당자 override가 정상 경로이므로 딱 떨어지지 않아도 허용.

### 6-2. 계약 갱신 — `renewContract`

```ts
export async function renewContract(
  prevContractId: string,
  input: { userId: string; startDate: Date; endDate: Date; note?: string }
): Promise<ContractorContract> {
  return db.transaction(async (tx) => {
    const prev = await tx.query.contractorContract.findFirst({
      where: eq(contractorContract.id, prevContractId),
    });
    if (!prev || prev.status !== "active") throw new Error("prev contract must be active");

    const remainingHours = await computeRemainingHours(tx, prev.id);
    const carryOver = Math.max(0, remainingHours);

    await tx.update(contractorContract)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(contractorContract.id, prev.id));

    const [created] = await tx.insert(contractorContract).values({
      workspaceId: prev.workspaceId,
      userId: input.userId,
      enterCd: prev.enterCd,
      startDate: input.startDate,
      endDate: input.endDate,
      generatedLeaveHours: computeGeneratedLeaveHours(input.startDate, input.endDate),
      additionalLeaveHours: carryOver,
      note: [input.note, carryOver > 0 ? `직전계약 잔여 ${carryOver}h 이월` : null]
        .filter(Boolean).join("\n"),
      status: "active",
    }).returning();
    return created!;
  });
}
```

### 6-3. 신청 시간 계산 — `computeLeaveHours`

```ts
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

  if (type === "hourly") {
    if (!timeFrom || !timeTo) throw new Error("hourly requires time range");
    const diffHours = (timeTo.getTime() - timeFrom.getTime()) / 3600000;
    return Math.max(1, Math.round(diffHours));
  }

  if (type === "half_am" || type === "half_pm") return 4;

  // day_off: 공휴일·주말 제외한 일수 * 8
  let count = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    const dow = d.getDay();
    const key = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(key)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count * 8;
}
```

### 6-4. 잔여시간 계산 — `computeRemainingHours`

```ts
export async function computeRemainingHours(
  tx: Database, contractId: string
): Promise<number> {
  const [c] = await tx.select().from(contractorContract).where(eq(contractorContract.id, contractId));
  if (!c) return 0;
  const used = await tx.select({ sum: sql`COALESCE(SUM(hours), 0)` })
    .from(leaveRequest)
    .where(and(
      eq(leaveRequest.contractId, contractId),
      eq(leaveRequest.status, "approved"),
    ));
  const total = Number(c.generatedLeaveHours) + Number(c.additionalLeaveHours);
  return total - Number(used[0]?.sum ?? 0);
}
```

### 6-5. 잔여 부족 처리

- FE 신청 미리보기에서 "차감 X → 잔여 Y" 표시. Y < 0 이면 빨간 경고 배너 + [그대로 신청] 버튼.
- API: 별도 제약 없음 (음수 허용). 저장 후 잔여 계산에서 음수로 노출.
- 인력 테이블/Drawer에서 잔여 음수는 빨간 글씨.

### 6-6. 계약 상태 전이

- `active → expired`: `renewContract` 내부 트랜잭션에서 자동. nightly cron은 **OUT of scope**.
- `active → terminated`: 담당자가 Drawer에서 "계약 종료" 버튼 → 확인 모달 → `status='terminated'`. 이월 없음, 남은 leave_request는 유지.

## 7. UI 상세

### 7-1. `/contractors` (기본 탭: 인력·연차)

**레이아웃**: `display: grid; grid-template-columns: 1fr 280px` (우측 drawer 접기 가능 → `1fr 0`).

**좌측 인력 테이블**:
- 컬럼: 사번 · 성명 · 조직 · 계약기간 · 발행(시간) · 사용(시간) · 잔여(시간·일 병기) · 계약상태 배지 · 업데이트일
- 필터 바: 검색 input(name/employeeId) · 계약상태 토글(active 기본, expired 포함) · 조직 select
- 정렬: 모든 컬럼. 기본 = `start_date desc`
- 페이징: 50/100건
- 권한: `CONTRACTOR_READ` → 본인 행만 표시, `CONTRACTOR_ADMIN` → 전체
- 행 클릭 → 우측 Drawer 열림, 해당 행 `bg-blue-50` 하이라이트
- 상단 바: `[+ 신규 인력]` 버튼 (`CONTRACTOR_ADMIN` 전용) → user 생성 + `employment_type='contractor'` + 초기 계약 생성 모달

**우측 Drawer**:
- 상단 요약: 성명 · 사번 · 계약기간 · 발행/사용/잔여 (일·시간 병기)
- 섹션 "계약": 활성 계약 상세 (시작/종료/추가연차/비고). 버튼: `[편집]`, `[계약 갱신]`, `[계약 종료]`
- 섹션 "과거 계약": 접힘, 클릭 시 expired/terminated 리스트
- 섹션 "세부 근태 이력":
  - 필터: 연도 드롭다운(default 올해)
  - 리스트(최신순): 날짜 범위 · 타입 배지 · hours · reason
  - 각 행 hover 시 `[수정]` `[삭제]` 텍스트 링크 노출
  - 상단 `[+ 근태 추가]` → 모달 폼: 날짜 범위(start/end date picker) · 타입 select · 시간차면 time picker (time_from / time_to) · 사유 input
- 권한 체크: 본인 행이면 본인 + 관리자, 타인 행이면 관리자만 편집 가능

### 7-2. `/contractors/schedule` (탭: 일정 달력)

**월 뷰 풀화면**:
- 헤더: `[<] [>] [오늘]` 네비 + `YYYY년 MM월` 타이틀 + 필터(조직 / 검색)
- 그리드: 7 × 5~6 (일~토). 토/일 셀 `bg-red-50`, 날짜 숫자 빨강
- 공휴일: 셀 `bg-red-100`, 공휴일명 작게 표시 ("어린이날")
- 휴가 바: 초록 배경 (`bg-green-100 text-green-800`), `이름 · 타입 · hours` 형식 (예: "최미정 · 반차(4h)"). `type='sick'|'public'` 은 hours 생략 ("최미정 · 병가"). 취소된 건(`status='cancelled'`)은 렌더링하지 않음.
- 상호작용:
  - 빈 날짜 클릭 → 팝오버 (본인 기본 선택) → 타입 버튼 → 즉시 저장
  - 드래그(연속 날짜) → 범위 반전 색 → 마우스 놓으면 팝오버:
    - 타이틀: "3/16~3/18 · 주말 포함 4일 → 실효 3일(24h)"
    - 버튼: 월차 / 오전반차 / 오후반차 / 시간차… / 병가 / 공가
    - 시간차 클릭 시 time picker(from/to) 서브 폼
  - 저장 → 토스트 "월차 3일(24h) 신청됨 [실행취소]" (3초 후 자동 닫힘)
  - 기존 바 클릭 → 팝오버 "수정 / 삭제" (권한 체크)
- 인력 필터 적용 시 해당 인력 바만 표시
- `CONTRACTOR_READ` → 자기 본인 + 팀/전체 조회 가능(읽기 전용), 편집은 본인 것만
- `CONTRACTOR_ADMIN` → 모두 편집 가능

### 7-3. `/holidays` (공휴일 관리)

- 헤더: 연도 드롭다운(기본 올해) + `[+ 공휴일 추가]` 버튼
- 테이블: 날짜 · 이름 · 비고 · `[수정]` `[삭제]`
- `+` 버튼 → 모달: date picker + 이름 input + 비고 textarea
- 페이지 접근: `CONTRACTOR_ADMIN` 필수 (읽기도 관리자 전용 — 일반 사용자는 달력에 반영된 빨간색만 보면 됨)

### 7-4. i18n (`apps/web/messages/ko.json`)

**제거**: `"Attendance": { ... }` 네임스페이스 전체.

**신설**:
```json
"Nav": {
  "contractors": "외주인력관리",
  "holidays": "공휴일 관리"
},
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
}
```

### 7-5. 디자인 토큰 / CSS

- 현재 `/attendance` 페이지가 쓰는 `var(--panel)`, `var(--line)`, `var(--mint)` 등은 새 페이지에서도 계속 사용 (기존 스타일 시스템 따름).
- 테이블 패턴은 `/projects` 리스트(post-rename) 또는 `/add-dev` 리스트의 `Table` 컴포넌트 패턴 재활용.

## 8. Phase 구성 (subagent-driven-development)

병렬 가능성을 명시해 빌더 디스패치 순서 확정.

| Phase | 내용 | 의존 | 병렬 |
|---|---|---|---|
| **P0** | 기존 `/attendance` 도메인 완전 제거 (테이블·라우트·컴포넌트·쿼리·i18n·권한·e2e·대시보드 위젯) + drop migration | — | — |
| **P1-A** | `user.employment_type` 추가 + `contractor_contract` + `leave_request` + `holiday` Drizzle 스키마·마이그 | P0 | P1-B와 병렬 |
| **P1-B** | 권한 상수 재정의 (`CONTRACTOR_*`) + `packages/auth/rbac.ts` 헬퍼 + i18n 네임스페이스 스캐폴드 | P0 | P1-A와 병렬 |
| **P2** | 공용 비즈니스 로직 `packages/shared/leave-compute.ts` (computeGeneratedLeaveHours, computeLeaveHours, computeRemainingHours, renewContract) + vitest 단위 테스트(6-1 테스트 케이스 포함) | P1-A | — |
| **P3-A** | 쿼리 `apps/web/lib/queries/contractors.ts` (list/get/create/update/renew/terminate) + test | P2 | P3-B와 병렬 |
| **P3-B** | 쿼리 `apps/web/lib/queries/holidays.ts` + test | P1-A | P3-A와 병렬 |
| **P4-A** | API 라우트 `/api/contractors/**`, `/api/leave-requests/[id]` + test | P3-A | P4-B와 병렬 |
| **P4-B** | API 라우트 `/api/holidays/**` + test | P3-B | P4-A와 병렬 |
| **P5** | `/contractors` UI (인력 테이블 + Drawer + 모달) | P4-A | P6과 병렬 |
| **P6** | `/contractors/schedule` UI (달력 + 드래그 팝오버 + 공휴일 렌더) | P4-A + P4-B | P5와 병렬 |
| **P7** | `/holidays` UI | P4-B | P5, P6과 병렬 |
| **P8** | `apps/web/middleware.ts` `/attendance/*` → `/contractors/*` 301 redirect + 사이드바 항목 교체 + `Nav` i18n | P5 | — |
| **P9** | e2e (`apps/web/e2e/contractors.spec.ts`) + 수동 QA + Integrator 검증 | P5 + P6 + P7 + P8 | — |

전체 순서: `P0 → (P1-A ∥ P1-B) → P2 → (P3-A ∥ P3-B) → (P4-A ∥ P4-B) → (P5 ∥ P6 ∥ P7) → P8 → P9`.

## 9. 검증 게이트

| Gate | 시점 | 조건 | 실패 시 |
|---|---|---|---|
| G-remove | P0 완료 후 | `grep -r "attendance\|outManage" apps/web/ packages/` 소스 히트 0. drop migration 적용. `pnpm tsc` 통과 | 누락 파일 보강 |
| G-schema | P1 완료 후 | `drizzle-kit generate` diff clean, 새 테이블 3개 + user 컬럼 반영, `pnpm tsc` 통과 | 스키마 오류 수정 |
| G-logic | P2 완료 후 | `packages/shared/leave-compute.test.ts` PASS. 사용자 제공 케이스가 기대값과 다르면 spec 4-1 원칙 따라 담당자 override 설명 문서화 | 알고리즘 재조정 or 테스트 허용 범위 확장 |
| G-api | P4 완료 후 | 권한·페이지네이션·auto-approved·cancellation 테스트 PASS | API 수정 |
| G-ui | P5~P7 완료 후 | `pnpm test`·`pnpm lint`·`pnpm --filter @jarvis/web build` 전부 그린. dev 서버에서 `/contractors`·`/contractors/schedule`·`/holidays` 렌더 확인 | UI 수정 |
| G-redirect | P8 완료 후 | `curl -I http://localhost:3010/attendance` → 301, Location: `/contractors` | middleware 수정 |
| G-final | P9 | e2e smoke: 드래그 신청 → 바 생성 → 잔여 감소 → 취소 → 잔여 복원. 공휴일 추가 → 달력 빨강 반영. 타입/lint/빌드 전부 그린 | Integrator 피드백 반영 |

## 10. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| `computeGeneratedLeaveHours` 알고리즘이 원본 스크린샷 값과 맞지 않음 | 담당자 혼란 | spec 4-1·6-1에 명시: 자동값은 "제안", 담당자 override가 정상. 테스트는 알고리즘이 고정하되 실제 값은 UI에서 편집 가능. |
| `out_manage` / `attendance` 데이터가 prod에 있을 가능성 | DROP CASCADE 시 손실 | dev 단계이므로 prod 없음을 전제. 있어도 더미이므로 drop 허용 (사용자 확인 완료). |
| 대시보드 위젯 `AttendanceSummaryWidget` 제거로 대시보드 빈 칸 | UX 퇴행 | 위젯 자리 그리드 재배치 or "추후 외주인력 위젯 재설계" 플레이스홀더. P0에 처리. |
| `/attendance` 북마크 / 외부 링크 | 404 | P8 middleware 301 redirect로 흡수. |
| 드래그 범위 계산 시 타임존 이슈 | 다른 날로 저장 | `start_date`/`end_date`는 `DATE` 타입. FE에서 `toISOString().slice(0,10)` 사용 시 UTC 주의 — local date util로 교정 (`apps/web/lib/date-utils.ts` 재활용). |
| 사이드바 메뉴 증가 (프로젝트·추가개발·외주인력관리·공휴일관리·Admin...) | 사이드바 포화 | 임시로 수용. TODO(3) 사이드바 일괄 재정리에서 해결. |

## 11. 비범위 (재확인)

섹션 3-2 목록 참조. 특히 초기 데이터 마이그, `enter_cd/sex_type/birth_ymd` 추가, 사이드바 재정리, 계약 만료 cron, 전자결재, 병가·공가 별도 할당, 리포트 는 **모두 본 설계 범위 밖**.

## 12. 관련 파일 (구현 대상)

### 12-1. 신규
- `packages/db/schema/contractor.ts` (contractor_contract + leave_request + holiday)
- `packages/db/drizzle/<seq>_contractor_management_init.sql`
- `packages/shared/leave-compute.ts` + `.test.ts`
- `apps/web/app/(app)/contractors/layout.tsx` (탭 네비)
- `apps/web/app/(app)/contractors/page.tsx` (인력·연차)
- `apps/web/app/(app)/contractors/schedule/page.tsx` (일정 달력)
- `apps/web/app/(app)/holidays/page.tsx`
- `apps/web/app/api/contractors/route.ts` + `[id]/route.ts` + `[id]/contracts/route.ts` + `[id]/leave-requests/route.ts`
- `apps/web/app/api/leave-requests/[id]/route.ts`
- `apps/web/app/api/holidays/route.ts` + `[id]/route.ts`
- `apps/web/components/contractors/ContractorTable.tsx`
- `apps/web/components/contractors/ContractorDrawer.tsx`
- `apps/web/components/contractors/LeaveAddModal.tsx`
- `apps/web/components/contractors/ScheduleCalendar.tsx` (월 뷰 + 드래그 + 팝오버)
- `apps/web/components/contractors/LeavePopover.tsx`
- `apps/web/components/holidays/HolidayTable.tsx` + `HolidayFormModal.tsx`
- `apps/web/lib/queries/contractors.ts` + `.test.ts`
- `apps/web/lib/queries/holidays.ts` + `.test.ts`
- `apps/web/e2e/contractors.spec.ts`

### 12-2. 수정
- `packages/db/schema/user.ts` (employmentType 추가)
- `packages/db/schema/index.ts` (attendance export 제거, contractor export 추가)
- `packages/shared/constants/permissions.ts` (ATTENDANCE_* 제거, CONTRACTOR_* 추가)
- `packages/auth/rbac.ts` (canManageContractors 등 헬퍼 추가, 기존 ATTENDANCE 관련 제거)
- `packages/auth/__tests__/rbac-*.test.ts` (권한 테스트 갱신)
- `apps/web/middleware.ts` (redirect 추가)
- `apps/web/components/layout/Sidebar.tsx` (메뉴 교체)
- `apps/web/messages/ko.json` (Attendance 제거, Contractors/Holidays/Nav 추가)
- `apps/web/app/(app)/dashboard/_components/*` (AttendanceSummaryWidget 제거 + 대시보드 그리드 재배치)
- `apps/web/app/(app)/dashboard/page.test.ts` (위젯 제거 반영)

### 12-3. 삭제
- `packages/db/schema/attendance.ts` (파일 삭제)
- `apps/web/app/(app)/attendance/**` (디렉토리 전체 + out-manage 서브)
- `apps/web/app/api/attendance/**`
- `apps/web/components/attendance/**`
- `apps/web/lib/queries/attendance.ts` + `.test.ts` (있다면)
- `apps/web/e2e/attendance.spec.ts`
- `apps/web/app/(app)/dashboard/_components/AttendanceSummaryWidget.tsx`
