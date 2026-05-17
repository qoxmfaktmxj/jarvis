# Contractors 휴가관리 Phase 2 — Master CRUD + enum 한글화 + MANAGER 권한 + Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** PR1 머지 후 사용자 피드백 반영 — (A) `LEAVE_TYPES` snake_case 정정 + i18n helper, (B) Master 그리드 CRUD 활성화 (계약 행 추가/수정/삭제 + 발생일수 수동 조정, 키 컬럼 제외 readonly), (C) MANAGER role에 USER_ADMIN 권한 추가, (D) PR1 리뷰에서 발견된 follow-up 7건, (E) 장기 codes 마이그레이션 plan 문서 작성.

**Architecture:**
- Phase A: `packages/shared/constants/leave-types.ts` 신설. snake_case enum (`full/half_am/half_pm/hourly/sick/family/public`) + `getLeaveTypeLabel(type, t)` helper. ko.json 키 정정.
- Phase B: `saveContractorContract` server action 신규. LeaveMasterGridContainer 편집 가능 모드 전환. EmployeePicker로 user 선택. 신규 계약 행 = `state="new"`만 user 선택 가능 (`lockOnExisting`), 기존 행은 user/employeeId/name readonly. start/end/generated_leave_hours/additional_leave_hours/note 편집 가능. usedDays/remainingDays 계산값 (DataGrid render-time, readonly).
- Phase C: `permissions.ts` ROLE_PERMISSIONS.MANAGER에 `USER_ADMIN` 추가. 운영 DB 트랜잭션 SQL 적용.
- Phase D: PR1 follow-up 7건 (detail dirty guard, types 중복 정리, status assertion 강화, saveLeaveBatch not-found→forbidden 통일, requestStatus TODO + reason cleanup, cancelFailed UX).
- Phase E: 별도 plan 문서 `2026-05-17-codes-system-migration.md` 작성 (실행 X, 향후 가용 슬롯에 진행).

**Tech Stack:** TypeScript const enum · i18n helper · Drizzle · DataGrid baseline · Next.js 15 server action

---

## 영향도 (jarvis-architecture 17계층)

| 계층 | 변경 |
|------|------|
| DB 스키마 | 없음 (contractor_contract 기존 활용) |
| Validation | `contractorContractSchema` 신설 (start_date/end_date/generated_hours/additional_hours/note Zod) |
| 권한 (23 상수) | 변경 없음 (constants). ROLE_PERMISSIONS.MANAGER에 USER_ADMIN 추가 |
| 세션 vs 권한 | 없음 |
| workspaceId | 새 server action workspaceId 격리 |
| Ask AI / Wiki-fs / 검색 | 없음 |
| 서버 액션 | `saveContractorContract` 신규 (apps/web/app/(app)/contractors/leaves/actions.ts) |
| 서버 lib | `listLeaveSummary` 확장 (편집을 위해 contractor_contract 원본 컬럼 추가 반환) |
| UI 라우트 | 변경 없음 |
| UI 컴포넌트 | LeaveMasterGridContainer 편집 가능 전환. EmployeePicker 재사용. detail dirty guard 위해 LeaveDetailGridContainer gridApiRef forward |
| i18n | `leaveTypes` 키 snake_case로 통합. 기존 camelCase 폐기 |
| 테스트 | actions.test.ts 신규 case (saveContractorContract). dev-accounts MANAGER 테스트 가능 |
| 워커 / LLM | 없음 |
| Audit | saveContractorContract도 audit_log 기록 |

## 파일 변경 순서

```
[Phase A]
 1. packages/shared/constants/leave-types.ts                                    (신설)
 2. apps/web/messages/ko.json                                                   (키 정정)
 3. apps/web/app/(app)/contractors/leaves/actions.validators.ts                 (LEAVE_TYPES import)
 4. apps/web/app/(app)/contractors/leaves/_components/LeaveDetailGridContainer.tsx (사용처 갱신)

[Phase B]
 5. packages/shared/validation/contractor.ts                                    (신설 — contractorContractSchema)
 6. apps/web/lib/queries/contractors.ts                                         (listLeaveSummary 확장 — contract 원본 컬럼 추가)
 7. apps/web/app/(app)/contractors/leaves/actions.ts                            (saveContractorContract 신설)
 8. apps/web/app/(app)/contractors/leaves/page.tsx                              (user 목록 prefetch + props 전달)
 9. apps/web/app/(app)/contractors/leaves/_components/LeaveMasterGridContainer.tsx (편집 모드 전환)
10. apps/web/app/(app)/contractors/leaves/_components/LeavesPageClient.tsx     (saveContractorContract orchestration)

[Phase C]
11. packages/shared/constants/permissions.ts                                    (ROLE_PERMISSIONS.MANAGER에 USER_ADMIN 추가)
12. 운영 DB 트랜잭션 SQL (apply via psql)

[Phase D]
13~18. follow-up 7건

[Phase E]
19. docs/superpowers/plans/2026-05-17-codes-system-migration.md                 (plan only, 실행 X)
```

---

### Task A1: `packages/shared/constants/leave-types.ts` 신설

**Files:**
- Create: `packages/shared/constants/leave-types.ts`

- [ ] **Step 1: 파일 생성**

```ts
/**
 * 휴가 유형 enum (DB `leave_request.type` snake_case 값과 1:1 일치).
 *
 * 라벨은 i18n `Contractors.leaves.detail.types.<type>`에서 lookup.
 * 컴포넌트는 `getLeaveTypeLabel(type, t)` 헬퍼만 호출하여 drift 차단.
 */
export const LEAVE_TYPES = [
  "full",       // 연차 (월차)
  "half_am",    // 오전 반차
  "half_pm",    // 오후 반차
  "hourly",     // 시간차
  "sick",       // 병가
  "family",     // 경조사
  "public"      // 공가/공무
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

/**
 * i18n 키 lookup helper. 컴포넌트에서 호출:
 *
 * ```ts
 * const t = useTranslations("Contractors.leaves.detail.types");
 * <span>{getLeaveTypeLabel(row.type, t)}</span>
 * ```
 *
 * Unknown type은 raw value 반환 (drift 시 명시적 노출).
 */
export function getLeaveTypeLabel(
  type: string,
  t: (key: string) => string
): string {
  if ((LEAVE_TYPES as readonly string[]).includes(type)) {
    return t(type);
  }
  return type; // unknown — DB drift 가시화
}
```

- [ ] **Step 2: type-check**

```bash
pnpm --filter @jarvis/shared type-check 2>&1 || true   # 패키지에 type-check 없으면 skip
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/constants/leave-types.ts
git commit -m "feat(shared): leave-types snake_case enum + getLeaveTypeLabel helper"
```

---

### Task A2: ko.json 키 snake_case 정정

**Files:**
- Modify: `apps/web/messages/ko.json` (`Contractors.leaves.detail.types`)

- [ ] **Step 1: 기존 키 (camelCase) 제거 + 신규 키 (snake_case) 7개 추가**

기존 (T1에서 추가됨):
```json
"types": {
  "annual": "연차",
  "halfAm": "오전반차",
  "halfPm": "오후반차",
  "hourly": "시간차",
  "sick": "병가",
  "family": "경조사"
}
```

신규 (DB 값과 일치):
```json
"types": {
  "full": "연차",
  "half_am": "오전반차",
  "half_pm": "오후반차",
  "hourly": "시간차",
  "sick": "병가",
  "family": "경조사",
  "public": "공가"
}
```

> **사용자 결정 (2026-05-17):** "full 연차(월차)" — i18n 라벨은 "연차"로 단순화 (월차 동의어 별도 표시 X). 코드 주석에 "= 월차" 명시.

- [ ] **Step 2: 기존 사용처가 camelCase 키를 참조하지 않는지 grep**

```bash
grep -rn 'detail\.types\.\(annual\|halfAm\|halfPm\)' apps packages --include='*.ts' --include='*.tsx'
```
Expected: PR1에서 추가한 LeaveDetailGridContainer.tsx에서만 사용 (Task A3에서 함께 변경).

- [ ] **Step 3: type-check + commit**

```bash
pnpm --filter @jarvis/web type-check
git add apps/web/messages/ko.json
git commit -m "feat(contractors/leaves): i18n types keys snake_case (DB 값 매칭)"
```

---

### Task A3: `actions.validators.ts` + `LeaveDetailGridContainer.tsx` 사용처 갱신

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/actions.validators.ts` (LEAVE_TYPES import + enum 사용)
- Modify: `apps/web/app/(app)/contractors/leaves/_components/LeaveDetailGridContainer.tsx` (LEAVE_TYPES import + label helper)

- [ ] **Step 1: actions.validators.ts에서 LEAVE_TYPES import**

```ts
// 기존 LEAVE_TYPES 인라인 정의 삭제 (라인 3 근처)
// const LEAVE_TYPES = ["annual", "halfAm", ...] as const;

// 교체:
import { LEAVE_TYPES } from "@jarvis/shared/constants/leave-types";
```

- [ ] **Step 2: LeaveDetailGridContainer.tsx 갱신**

```ts
import { LEAVE_TYPES, getLeaveTypeLabel } from "@jarvis/shared/constants/leave-types";

// 기존 인라인 LEAVE_TYPES 상수 삭제
// type select column options 갱신:
options: LEAVE_TYPES.map((v) => ({ value: v, label: tType(v) }))
```

makeBlankRow 기본 type도 변경:
```ts
type: "full",  // 기존 "annual" → "full"
```

- [ ] **Step 3: vitest 실행 (hourly 케이스 + 기존)**

```bash
pnpm --filter @jarvis/web exec vitest run --dir 'app/(app)/contractors'
```

기존 test의 `type: "annual"`은 `"full"`로 변경 또는 그대로 유지 (test가 직접 enum 값 사용 시).

Expected: 9/9 PASS (또는 일부 케이스 type 값 수정 후 PASS)

- [ ] **Step 4: type-check + lint**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
```

- [ ] **Step 5: /browse 라이브 검증**

dev server에서 /contractors/leaves 진입 → 우측 detail에 `full`/`half_pm` 대신 "연차"/"오후반차" 표시 확인.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/actions.validators.ts \
        apps/web/app/\(app\)/contractors/leaves/actions.test.ts \
        apps/web/app/\(app\)/contractors/leaves/_components/LeaveDetailGridContainer.tsx
git commit -m "feat(contractors/leaves): LEAVE_TYPES from shared + label helper"
```

---

### Task B1: `contractorContractSchema` Zod validation 신설

**Files:**
- Create: `packages/shared/validation/contractor.ts`

- [ ] **Step 1: Zod 스키마 작성**

```ts
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-mm-dd 형식");

export const contractorContractCreateSchema = z.object({
  userId: z.string().uuid(),
  startDate: dateStr,
  endDate: dateStr,
  generatedHours: z.number().min(0),
  additionalHours: z.number().min(0).default(0),
  note: z.string().nullable().default(null)
}).refine((v) => v.startDate <= v.endDate, {
  message: "시작일 ≤ 종료일",
  path: ["endDate"]
});

export const contractorContractUpdateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    startDate: dateStr.optional(),
    endDate: dateStr.optional(),
    generatedHours: z.number().min(0).optional(),
    additionalHours: z.number().min(0).optional(),
    note: z.string().nullable().optional()
  })
});

export const saveContractorContractInputSchema = z.object({
  creates: z.array(contractorContractCreateSchema).default([]),
  updates: z.array(contractorContractUpdateSchema).default([]),
  deletes: z.array(z.string().uuid()).default([])
});

export type SaveContractorContractInput = z.infer<typeof saveContractorContractInputSchema>;
```

- [ ] **Step 2: type-check + commit**

```bash
git add packages/shared/validation/contractor.ts
git commit -m "feat(shared/validation): contractorContract Zod schemas"
```

---

### Task B2: `listLeaveSummary` 확장 — contract 원본 컬럼 추가 반환

**Files:**
- Modify: `apps/web/lib/queries/contractors.ts:486-497` (`LeaveSummaryRow` interface + buildLeaveSummaryRow)

- [ ] **Step 1: LeaveSummaryRow에 contract 원본 컬럼 추가**

```ts
export interface LeaveSummaryRow {
  contractId: string;
  userId: string;
  employeeId: string;
  name: string;
  contractStartDate: string;
  contractEndDate: string;
  generatedDays: number;     // = (generatedHours + additionalHours) / 8 (계산값, UI readonly)
  usedDays: number;          // (계산값, UI readonly)
  remainingDays: number;     // (계산값, UI readonly)
  note: string | null;
  // 신규 (편집용 — DB 원본 컬럼):
  generatedHours: number;    // contract.generated_leave_hours (편집 가능)
  additionalHours: number;   // contract.additional_leave_hours (편집 가능)
}
```

`buildLeaveSummaryRow`에 두 필드 매핑 추가.

- [ ] **Step 2: type-check**

기존 호출처가 새 필드를 사용하지 않으므로 backward-compatible.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/queries/contractors.ts
git commit -m "feat(contractors/leaves): expose generatedHours/additionalHours in LeaveSummaryRow"
```

---

### Task B3: `saveContractorContract` server action 신설

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/actions.ts` (append)
- Test: `apps/web/app/(app)/contractors/leaves/actions.test.ts` (append cases)

- [ ] **Step 1: TDD — failing test 추가**

```ts
describe("saveContractorContract", () => {
  it("inserts new contract + audit_log", async () => {
    const res = await saveContractorContract({
      creates: [{
        userId: TEST_USER_ID,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        generatedHours: 48,
        additionalHours: 0,
        note: null
      }],
      updates: [],
      deletes: []
    });
    expect(res.created).toHaveLength(1);
  });

  it("rejects update of contract from another workspace", async () => {
    await expect(saveContractorContract({
      creates: [],
      updates: [{
        id: OTHER_WORKSPACE_CONTRACT_ID,
        patch: { note: "hack" }
      }],
      deletes: []
    })).rejects.toThrow(/forbidden/);
  });

  it("rejects creates by non-USER_ADMIN", async () => {
    // mock session with MEMBER role
    await expect(saveContractorContract({
      creates: [{ /* valid */ }],
      updates: [],
      deletes: []
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run --dir 'app/(app)/contractors'
```

- [ ] **Step 3: 구현**

```ts
import { saveContractorContractInputSchema } from "@jarvis/shared/validation/contractor";

export async function saveContractorContract(input: unknown): Promise<{
  ok: boolean;
  created: string[];
  updated: string[];
  deleted: string[];
  errors?: { message: string }[];
}> {
  const parsed = saveContractorContractInputSchema.parse(input);
  const session = await requirePageSession(PERMISSIONS.USER_ADMIN);

  // workspaceId 격리 검증 — updates/deletes 대상 contract가 같은 workspace인지
  const targetIds = [...parsed.updates.map(u => u.id), ...parsed.deletes];
  if (targetIds.length > 0) {
    const owned = await db
      .select({ id: contractorContract.id, workspaceId: contractorContract.workspaceId })
      .from(contractorContract)
      .where(inArray(contractorContract.id, targetIds));
    for (const c of owned) {
      if (c.workspaceId !== session.workspaceId) throw new Error("forbidden");
    }
  }

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  await db.transaction(async (tx) => {
    for (const ins of parsed.creates) {
      const id = randomUUID();
      await tx.insert(contractorContract).values({
        id,
        workspaceId: session.workspaceId,
        userId: ins.userId,
        startDate: ins.startDate,
        endDate: ins.endDate,
        generatedLeaveHours: String(ins.generatedHours),
        additionalLeaveHours: String(ins.additionalHours),
        note: ins.note,
        status: "active"
      });
      await tx.insert(auditLog).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "CONTRACT_INSERT",
        resourceType: "contractor_contract",
        resourceId: id,
        details: { userId: ins.userId, startDate: ins.startDate, endDate: ins.endDate }
      });
      created.push(id);
    }
    for (const upd of parsed.updates) {
      const patchValues: Record<string, unknown> = {};
      if (upd.patch.startDate) patchValues.startDate = upd.patch.startDate;
      if (upd.patch.endDate) patchValues.endDate = upd.patch.endDate;
      if (upd.patch.generatedHours !== undefined) patchValues.generatedLeaveHours = String(upd.patch.generatedHours);
      if (upd.patch.additionalHours !== undefined) patchValues.additionalLeaveHours = String(upd.patch.additionalHours);
      if (upd.patch.note !== undefined) patchValues.note = upd.patch.note;
      patchValues.updatedAt = new Date();
      if (Object.keys(patchValues).length === 0) continue;

      await tx.update(contractorContract)
        .set(patchValues)
        .where(and(
          eq(contractorContract.id, upd.id),
          eq(contractorContract.workspaceId, session.workspaceId)
        ));
      await tx.insert(auditLog).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "CONTRACT_UPDATE",
        resourceType: "contractor_contract",
        resourceId: upd.id,
        details: { patch: upd.patch }
      });
      updated.push(upd.id);
    }
    if (parsed.deletes.length > 0) {
      await tx.update(contractorContract)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(
          inArray(contractorContract.id, parsed.deletes),
          eq(contractorContract.workspaceId, session.workspaceId)
        ));
      for (const id of parsed.deletes) {
        await tx.insert(auditLog).values({
          id: randomUUID(),
          workspaceId: session.workspaceId,
          userId: session.userId,
          action: "CONTRACT_DELETE",
          resourceType: "contractor_contract",
          resourceId: id,
          details: {}
        });
        deleted.push(id);
      }
    }
  });

  return { ok: true, created, updated, deleted };
}
```

> **soft delete:** `status: "deleted"` 변경 (DELETE FROM 안 함 — leave_request FK 보존). list 쿼리에서 `status != 'deleted'` 필터 추가 필요 (Task B2와 같이 진행).

- [ ] **Step 4: Run test — PASS**

```bash
pnpm --filter @jarvis/web exec vitest run --dir 'app/(app)/contractors'
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/actions.ts \
        apps/web/app/\(app\)/contractors/leaves/actions.test.ts
git commit -m "feat(contractors/leaves): saveContractorContract server action (CRUD + audit)"
```

---

### Task B4: `LeaveMasterGridContainer` 편집 모드 전환

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/_components/LeaveMasterGridContainer.tsx`

- [ ] **Step 1: read-only → editable 변환**

핵심 변경:
- `readOnly` prop 제거 (또는 `disabled` prop으로 외부 제어 가능하게)
- `hideToolbar` 제거 (입력/저장 버튼 노출)
- 컬럼 `editable` 설정:
  - `employeeId`, `name` — `editable: false` (user 테이블 source, readonly)
  - `contractStartDate`, `contractEndDate` — `lockOnExisting: false` (모든 행 편집 가능). 단, 기존 행이면 신중. user 결정: "키 컬럼만 빼고" → start/end는 키 아님 = 편집 OK
  - `generatedDays`, `usedDays`, `remainingDays` — 계산값이라 `editable: false`. 단, 사용자 요청 "발생일수 수동 조정" → `generatedHours` (DB 원본) 컬럼 추가 + 편집 가능
  - `note` — 편집 가능
- 새 컬럼 추가:
  - `generatedHours` — numeric, editable, integer=false (8시간 = 1일, 소수점 지원)
  - `additionalHours` — numeric, editable, integer=false
- `onSave` 구현 — `saveContractorContract` 호출
- `makeBlankRow` 의미 있게 변경 — 신규 contract 행 default
- props 변경: `onSaved: () => void` 추가 (parent에서 reload trigger), `users: { id, name, employeeId }[]` (EmployeePicker용)

**user selection:** 신규 행은 user 선택 필요. 기존 컬럼 `name`/`employeeId`는 user 테이블 lookup. 가장 간단한 패턴 — `userId` 신규 컬럼 추가 (lockOnExisting=true, type="select", options=users 목록). 신규 행에서만 user 선택, 기존 행은 readonly.

(상세 코드는 implementer가 baseline contract 보면서 작성)

- [ ] **Step 2: type-check + lint**

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/_components/LeaveMasterGridContainer.tsx
git commit -m "feat(contractors/leaves): LeaveMasterGridContainer editable mode (CRUD)"
```

---

### Task B5: `LeavesPageClient` + `page.tsx` 통합

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/page.tsx` (user 목록 prefetch)
- Modify: `apps/web/app/(app)/contractors/leaves/_components/LeavesPageClient.tsx` (saveContractorContract orchestration)

- [ ] **Step 1: page.tsx에서 user 목록 fetch**

기존 fetch에 contractor user 목록 추가:
```ts
const [rows, contractorUsers] = await Promise.all([
  listLeaveSummary(...),
  db.select({ id: user.id, name: user.name, employeeId: user.employeeId })
    .from(user)
    .where(and(
      eq(user.workspaceId, session.workspaceId),
      eq(user.employmentType, "contractor")
    ))
]);
```

`<LeavesPageClient ... users={contractorUsers} />` 전달.

- [ ] **Step 2: LeavesPageClient에 users prop + master onSaved 콜백 추가**

```ts
interface Props {
  initialSummary: LeaveSummaryRow[];
  initialQuery: { ... };
  isAdmin: boolean;
  users: { id: string; name: string; employeeId: string }[];  // 신규
}

// LeaveMasterGridContainer에 users prop 전달:
<LeaveMasterGridContainer
  rows={initialSummary}
  selectedId={selectedId}
  onSelect={handleSelect}
  users={users}  // 신규
  disabled={!isAdmin}  // MANAGER도 USER_ADMIN 가지면 가능
  onSaved={() => {
    router.refresh();  // master + detail 모두 fresh
  }}
/>
```

- [ ] **Step 3: type-check + lint + /browse 라이브 검증**

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/page.tsx \
        apps/web/app/\(app\)/contractors/leaves/_components/LeavesPageClient.tsx
git commit -m "feat(contractors/leaves): wire saveContractorContract + users prop"
```

---

### Task C1: MANAGER USER_ADMIN 권한 추가

**Files:**
- Modify: `packages/shared/constants/permissions.ts:70-92` (ROLE_PERMISSIONS.MANAGER 배열)

- [ ] **Step 1: ROLE_PERMISSIONS.MANAGER에 USER_ADMIN append + JSDoc 수정**

```ts
MANAGER: [
  // ... 기존 21개 ...
  PERMISSIONS.SALES_READ,
  PERMISSIONS.SALES_ADMIN,
  PERMISSIONS.USER_ADMIN  // 신규 (계약 + 휴가관리 등)
],
```

JSDoc:
```
- MANAGER (매니저): 부서장/책임자, admin:all 제외 = 22권한
```

- [ ] **Step 2: 운영 DB 트랜잭션 SQL**

```sql
BEGIN;

-- 1. MANAGER role에 USER_ADMIN 권한 INSERT (멱등)
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r, permission p
WHERE r.code = 'MANAGER' AND p.code = 'user:admin'
ON CONFLICT DO NOTHING;

-- 2. 검증 — MANAGER 권한 22개?
DO $$
DECLARE cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM role_permission rp
  JOIN role r ON rp.role_id = r.id
  WHERE r.code = 'MANAGER';
  IF cnt <> 22 THEN
    RAISE EXCEPTION 'MANAGER permission count = %, expected 22', cnt;
  END IF;
END $$;

COMMIT;
```

- [ ] **Step 3: SQL 적용 + 검증**

```bash
DB_URL=$(grep DATABASE_URL .env | sed 's/^.*=//;s/"//g')
psql "$DB_URL" -f .local/sql/2026-05-17-manager-user-admin.sql
```

- [ ] **Step 4: e2e auth helper / 시드 확인**

`apps/web/e2e/helpers/auth.ts`의 `loginAsManager`가 자동으로 새 권한 받는지 확인 (ROLE_PERMISSIONS[role]를 spread하므로 자동).

- [ ] **Step 5: Commit + SQL 파일도 .local에 보존**

```bash
git add packages/shared/constants/permissions.ts
git commit -m "feat(rbac): MANAGER role + USER_ADMIN permission"
```

`.local/sql/2026-05-17-manager-user-admin.sql`는 `.local` gitignored.

---

### Task D1: Detail dirty guard

**Files:**
- Modify: `LeaveDetailGridContainer.tsx` (props에 `onDirtyChange` + ref forward)
- Modify: `LeavesPageClient.tsx` (UnsavedChangesDialog 합성)

(상세 — 별도 task 진행)

### Task D2: Contractors.types vs leaves.detail.types 중복 정리

Task A2에서 leaves.detail.types snake_case로 통합되면, 기존 `Contractors.types.day_off` 등 schedule용 키와 별도 namespace 유지. 정리 — 사용처가 다른지 확인. **자연 해소 가능** (스킵 가능).

### Task D3~D6: 나머지 follow-up

(plan 본문에서 PR1 review 보고서 참조하여 implementer가 진행)

---

### Task E1: 장기 codes 마이그레이션 plan 문서

**Files:**
- Create: `docs/superpowers/plans/2026-05-17-codes-system-migration.md`

PR1 토론 결과 기반 별도 plan 문서. Phase 1~4 분해. 실행 X.

---

## Self-Review

**Spec coverage:**
- 사용자 결정 3건 모두 task 매핑: enum 한글화(A) / Master CRUD(B) / MANAGER 권한(C) / follow-up(D) / 장기 plan(E)
- Phase 분리 명확. 실패 시 phase 단위 롤백 가능.

**Placeholder scan:**
- Task B4 (Master 편집 모드)는 baseline 코드 작성을 implementer에게 위임 — column 정의가 길어 plan에 다 못 담음. implementer가 PR1의 LeaveDetailGridContainer 패턴 + admin/companies CompaniesGridContainer 패턴 참조하여 작성.
- Task D1 (detail dirty guard)도 baseline 변경(LeaveDetailGridContainer ref forward + DataGrid `onDirtyChange` prop 활용) 필요 — implementer가 baseline 확인 후 작성.

**Type consistency:**
- `LEAVE_TYPES` snake_case (`@jarvis/shared/constants/leave-types`)이 모든 사용처(actions.validators + LeaveDetailGridContainer + 미래 LeaveMasterGridContainer)에서 단일 import.
- `saveContractorContractInputSchema` Zod가 server action 입력 강제.
- `LeaveSummaryRow` 신규 필드 (`generatedHours`, `additionalHours`) backward-compatible.

## 실행 모드

`subagent-driven-development`. PR1과 동일 패턴 (fresh implementer per task + spec/quality review).

## 알려진 의존성

- Task A2 (i18n) → A3 (사용처) 순서 엄격
- Task B1 (Zod) → B3 (server action) 순서 엄격
- Task B3 (server action) → B5 (orchestration) 순서 엄격
- Task C1 → e2e 영향. e2e가 ROLE_PERMISSIONS 동적 사용하므로 자동 반영. 단 DB SQL 적용 후 dev session 재발급.
- Task D1 (detail dirty guard)는 LeaveDetailGridContainer + LeavesPageClient + DataGrid 의존성 검토 필요. baseline에 `onDirtyChange` prop 이미 존재 (DataGridProps:67) — wire만 추가.
