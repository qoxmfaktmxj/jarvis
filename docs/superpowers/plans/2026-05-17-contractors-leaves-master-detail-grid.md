# Contractors 휴가관리 master/detail DataGrid 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/contractors/leaves` 화면을 위/아래 stack 자체 `<table>` 하이브리드 구조에서 좌(60%) master / 우(40%) detail **DataGrid baseline** 좌우 분할로 전환한다.

**Architecture:**
- Master 그리드: 계약자별 휴가 요약 (read-only). 행 클릭 시 detail fetch.
- Detail 그리드: 선택된 계약의 `leave_request` 목록. 인라인 신규 신청 + 기존 행 취소 토글 + batch save.
- 두 그리드 모두 공유 `<DataGrid<T>>` baseline 사용. 자체 `<table>` 0건. 그리드 표준 §1 절대원칙 준수.

**Tech Stack:** Next.js 15 App Router · React 19 · Drizzle · DataGrid baseline (`apps/web/components/grid/`) · useGridState · GridSearchForm · next-intl

**Reference 화면:** `admin/companies/_components/CompaniesGridContainer.tsx` (master/detail prop, lockOnExisting, windowedPagination 전부 적용)

---

## 영향도 (jarvis-architecture 17계층)

| 계층 | 변경 |
|------|------|
| DB 스키마 | 없음 (`leave_request`/`contractor_contract` 기존) |
| Validation | `leaveBatchInputSchema` 기존 그대로. detail row Zod 신설 안 함 (server action만 강제) |
| 권한 (23 상수) | 없음 (`USER_READ` 읽기, `USER_ADMIN` 저장 기존) |
| 세션 vs 권한 | 없음 |
| workspaceId | 새 server action에서 workspaceId 필터 필수 |
| Ask AI / Wiki-fs / 검색 | 없음 |
| 서버 액션 | `listLeaveRequestsForContract` 신설 (detail fetch). `saveLeaveBatch` 그대로 |
| 서버 lib | `listLeaveSummary` (`lib/queries/contractors.ts`) 그대로 |
| UI 라우트 | `/contractors/leaves` page.tsx — fetch는 기존, client component 교체 |
| UI 컴포넌트 | LeaveMasterGridContainer + LeaveDetailGridContainer + LeavesPageClient 신설. LeaveManagementPanel + LeaveMasterTable + LeaveDetailTable 삭제 |
| i18n | Contractors.leaves.* 일부 키 보강 (master/detail 그리드 컬럼·툴바 라벨) |
| 테스트 | `actions.test.ts` 통과 유지. 신규 컴포넌트 단위 테스트는 baseline에 위임 (DataGrid 자체 테스트). e2e는 별도 PR |
| 워커 / LLM / Audit | 없음 (`saveLeaveBatch`가 이미 `audit_log` 기록) |

## 파일 변경 순서 (jarvis-architecture 20단계)

```
12. apps/web/app/(app)/contractors/leaves/actions.ts                       (server action 신설)
15. apps/web/app/(app)/contractors/leaves/_components/LeaveDetailGridContainer.tsx   (신설)
15. apps/web/app/(app)/contractors/leaves/_components/LeaveMasterGridContainer.tsx   (신설)
15. apps/web/app/(app)/contractors/leaves/_components/LeavesPageClient.tsx           (신설)
14. apps/web/app/(app)/contractors/leaves/page.tsx                          (re-wire)
16. apps/web/messages/ko.json                                               (i18n 보강 — 마지막 배치)
-.  apps/web/components/contractors/LeaveManagementPanel.tsx                (삭제)
-.  apps/web/components/contractors/LeaveMasterTable.tsx                    (삭제)
-.  apps/web/components/contractors/LeaveDetailTable.tsx                    (삭제)
19. type-check / lint / audit:rsc 게이트
```

---

### Task 1: i18n 키 사전 정리

**Files:**
- Modify: `apps/web/messages/ko.json` (Contractors.leaves 네임스페이스)

기존 `Contractors.leaves.*` 키 + 신규 키 한 번에 정리. 마지막 배치 원칙(jarvis-architecture)이라 보통 마지막인데, 본 task는 컬럼·툴바 라벨 결정 의도를 미리 잠그기 위해 먼저 한다. 이후 컴포넌트 코드는 이 키를 그대로 참조.

- [ ] **Step 1: 현재 `Contractors.leaves` 키 읽기**

Run: `Grep -n 'leaves' apps/web/messages/ko.json --context 2`

- [ ] **Step 2: 신규/조정 키 정의 (master 컬럼, detail 컬럼, 툴바, 다이얼로그)**

`Contractors.leaves` 하위에 아래 키들이 모두 있어야 함 (기존 키는 유지·보강만):

```json
{
  "Contractors": {
    "leaves": {
      "search": {
        "referenceDate": "기준일",
        "name": "성명",
        "submit": "조회"
      },
      "master": {
        "title": "휴가 요약",
        "columns": {
          "no": "No",
          "employeeId": "사번",
          "name": "성명",
          "contractStart": "계약 시작",
          "contractEnd": "계약 종료",
          "generated": "발생",
          "used": "사용",
          "remaining": "잔여",
          "note": "비고"
        },
        "empty": "조건에 맞는 계약자가 없습니다."
      },
      "detail": {
        "title": "휴가 신청",
        "columns": {
          "no": "No",
          "status": "상태",
          "type": "유형",
          "appliedAt": "신청일",
          "requestStatus": "결재",
          "startDate": "시작일",
          "endDate": "종료일",
          "days": "일수",
          "hours": "시간",
          "reason": "사유"
        },
        "types": {
          "annual": "연차",
          "halfAm": "오전반차",
          "halfPm": "오후반차",
          "hourly": "시간차",
          "sick": "병가",
          "family": "경조사"
        },
        "status": {
          "active": "유효",
          "cancelled": "취소"
        },
        "requestStatus": {
          "approved": "승인",
          "pending": "대기",
          "rejected": "반려"
        },
        "empty": "선택된 계약에 휴가 내역이 없습니다.",
        "noSelection": "좌측에서 계약자를 선택하세요.",
        "toast": {
          "saved": "저장되었습니다.",
          "saveFailed": "저장에 실패했습니다.",
          "cancelFailed": "다음 취소를 처리하지 못했습니다: {ids}"
        }
      }
    }
  }
}
```

- [ ] **Step 3: ko.json 패치 후 type-check (key 누락 컴파일 오류 X 확인)**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 에러 0건 (next-intl은 빌드 타임 강제 X, 런타임 dev-warn — 이 단계에선 ok)

- [ ] **Step 4: Commit**

```bash
git add apps/web/messages/ko.json
git commit -m "feat(contractors/leaves): i18n keys for master/detail grid"
```

---

### Task 2: server action `listLeaveRequestsForContract` 신설

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/actions.ts` (기존 `saveLeaveBatch` 유지, 신규 export 추가)
- Modify: `apps/web/app/(app)/contractors/leaves/actions.validators.ts` (입력 Zod 추가)
- Test: `apps/web/app/(app)/contractors/leaves/actions.test.ts` (기존 파일에 신규 케이스 append)

선택된 contractId의 `leave_request` 목록 조회. workspaceId + contractId 이중 필터.

- [ ] **Step 1: Zod 입력 스키마 추가**

`actions.validators.ts`에 추가:

```ts
import { z } from "zod";

export const listLeaveRequestsInputSchema = z.object({
  contractId: z.string().uuid()
});

export type ListLeaveRequestsInput = z.infer<typeof listLeaveRequestsInputSchema>;
```

- [ ] **Step 2: 테스트 추가 (failing)**

`actions.test.ts`에 케이스 append (기존 vitest 설정 그대로):

```ts
describe("listLeaveRequestsForContract", () => {
  it("returns rows scoped to contract + workspace", async () => {
    // 기존 mock 세팅 재사용. 1개 contract에 leave_request 2개 seed.
    const res = await listLeaveRequestsForContract({ contractId: TEST_CONTRACT_ID });
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
      startDate: expect.any(String),
      endDate: expect.any(String),
      hours: expect.any(Number),
      status: expect.stringMatching(/^(active|cancelled)$/)
    });
  });

  it("rejects contract from another workspace", async () => {
    await expect(
      listLeaveRequestsForContract({ contractId: OTHER_WORKSPACE_CONTRACT_ID })
    ).rejects.toThrow(/forbidden/);
  });
});
```

- [ ] **Step 3: Run test — fails**

Run: `pnpm --filter @jarvis/web exec vitest run apps/web/app/\(app\)/contractors/leaves/actions.test.ts`
Expected: FAIL — `listLeaveRequestsForContract is not defined`

- [ ] **Step 4: server action 구현 (minimal)**

`actions.ts`에 append:

```ts
import { listLeaveRequestsInputSchema } from "./actions.validators";
import { desc } from "drizzle-orm";

export interface LeaveRequestRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  hours: number;
  reason: string | null;
  status: "active" | "cancelled";
  appliedAt: string;
  cancelledAt: string | null;
  requestStatus: string; // approved/pending/rejected (현재 항상 approved이지만 UI 표시용)
}

export async function listLeaveRequestsForContract(
  input: unknown
): Promise<{ ok: true; rows: LeaveRequestRow[] }> {
  const parsed = listLeaveRequestsInputSchema.parse(input);
  const session = await requirePageSession(PERMISSIONS.USER_READ);

  // contract ownership check
  const [contract] = await db
    .select({ id: contractorContract.id, workspaceId: contractorContract.workspaceId })
    .from(contractorContract)
    .where(eq(contractorContract.id, parsed.contractId))
    .limit(1);

  if (!contract || contract.workspaceId !== session.workspaceId) {
    throw new Error("forbidden");
  }

  const rows = await db
    .select({
      id: leaveRequest.id,
      type: leaveRequest.type,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      hours: leaveRequest.hours,
      reason: leaveRequest.reason,
      status: leaveRequest.status,
      appliedAt: leaveRequest.createdAt,
      cancelledAt: leaveRequest.cancelledAt
    })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.workspaceId, session.workspaceId),
        eq(leaveRequest.contractId, parsed.contractId)
      )
    )
    .orderBy(desc(leaveRequest.startDate));

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      hours: Number(r.hours),
      reason: r.reason ?? null,
      status: r.status === "cancelled" ? "cancelled" : "active",
      appliedAt: r.appliedAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      requestStatus: "approved"
    }))
  };
}
```

- [ ] **Step 5: Run test — passes**

Run: `pnpm --filter @jarvis/web exec vitest run apps/web/app/\(app\)/contractors/leaves/actions.test.ts`
Expected: PASS 2 신규 케이스 + 기존 케이스 전부

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/actions.ts \
        apps/web/app/\(app\)/contractors/leaves/actions.validators.ts \
        apps/web/app/\(app\)/contractors/leaves/actions.test.ts
git commit -m "feat(contractors/leaves): server action listLeaveRequestsForContract"
```

---

### Task 3: `LeaveDetailGridContainer.tsx` 신설

**Files:**
- Create: `apps/web/app/(app)/contractors/leaves/_components/LeaveDetailGridContainer.tsx`

DataGrid baseline 사용. 선택된 계약의 `leave_request` 목록 + 신규 신청 행 + 기존 행 취소(삭제) 처리. batch save로 `saveLeaveBatch` 호출.

**컬럼 결정 (그리드 표준 §5 PK → 본문 → audit):**

| 좌측 | 본문 | 우측 |
|------|------|------|
| no (1-based) | status / type / appliedAt / requestStatus / startDate / endDate / days / reason | (audit 없음 — leave_request에 updatedBy 표시 안 함) |

- `type`, `startDate`, `endDate`, `hours`, `reason` 컬럼 `lockOnExisting: true` — 기존 행은 readonly, 신규 행만 편집.
- 기존 행 삭제는 DataGrid 기본 삭제 컬럼 (`useGridState` `markDeleted`)으로 → `saveLeaveBatch.cancels` 변환.
- 컬럼 readonly 정책 (기존 leave_request 행): `appliedAt`, `requestStatus`, `status` 항상 readonly.

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useCallback, useMemo, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { GridColumn } from "@/components/grid/DataGrid";
import type { LeaveRequestRow } from "@/app/(app)/contractors/leaves/actions";
import { saveLeaveBatch } from "@/app/(app)/contractors/leaves/actions";

const PAGE_SIZE = 50;
const LEAVE_TYPES = ["annual", "halfAm", "halfPm", "hourly", "sick", "family"] as const;

interface Props {
  contractId: string | null;
  rows: LeaveRequestRow[];
  onSaved: () => void;
  disabled?: boolean;
}

export function LeaveDetailGridContainer({ contractId, rows, onSaved, disabled }: Props) {
  const t = useTranslations("Contractors.leaves.detail");
  const tType = useTranslations("Contractors.leaves.detail.types");
  const tStatus = useTranslations("Contractors.leaves.detail.status");
  const tReq = useTranslations("Contractors.leaves.detail.requestStatus");

  const gridApiRef = useRef<{ discardChanges: () => void; toBatch: () => unknown } | null>(null);
  const [pending, start] = useTransition();

  const columns = useMemo<GridColumn<LeaveRequestRow>[]>(
    () => [
      { key: "_rowNumber", header: t("columns.no"), type: "text", width: 60, readOnly: true },
      {
        key: "status",
        header: t("columns.status"),
        type: "select",
        width: 80,
        readOnly: true,
        options: [
          { value: "active", label: tStatus("active") },
          { value: "cancelled", label: tStatus("cancelled") }
        ]
      },
      {
        key: "type",
        header: t("columns.type"),
        type: "select",
        width: 100,
        lockOnExisting: true,
        options: LEAVE_TYPES.map((v) => ({ value: v, label: tType(v) }))
      },
      { key: "appliedAt", header: t("columns.appliedAt"), type: "date", width: 110, readOnly: true },
      {
        key: "requestStatus",
        header: t("columns.requestStatus"),
        type: "select",
        width: 80,
        readOnly: true,
        options: [
          { value: "approved", label: tReq("approved") },
          { value: "pending", label: tReq("pending") },
          { value: "rejected", label: tReq("rejected") }
        ]
      },
      { key: "startDate", header: t("columns.startDate"), type: "date", width: 120, lockOnExisting: true },
      { key: "endDate", header: t("columns.endDate"), type: "date", width: 120, lockOnExisting: true },
      { key: "hours", header: t("columns.hours"), type: "numeric", width: 80, lockOnExisting: true },
      { key: "reason", header: t("columns.reason"), type: "text", width: 240, lockOnExisting: true }
    ],
    [t, tType, tStatus, tReq]
  );

  const handleSave = useCallback(
    async (batch: { creates: LeaveRequestRow[]; updates: LeaveRequestRow[]; deletes: LeaveRequestRow[] }) => {
      if (!contractId) return { ok: false, error: t("toast.saveFailed") };
      const inserts = batch.creates.map((r) => ({
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        hours: Number(r.hours),
        reason: r.reason ?? ""
      }));
      const cancels = batch.deletes.map((r) => r.id);
      try {
        const res = await saveLeaveBatch({ contractId, inserts, cancels });
        if (res.cancelFailed.length > 0) {
          return {
            ok: false,
            error: t("toast.cancelFailed", { ids: res.cancelFailed.join(", ") })
          };
        }
        start(() => onSaved());
        return { ok: true, inserted: res.inserted.length, updated: 0, deleted: res.cancelled.length };
      } catch {
        return { ok: false, error: t("toast.saveFailed") };
      }
    },
    [contractId, onSaved, t]
  );

  const makeBlankRow = useCallback(
    (): LeaveRequestRow => ({
      id: crypto.randomUUID(),
      type: "annual",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      hours: 8,
      reason: "",
      status: "active",
      appliedAt: new Date().toISOString(),
      cancelledAt: null,
      requestStatus: "approved"
    }),
    []
  );

  return (
    <DataGrid<LeaveRequestRow>
      rows={rows}
      columns={columns}
      page={1}
      limit={PAGE_SIZE}
      total={rows.length}
      onPageChange={() => {}}
      onFilterChange={() => {}}
      onSave={handleSave}
      makeBlankRow={makeBlankRow}
      onGridReady={(api) => {
        gridApiRef.current = api;
      }}
      readOnly={disabled || !contractId}
      windowedPagination
      emptyMessage={!contractId ? t("noSelection") : t("empty")}
    />
  );
}
```

> **주의:** `GridColumn`에 `lockOnExisting`/`options`/`emptyMessage` prop 시그니처가 baseline에 존재하는지 implementer 단계에서 먼저 확인할 것. 없으면 baseline에 보강하는 별도 task로 분리 (그리드 표준 §1 "별도 컴포넌트로 분기 금지" — baseline 확장).

- [ ] **Step 2: Commit (compile-only — page wiring은 Task 5에서)**

```bash
git add apps/web/app/\(app\)/contractors/leaves/_components/LeaveDetailGridContainer.tsx
git commit -m "feat(contractors/leaves): LeaveDetailGridContainer with DataGrid baseline"
```

---

### Task 4: `LeaveMasterGridContainer.tsx` 신설

**Files:**
- Create: `apps/web/app/(app)/contractors/leaves/_components/LeaveMasterGridContainer.tsx`

Read-only DataGrid. 행 클릭 시 contractId emit. Excel export 표준 적용.

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DataGrid } from "@/components/grid/DataGrid";
import type { GridColumn } from "@/components/grid/DataGrid";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";

const PAGE_SIZE = 100;

interface Props {
  rows: LeaveSummaryRow[];
  selectedId: string | null;
  onSelect: (contractId: string | null) => void;
}

export function LeaveMasterGridContainer({ rows, selectedId, onSelect }: Props) {
  const t = useTranslations("Contractors.leaves.master");

  const columns = useMemo<GridColumn<LeaveSummaryRow>[]>(
    () => [
      { key: "_rowNumber", header: t("columns.no"), type: "text", width: 50, readOnly: true },
      { key: "employeeId", header: t("columns.employeeId"), type: "text", width: 90, readOnly: true },
      { key: "name", header: t("columns.name"), type: "text", width: 100, readOnly: true },
      { key: "contractStartDate", header: t("columns.contractStart"), type: "date", width: 110, readOnly: true },
      { key: "contractEndDate", header: t("columns.contractEnd"), type: "date", width: 110, readOnly: true },
      { key: "generatedDays", header: t("columns.generated"), type: "numeric", width: 70, readOnly: true, format: "2dp" },
      { key: "usedDays", header: t("columns.used"), type: "numeric", width: 70, readOnly: true, format: "2dp" },
      { key: "remainingDays", header: t("columns.remaining"), type: "numeric", width: 70, readOnly: true, format: "2dp" },
      { key: "note", header: t("columns.note"), type: "text", width: 200, readOnly: true }
    ],
    [t]
  );

  return (
    <DataGrid<LeaveSummaryRow>
      rows={rows}
      columns={columns}
      page={1}
      limit={PAGE_SIZE}
      total={rows.length}
      onPageChange={() => {}}
      onFilterChange={() => {}}
      onSave={async () => ({ ok: true })}
      makeBlankRow={() => ({} as LeaveSummaryRow)}
      selectedId={selectedId}
      onSelect={onSelect}
      readOnly
      hideToolbar
      windowedPagination
      rowIdKey="contractId"
      emptyMessage={t("empty")}
    />
  );
}
```

> **rowIdKey 주의:** `LeaveSummaryRow`의 PK는 `contractId`이므로 DataGrid에 `rowIdKey` prop 또는 등가 mechanism으로 알려야 selected가 정확히 매핑됨. baseline에 `rowIdKey` prop이 없다면 implementer는 (a) 행을 `{ id: row.contractId, ...row }` 형태로 mapping해 전달하거나, (b) baseline에 prop 추가 task 분리 결정.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/_components/LeaveMasterGridContainer.tsx
git commit -m "feat(contractors/leaves): LeaveMasterGridContainer (read-only DataGrid)"
```

---

### Task 5: `LeavesPageClient.tsx` 신설 (6:4 layout + search form + orchestration)

**Files:**
- Create: `apps/web/app/(app)/contractors/leaves/_components/LeavesPageClient.tsx`

Master/detail 6:4 좌우 layout + GridSearchForm + onSelect → detail fetch.

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";
import type { LeaveRequestRow } from "@/app/(app)/contractors/leaves/actions";
import { listLeaveRequestsForContract } from "@/app/(app)/contractors/leaves/actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { LeaveMasterGridContainer } from "./LeaveMasterGridContainer";
import { LeaveDetailGridContainer } from "./LeaveDetailGridContainer";

interface Props {
  initialSummary: LeaveSummaryRow[];
  initialQuery: { referenceDate: string; name: string };
  isAdmin: boolean;
}

export function LeavesPageClient({ initialSummary, initialQuery, isAdmin }: Props) {
  const tSearch = useTranslations("Contractors.leaves.search");
  const router = useRouter();

  const [filters, setFilters] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSummary[0]?.contractId ?? null
  );
  const [detailRows, setDetailRows] = useState<LeaveRequestRow[]>([]);
  const [pending, start] = useTransition();

  // 초기 마운트 시 첫 행 detail 로드
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) {
      setDetailRows([]);
      return;
    }
    start(async () => {
      const res = await listLeaveRequestsForContract({ contractId: id });
      if (res.ok) setDetailRows(res.rows);
    });
  }, []);

  const reloadDetail = useCallback(() => {
    if (!selectedId) return;
    start(async () => {
      const res = await listLeaveRequestsForContract({ contractId: selectedId });
      if (res.ok) setDetailRows(res.rows);
      router.refresh(); // master 요약(used/remaining)도 갱신
    });
  }, [selectedId, router]);

  const runSearch = useCallback(
    (next: typeof filters) => {
      setFilters(next);
      const qs = new URLSearchParams();
      qs.set("date", next.referenceDate);
      if (next.name.trim()) qs.set("name", next.name.trim());
      router.push(`/contractors/leaves?${qs.toString()}`);
    },
    [router]
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <GridSearchForm
        onSubmit={() => runSearch(filters)}
        onResetGrid={() => {
          // master는 readOnly·detail은 reload로 reset
          setDetailRows([]);
        }}
      >
        <GridFilterField
          label={tSearch("referenceDate")}
          type="date"
          value={filters.referenceDate}
          onChange={(v) => setFilters((q) => ({ ...q, referenceDate: v ?? "" }))}
        />
        <GridFilterField
          label={tSearch("name")}
          type="text"
          value={filters.name}
          onChange={(v) => setFilters((q) => ({ ...q, name: v ?? "" }))}
        />
      </GridSearchForm>

      <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3 overflow-hidden">
        <div className="min-h-0 overflow-hidden">
          <LeaveMasterGridContainer
            rows={initialSummary}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <LeaveDetailGridContainer
            contractId={selectedId}
            rows={detailRows}
            onSaved={reloadDetail}
            disabled={!isAdmin || pending}
          />
        </div>
      </div>
    </div>
  );
}
```

> **6:4 분할:** `grid-cols-[6fr_4fr]` (admin/companies 7:3 패턴과 동일 구조, 비율만 다름). `min-h-0 overflow-hidden`로 자식 그리드의 windowedPagination이 viewport 측정 가능하게 한다.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/_components/LeavesPageClient.tsx
git commit -m "feat(contractors/leaves): LeavesPageClient 6:4 master/detail layout"
```

---

### Task 6: `page.tsx` 재배선 + 기존 컴포넌트 3개 삭제

**Files:**
- Modify: `apps/web/app/(app)/contractors/leaves/page.tsx` (LeaveManagementPanel → LeavesPageClient)
- Delete: `apps/web/components/contractors/LeaveManagementPanel.tsx`
- Delete: `apps/web/components/contractors/LeaveMasterTable.tsx`
- Delete: `apps/web/components/contractors/LeaveDetailTable.tsx`

- [ ] **Step 1: page.tsx import 교체**

```tsx
// Before
import { LeaveManagementPanel } from "@/components/contractors/LeaveManagementPanel";

// After
import { LeavesPageClient } from "./_components/LeavesPageClient";

// 그리고 JSX:
return (
  <LeavesPageClient
    initialSummary={rows}
    initialQuery={{ referenceDate, name: nameLike }}
    isAdmin={isAdmin}
  />
);
```

- [ ] **Step 2: 기존 컴포넌트 3개 삭제**

```bash
rm apps/web/components/contractors/LeaveManagementPanel.tsx
rm apps/web/components/contractors/LeaveMasterTable.tsx
rm apps/web/components/contractors/LeaveDetailTable.tsx
```

- [ ] **Step 3: 외부 참조 확인 (grep)**

Run: `Grep -rn 'LeaveManagementPanel\|LeaveMasterTable\|LeaveDetailTable' apps packages --glob '*.{ts,tsx}'`
Expected: 0 hits (이 PR 이후 사용처 없음)

만약 hit이 있으면 같이 정리.

- [ ] **Step 4: dev server에서 화면 확인 (수동)**

수동 검증:
1. `/contractors/leaves` 진입
2. 좌측 master에 계약 요약 리스트 표시
3. 첫 행 자동 선택 + 우측 detail에 해당 계약 휴가 내역 로드
4. 다른 행 클릭 시 detail 갱신
5. 신규 신청 행 추가 → batch save 동작 → master 요약(used/remaining) 갱신
6. 기존 행 삭제 토글 → save 시 cancel 처리

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/contractors/leaves/page.tsx
git rm apps/web/components/contractors/LeaveManagementPanel.tsx \
       apps/web/components/contractors/LeaveMasterTable.tsx \
       apps/web/components/contractors/LeaveDetailTable.tsx
git commit -m "feat(contractors/leaves): wire LeavesPageClient + drop legacy table components"
```

---

### Task 7: 검증 게이트 (jarvis-architecture 검증 게이트 명령)

**Files:** 코드 변경 없음. 게이트 통과만.

- [ ] **Step 1: type-check ×1**

Run: `pnpm --filter @jarvis/web type-check`
Expected: 0 errors

- [ ] **Step 2: lint ×1**

Run: `pnpm --filter @jarvis/web lint`
Expected: 새 ERROR 0건. 기존 unused-var WARN baseline은 변경 없음.

- [ ] **Step 3: audit:rsc ×1 (RSC 경계 변경 — `_components/` 신규 client component 3개)**

Run: `pnpm audit:rsc`
Expected: ERROR 0건

- [ ] **Step 4: 단위 테스트 (Task 2 신규 + 기존)**

Run: `pnpm --filter @jarvis/web exec vitest run apps/web/app/\(app\)/contractors/leaves/actions.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 2회 연속 검증 (feedback_test_twice 메모리)**

위 4 단계를 한 번 더 반복.

- [ ] **Step 6: 마무리 commit (있다면)**

```bash
# 검증 실패 fix 발생 시에만 commit. 통과면 no-op.
```

---

## Self-Review

**1. Spec coverage:**
- 좌(60%)/우(40%) master/detail → Task 5 LeavesPageClient `grid-cols-[6fr_4fr]` ✓
- DataGrid baseline 사용 (그리드 표준 §1 절대원칙) → Task 3/4 ✓
- 기존 자체 `<table>` 3개 삭제 → Task 6 ✓
- master 클릭 → detail fetch → Task 5 `handleSelect` + Task 2 server action ✓
- batch save 동작 유지 → Task 3 `handleSave`가 기존 `saveLeaveBatch` 호출 ✓
- i18n 키 → Task 1 ✓
- 권한 (USER_READ 읽기, USER_ADMIN 저장) → Task 2 + page.tsx 기존 그대로 ✓
- workspaceId 격리 → Task 2 contract.workspaceId 체크 + leave_request 쿼리 필터 ✓

**2. Placeholder scan:** 모든 step에 구체 코드/명령 포함. "TBD" 0건. 단 Task 3/4 끝의 "implementer가 baseline 확장 여부 결정"은 alternative path 안내이지 placeholder 아님 — DataGrid baseline의 prop signature가 Task 3/4 가정과 다르면 implementer가 가장 먼저 처리해야 하는 사전 작업이라 명시.

**3. Type consistency:**
- `LeaveRequestRow` Task 2에서 정의 → Task 3/5에서 동일 import path ✓
- `LeaveSummaryRow` 기존 `lib/queries/contractors`에서 그대로 import (재정의 없음) ✓
- server action `listLeaveRequestsForContract` 시그니처: `(input: { contractId: string }) → Promise<{ ok: true; rows: LeaveRequestRow[] }>` Task 2/5 동일 ✓
- `saveLeaveBatch` 기존 시그니처 (`{ contractId, inserts, cancels }`) Task 3에서 그대로 호출 ✓

## 실행 모드

사용자 선택: **subagent-driven-development**. 본 plan을 task 단위로 implementer → spec-reviewer → code-quality-reviewer 루프로 실행.

각 서브에이전트에게 주입할 도메인 컨텍스트:
- implementer: `jarvis-architecture` 파일 변경 순서 20단계 + `jarvis-architecture/references/grid-standard.md` (그리드 표준 §1 절대원칙·§1-bis 확장 prop·§2 필수 기능 9가지·§7 금지 패턴) + `jarvis-i18n` (Contractors.leaves 키 보강)
- spec-reviewer: `jarvis-db-patterns` 경계면 교차 비교 체크리스트 (workspaceId 격리·shape·권한). 그리드 표준 §8 PR 체크리스트 11항 적용.
- code-quality-reviewer: 일반 원칙 + Jarvis 특수 패턴 (server action 첫 줄 `requirePermission`, 응답 Zod, audit_log 트랜잭션).

## 알려진 baseline 의존성

본 plan은 다음 DataGrid baseline prop이 존재한다고 가정한다 (그리드 표준 §1-bis):
- `selectedId` / `onSelect` (master/detail)
- `readOnly`
- `hideToolbar`
- `columns[].lockOnExisting`
- `windowedPagination` / `onAutoLimitChange`
- `onGridReady(api)` API: `discardChanges`, `toBatch` (sub-component patterns)

실제 baseline에 `emptyMessage`, `rowIdKey`, `format: "2dp"` 같은 prop이 없을 가능성이 있다. **Task 3/4 implementer는 첫 단계로 `apps/web/components/grid/DataGrid.tsx` 시그니처 확인 → 없는 prop은 (a) inline 우회 (예: `rows[].id = rows[].contractId` 매핑) 또는 (b) baseline에 추가 PR로 분리.** "별도 컴포넌트 분기" 절대 금지 (§1 절대원칙).
