# Admin Users 화면 확장 — Design Spec

- **날짜:** 2026-04-20
- **작성자:** kms (with Claude brainstorm)
- **대상 PR 브랜치:** 현재 `feature/projects-rename-add-dev` 또는 신규 파생 브랜치
- **관련 파일:** `apps/web/app/(app)/admin/users/*`, `apps/web/app/api/admin/users/*`, `packages/db/schema/user.ts`

## 1. Goal & Scope

기존 `/admin/users` 화면(TanStack Table 기반 모던 CRUD)을 확장해 사내 인사 운영에 필요한 필드·상태·액션을 추가한다. 레거시 ISU "사용자관리" 화면의 기능을 **현대적 UX로 재해석**하며, 화면 레이아웃 자체는 기존 모던 스타일을 유지한다.

### Goal
- `user` 테이블에 인사 운영 필드(직위/직책/외주 플래그) 추가.
- 상태 모델을 `isActive` boolean → `status` enum(active/inactive/locked)으로 전환.
- UI: 통합 검색 + 상태 필터 + 직위/직책 컬럼 + 4개 행 액션(편집·잠금 토글·비번 초기화·비활성화) + CSV export.
- 직위/직책은 기존 그룹코드(`admin/codes`) 인프라 활용 (POSITION/JOB_TITLE 그룹).

### Scope
**포함:**
- 스키마 변경 + 마이그레이션(`isActive` 완전 제거).
- 그룹코드 seed (POSITION 4종, JOB_TITLE 3종).
- API 엔드포인트 6개 (GET/POST/PUT/DELETE + reset-password stub + export CSV).
- UI 컴포넌트 업데이트 (`UserTable`, `UserForm`).
- i18n 키 추가.
- 테스트 (마이그레이션·API·UI·회귀).

**제외:**
- 실제 비밀번호 초기화 로직 (인증 시스템 미구축 — UI 스텁만).
- 감사 로깅 (이번 PR 범위 외).
- 일괄 선택 / 복사 / 인라인 편집.
- 조직(org) 필터 드롭다운 (사용자 요구 없음).

### Non-goals
- 레거시 ISU UI 픽셀 재현.
- 레거시 컬럼 21개 전부 복원 (스킨/폰트/비밀번호 참고사항/신청사유 등 제외).
- 권한 세분화 (현재 `ADMIN_ALL` 단일 권한 유지).

---

## 2. Data Model

### 2.1 스키마 변경 (`packages/db/schema/user.ts`)

```ts
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'locked']);

// user 테이블 컬럼 변경:
//   - 제거: isActive
//   - 추가:
status:        userStatusEnum('status').notNull().default('active'),
position:      varchar('position',  { length: 50 }),  // code.code 값 (POSITION 그룹)
jobTitle:      varchar('job_title', { length: 50 }),  // code.code 값 (JOB_TITLE 그룹)
isOutsourced:  boolean('is_outsourced').notNull().default(false),
```

### 2.2 인덱스

```sql
CREATE INDEX user_workspace_status_idx ON "user" (workspace_id, status);
```

### 2.3 마이그레이션 순서

1. `ALTER TABLE "user" ADD COLUMN ...` — status(nullable 먼저), position, job_title, is_outsourced.
2. Enum 생성 + status 컬럼 타입 전환.
3. Backfill: `UPDATE "user" SET status = CASE WHEN is_active THEN 'active'::user_status ELSE 'inactive'::user_status END`.
4. `ALTER COLUMN status SET NOT NULL, SET DEFAULT 'active'`.
5. 인덱스 생성.
6. `ALTER TABLE "user" DROP COLUMN is_active`.

모두 단일 마이그레이션 파일 (`packages/db/drizzle/0NNN_admin_users_status.sql`)로 커밋.

### 2.4 Zod 스키마 동기화

`packages/db/schema/user.ts`의 `createInsertSchema` / `createSelectSchema` 재생성. API route에서 `status`·`position`·`jobTitle`·`isOutsourced` 허용.

### 2.5 `isActive` 제거로 영향받는 파일 (전수)

- `packages/db/schema/user.ts` — 정의 제거
- `apps/web/lib/queries/admin.ts` — `getUsers`에서 필드·필터 교체
- `apps/web/app/api/admin/users/route.ts` — GET/POST/PUT/DELETE 전부
- `apps/web/app/api/admin/users/route.test.ts` — 테스트 업데이트
- `apps/web/components/admin/UserTable.tsx` — 컬럼 렌더
- `apps/web/components/admin/UserForm.tsx` — status 필드 추가
- `scripts/migrate/users.ts` — 시드 스크립트 status 반영

*참고: `apps/web/app/api/auth/login/route.ts`는 `isActive`를 직접 참조하지 않음 (email 기준 lookup만). 세션 생성(`@jarvis/auth/session`)에서 `dbUser.isActive`가 저장/참조되는지만 재확인 후 정리.*

---

## 3. Group Codes (POSITION / JOB_TITLE)

### 3.1 Seed 데이터

POSITION 그룹 (4종):
| code | label |
|---|---|
| EXECUTIVE | 임원 |
| PRINCIPAL | 수석 |
| SENIOR | 책임 |
| ASSOCIATE | 선임 |

JOB_TITLE 그룹 (3종):
| code | label |
|---|---|
| TEAM_LEAD | 팀장 |
| PART_LEAD | 파트장 |
| MEMBER | 팀원 |

### 3.2 Seed 전략

- 신규 마이그레이션 또는 전용 seed 스크립트로 workspace별 적용.
- `ON CONFLICT DO NOTHING` — 재실행 안전.
- 기존 workspace에도 모두 적용.

### 3.3 조회 헬퍼

`apps/web/lib/queries/admin.ts`에 추가:
```ts
export async function getCodesByGroup(
  workspaceId: string,
  groupCode: 'POSITION' | 'JOB_TITLE',
): Promise<Array<{ code: string; label: string }>>;
```

페이지 서버 컴포넌트에서 `orgOptions`와 함께 `positionOptions`, `jobTitleOptions` 병렬 로드.

### 3.4 삭제 정책

이번 PR에서는 참조 무결성 제약을 추가하지 않는다. 관리자가 사용 중인 코드를 삭제하면 해당 유저의 `position`/`jobTitle`은 고아 값이 되고 UI에서는 "—"로 표시. 무결성 강화는 후속 작업.

---

## 4. API

`apps/web/app/api/admin/users/route.ts` 및 신규 엔드포인트.

### 4.1 GET /api/admin/users

**쿼리 파라미터:**
- `q` — 통합 검색 (employeeId/name/email ILIKE OR).
- `status` — `active` | `inactive` | `locked` | `all` (default `all`).
- `page`, `limit` (기존).

**응답 row shape:**
```ts
{
  id: string;
  employeeId: string;
  name: string;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  status: 'active' | 'inactive' | 'locked';
  position: string | null;        // code value
  positionLabel: string | null;   // server-side code.label join
  jobTitle: string | null;
  jobTitleLabel: string | null;
  isOutsourced: boolean;
  roles: string[];
  createdAt: string;
}
```
라벨 조인은 서버 SQL (`LEFT JOIN code c_pos ON c_pos.code = user.position AND c_pos.group_code = 'POSITION'` 형태).

### 4.2 POST /api/admin/users

```ts
createUserSchema = z.object({
  employeeId: z.string().min(1).max(50),
  name:       z.string().min(1).max(200),
  email:      z.string().email().optional(),
  orgId:      z.string().uuid().optional(),
  position:   z.string().max(50).optional(),  // 서버에서 POSITION 그룹 코드 존재 검증
  jobTitle:   z.string().max(50).optional(),  // 서버에서 JOB_TITLE 그룹 코드 존재 검증
  isOutsourced: z.boolean().default(false),
  roleCode:   z.enum(['ADMIN','MANAGER','DEVELOPER','HR','VIEWER']).default('VIEWER'),
});
```

- position/jobTitle이 지정되었으나 해당 그룹코드에 없으면 400.
- 사번 workspace 내 중복 → 409.
- status는 항상 `'active'`로 서버 강제.

### 4.3 PUT /api/admin/users

```ts
updateUserSchema = z.object({
  id: z.string().uuid(),
  name:       z.string().min(1).max(200).optional(),
  email:      z.string().email().optional(),
  orgId:      z.string().uuid().nullable().optional(),
  status:     z.enum(['active','inactive','locked']).optional(),
  position:   z.string().max(50).nullable().optional(),
  jobTitle:   z.string().max(50).nullable().optional(),
  isOutsourced: z.boolean().optional(),
  roleCodes:  z.array(z.enum(['ADMIN','MANAGER','DEVELOPER','HR','VIEWER'])).optional(),
});
```
- 상태 전이 제약 없음 — 관리자 자유 변경.
- position/jobTitle 검증은 POST와 동일 (없는 코드면 400, null은 허용).

### 4.4 DELETE /api/admin/users?id=

Soft delete — `status` 를 `'inactive'` 로 설정 (기존 `isActive=false` 동작 교체). 이미 inactive여도 idempotent.

### 4.5 POST /api/admin/users/reset-password (stub)

- Body: `{ id: string }`
- 동작: 유저 존재 여부 검증(workspace scope) → 200 + `{ ok: true, stub: true, message: 'Password reset stub — auth system pending' }`.
- DB 변경 없음.
- TODO 주석: 향후 인증 시스템 연동 지점.

### 4.6 GET /api/admin/users/export

- 쿼리: `format=csv` (현재 유일), `q`, `status`, `orgId` — GET과 동일 필터.
- 응답: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="users-YYYYMMDD-HHmmss.csv"`.
- 본문: BOM(`\uFEFF`) + 헤더 행 + 데이터 행. 헤더는 UI 컬럼과 일치 (사번/이름/이메일/소속/직위/직책/역할/상태/외주여부/생성일).
- 페이지네이션 없음, 현재 workspace 전체. 5000 행 기준 단일 쿼리 충분.
- 권한 `ADMIN_ALL`.

### 4.7 권한

모든 엔드포인트 `PERMISSIONS.ADMIN_ALL` 요구 (기존 유지).

---

## 5. UI

### 5.1 페이지 서버 컴포넌트 (`apps/web/app/(app)/admin/users/page.tsx`)

```ts
const [orgOptions, positionOptions, jobTitleOptions] = await Promise.all([
  getOrgTree(workspaceId).then(flattenTree),
  getCodesByGroup(workspaceId, 'POSITION'),
  getCodesByGroup(workspaceId, 'JOB_TITLE'),
]);
// <UserTable
//    orgOptions={orgOptions}
//    positionOptions={positionOptions}
//    jobTitleOptions={jobTitleOptions}
// />
```

### 5.2 UserTable (`apps/web/components/admin/UserTable.tsx`)

**상단 툴바:**
- Input: 통합 검색 (기존 debounce 400ms 유지)
- Select: 상태 필터 — `전체` / `활성` / `비활성` / `잠금` (default `전체`)
- Button: `추가`
- Button: `CSV 다운로드` — 현재 필터 조건을 쿼리스트링으로 `/api/admin/users/export?format=csv&...`로 이동하여 서버 download 트리거

**컬럼 (9개, 좌→우):**
| 컬럼 | 내용 |
|---|---|
| 사번 | `employeeId` |
| 이름 | `name` |
| 이메일 | `email ?? '—'` |
| 소속 | `orgName ?? '—'` |
| 직위 | `positionLabel ?? '—'` |
| 직책 | `jobTitleLabel ?? '—'` |
| 역할 | `<Badge variant=secondary>` 다건 |
| 상태 | 상태 뱃지 + (외주면) 외주 뱃지 함께 |
| 액션 | 4개 버튼 |

상태 뱃지 스타일:
- `활성` → default
- `잠금` → warning
- `비활성` → destructive
- `외주` → outline (상태 뱃지와 병렬)

**액션 컬럼 4개 (순서):**
1. `편집` — 기존 Dialog 열기
2. `잠금` / `잠금해제` — confirm 없이 즉시 PUT `{ status: 'locked' | 'active' }` (inactive 상태면 disabled)
3. `비번 초기화` — POST `/reset-password` 호출, 성공 시 스텁 토스트 표시
4. `비활성화` — 이미 inactive면 disabled. 기존과 동일 (DELETE → status inactive).

가로 스크롤은 기존 `overflow-x-auto` 패턴 유지.

### 5.3 UserForm (`apps/web/components/admin/UserForm.tsx`)

신규 필드:
- Select `직위` (positionOptions)
- Select `직책` (jobTitleOptions)
- Checkbox `외주인력`
- Select `상태` — 편집 모드에서만 노출, 생성 시 비노출(서버에서 강제 `active`)

레이아웃:
```
┌─ 기본 정보 ─────────────────┐
│  사번 *   이름 *             │
│  이메일   소속               │
│  직위     직책               │
├─ 권한/상태 ─────────────────┤
│  역할 (multi-select)         │
│  □ 외주인력                  │
│  상태 (편집 모드만)          │
└──────────────────────────────┘
```

### 5.4 상태 전이 UX
- 편집 Dialog Select → 자유 변경.
- 테이블 인라인: 잠금 토글·비활성화만. 재활성화는 편집 Dialog 혹은 "잠금해제" (inactive→active는 Dialog에서만).

---

## 6. i18n & Permissions

### 6.1 `apps/web/messages/ko.json` 추가·수정 (Admin.Users 네임스페이스)

```
columns.position              "직위"
columns.jobTitle              "직책"
columns.status                "상태"   (기존 존재 시 재사용)
status.active                 "활성"   (기존 재사용)
status.inactive               "비활성" (기존 재사용)
status.locked                 "잠금"
status.outsourced             "외주"
filter.statusAll              "전체"
actions.lock                  "잠금"
actions.unlock                "잠금해제"
actions.resetPassword         "비번 초기화"
actions.export                "CSV 다운로드"
form.position                 "직위"
form.jobTitle                 "직책"
form.isOutsourced             "외주인력"
form.status                   "상태"
toast.passwordResetStub       "비밀번호 초기화 요청됨 (스텁 — 인증 시스템 연동 대기)"
toast.lockChanged             "상태가 변경되었습니다"
toast.exportStarted           "다운로드 중…"
```

빌더 단계에서 `jarvis-i18n` 스킬로 기존 키 중복 여부 검증.

### 6.2 권한

- 모든 엔드포인트 `ADMIN_ALL`.
- 감사 로깅 — **이번 PR 범위 외**.

---

## 7. Test Plan

TDD 원칙으로 테스트 먼저 작성 → 구현 → 리팩토링.

### 7.1 DB 마이그레이션 / 스키마
- enum 생성 확인.
- 기존 `is_active=true` 행 → `status='active'` backfill 정확성.
- `is_active` 컬럼 DROP 후 존재하지 않음.
- POSITION 4개·JOB_TITLE 3개 seed 적용, 재실행 idempotent.

### 7.2 API — `apps/web/app/api/admin/users/route.test.ts` 확장

GET:
- `status=active` → 활성만
- `status=locked` → 잠금만
- `status=all` → 전부
- `q` + `status` 조합
- 응답에 `position/positionLabel/jobTitle/jobTitleLabel/isOutsourced/status` 포함
- workspace 격리

POST:
- 유효 position → 201
- 존재하지 않는 position → 400
- jobTitle 동일
- 사번 중복 → 409
- 권한 없음 → 403
- 응답의 status는 항상 `active`

PUT:
- active → locked / locked → active / active → inactive 전이
- 없는 position/jobTitle → 400
- `isOutsourced` 토글
- 존재하지 않는 id → 404

DELETE:
- status가 `inactive`로 설정됨 (workspace scope).

### 7.3 신규 엔드포인트
- `reset-password`: 200 + stub 페이로드, DB 변경 없음.
- `export?format=csv`:
  - Content-Type `text/csv; charset=utf-8`
  - BOM 프리픽스
  - 헤더 라인 정확
  - 필터 적용된 결과 행 수
  - 권한 없음 → 403
  - 파일명 `users-YYYYMMDD-HHmmss.csv` 포맷

### 7.4 UI 컴포넌트
- `UserTable`: 새 컬럼(직위/직책) 렌더, 상태 뱃지 색상·텍스트, 외주 뱃지 노출, 액션 버튼 4종 렌더.
- `UserForm`: position/jobTitle Select 옵션, isOutsourced Checkbox, status Select 편집 모드 노출.
- 기존 e2e `design-screenshots.spec.ts`에 `/admin/users` 있으면 스냅샷 갱신.

### 7.5 회귀 (isActive 제거)
- `api/auth/login/route.test.ts` 그린 유지.
- 세션 생성 경로에서 `dbUser.isActive` 참조 없음 확인.
- `scripts/migrate/users.ts` 시드 재실행 OK.

### 7.6 정적 검증
- `pnpm --filter web type-check` 0 에러
- `pnpm --filter web lint` 신규 경고 0
- `pnpm --filter @jarvis/db type-check`

### 7.7 통과 기준
- 기존 테스트 100% 그린 유지.
- 신규 테스트 100% 그린.
- typecheck·lint 통과.

---

## 8. Migration & Rollout

### 8.1 순서
1. 마이그레이션 SQL + 스키마 변경 커밋
2. API 라우트·쿼리 업데이트 + 테스트
3. 신규 엔드포인트 (reset-password, export) + 테스트
4. UI 컴포넌트 업데이트 + 테스트
5. i18n 키 추가
6. 회귀 테스트 통과 확인

### 8.2 롤백
- 마이그레이션에 `down` 스크립트 포함: `is_active` 복원 + status enum drop.
- 롤백 시 position/jobTitle/isOutsourced 컬럼은 그대로 남겨도 무방 (참조 없으면 무해).

### 8.3 Feature flag
- 기본 적용. flag 없이 전원 노출 (관리자 화면이라 영향 범위 제한적).

---

## 9. Open Questions / Future Work

**후속 작업 제안:**
- 실제 비밀번호 초기화 — 인증 시스템 붙을 때 `/reset-password` 엔드포인트 실구현.
- 감사 로깅 — export / PUT / DELETE에 대한 `admin.audit` 기록.
- 그룹코드 참조 무결성 — 사용 중인 code 삭제 시 경고/차단.
- 조직(org) 드롭다운 필터 — 현재 API `orgId` 지원하나 UI 미노출.
- 역할(Role) 필터.
- 일괄 선택 + 일괄 비활성화 / 복사 — 요구 발생 시 추가.

**미결 질문:** 현 시점 없음.
