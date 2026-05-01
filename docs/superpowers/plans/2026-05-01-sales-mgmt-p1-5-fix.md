# Sales Mgmt P1.5 Fix Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** P1 머지 후 발견된 5건 회귀 수정 — sales/licenses 도메인 mismatch 이전, sales-product-type 정규화, sales-mail-person 컬럼 보완, 4 sales grid Hidden 정책 일괄.

**Architecture:** 11 task로 분할. DB schema 변경(1·2·3) → 공통 컴포넌트(4) → UI 라우트 신설/이전(5·6·7) → 일괄 정책(8·9·10) → 검증(11). 각 task는 jarvis-architecture의 파일 변경 순서 20단계를 따른다.

**Tech Stack:** Next.js 15 + React 19 / Drizzle ORM / PostgreSQL 16 / Vitest + Playwright / next-intl / TailwindCSS 4

**Spec:** [`docs/superpowers/specs/2026-05-01-sales-mgmt-p1-5-fix-design.md`](../specs/2026-05-01-sales-mgmt-p1-5-fix-design.md)

**Worktree:** `.claude/worktrees/eager-ritchie-9f4a82` · branch `claude/eager-ritchie-9f4a82` (base = main `a49cb7d`)

---

## File Structure

### Created
| 경로 | 책임 |
|---|---|
| `packages/db/schema/infra-license.ts` | TBIZ500 1 테이블 (22 모듈 boolean) |
| `packages/db/schema/sales-product-type-cost.ts` | TBIZ024 row 매핑 신규 테이블 (`sales-product-type.ts`에 합쳐도 OK) |
| `packages/shared/validation/infra-license.ts` | Zod schema |
| `packages/shared/validation/sales-product-type-cost.ts` | Zod schema |
| `packages/shared/validation/sales-mail-person.ts` | (확장 — mail_id/memo) |
| `apps/web/lib/queries/infra-license.ts` | list/save 쿼리 |
| `apps/web/lib/queries/sales-product-type-cost.ts` | list/save 쿼리 |
| `apps/web/components/grid/cells/EditableNumericCell.tsx` | P2 spec에서 결정한 신규 셀 (P1.5 선반입) |
| `apps/web/app/(app)/admin/infra/licenses/{page.tsx,actions.ts,_components/}` | infra license 라우트 |
| `apps/web/app/(app)/sales/product-cost-mapping/{page.tsx,actions.ts,_components/}` | product-type-cost 매핑 grid |
| `apps/web/e2e/admin-infra-licenses.spec.ts` | e2e |
| `apps/web/e2e/sales-product-cost-mapping.spec.ts` | e2e |
| `apps/web/e2e/sales-mail-persons.spec.ts` | e2e (mail_id 검증) |

### Modified
| 경로 | 변경 |
|---|---|
| `packages/db/schema/sales-product-type.ts` | `cost_mapping_json` 컬럼 drop, master만 유지 |
| `packages/db/schema/sales-mail-person.ts` | `mail_id text NOT NULL` + `memo text` 추가 |
| `packages/db/schema/index.ts` | exports 정리 |
| `packages/db/seed/menus.ts` | sales/licenses 제거 + admin/infra/licenses 추가 + sales/product-cost-mapping 추가 |
| `packages/db/seed/sales-codes.ts` | INFRA_DEV_GB code_group 1개 추가 |
| `apps/web/app/(app)/sales/customers/_components/*Grid.tsx` | columns 정리(legacy ibSheet Hidden 일관) + insdate |
| `apps/web/app/(app)/sales/customer-contacts/_components/*Grid.tsx` | 동상 |
| `apps/web/app/(app)/sales/product-types/_components/*Grid.tsx` | cost_mapping_json 사용처 제거 + insdate |
| `apps/web/app/(app)/sales/product-types/actions.ts` | cost_mapping_json 처리 부분 제거 |
| `apps/web/app/(app)/sales/mail-persons/_components/*Grid.tsx` | mail_id/memo 컬럼 추가 + insdate |
| `apps/web/app/(app)/sales/mail-persons/actions.ts` | mail_id/memo 필드 처리 |
| `apps/web/messages/ko.json` | Sales.Licenses 제거, Admin.Infra.Licenses + Sales.ProductCostMapping 추가, columns insdate/mailId/memo |

### Deleted
| 경로 | 사유 |
|---|---|
| `packages/db/schema/sales-license.ts` | 도메인 mismatch (TBIZ110/112 잘못 추정) |
| `apps/web/app/(app)/sales/licenses/` 전체 | 동상 |
| `apps/web/e2e/sales-licenses*.spec.ts` (있다면) | 동상 |

---

## Task 1: sales-license drop migration

**Goal:** P1의 잘못 매핑된 sales_license/sales_license_code 테이블 drop.

**Files:**
- Delete: `packages/db/schema/sales-license.ts`
- Modify: `packages/db/schema/index.ts`
- Generated: `packages/db/drizzle/NNNN_drop_sales_license.sql`

- [ ] **Step 1: 운영 데이터 0건 확인**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sales_license; SELECT COUNT(*) FROM sales_license_code;"
```

Expected: 0 / 0. **non-zero면 SDD를 중단**하고 사용자에게 backup 정책 확인. 본 plan은 0건 가정.

- [ ] **Step 2: schema 파일 삭제 + index.ts exports 제거**

```bash
rm packages/db/schema/sales-license.ts
```

`packages/db/schema/index.ts`에서 다음 줄 삭제:
```ts
export * from "./sales-license.js";
```

- [ ] **Step 3: 마이그레이션 생성**

```bash
pnpm --filter @jarvis/db db:generate
```

Expected: `packages/db/drizzle/NNNN_*.sql` 생성, 내용은 `DROP TABLE "sales_license_code"; DROP TABLE "sales_license";` 포함. 마이그레이션 파일 열어서 의도와 일치 확인.

- [ ] **Step 4: 마이그레이션 적용**

```bash
pnpm --filter @jarvis/db db:migrate
```

- [ ] **Step 5: schema drift 검증**

```bash
node scripts/check-schema-drift.mjs --precommit
```

Expected: exit 0.

- [ ] **Step 6: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

이 시점에 `apps/web/app/(app)/sales/licenses/` 의 import 에러 발생 가능 — Task 5에서 라우트 자체 삭제 시 해소되니, 본 task는 임시로 type 에러 허용 (실제로는 sales-license.ts import한 곳을 같은 commit에 정리).

대안 (권장): 라우트 삭제도 본 task에 포함:
```bash
rm -rf "apps/web/app/(app)/sales/licenses"
```

- [ ] **Step 7: commit**

```bash
cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/eager-ritchie-9f4a82
git rev-parse --abbrev-ref HEAD  # claude/eager-ritchie-9f4a82
git add -A
git commit -m "feat(p1.5/db): drop sales_license tables + remove sales/licenses route (domain mismatch)"
```

---

## Task 2: sales-product-type 정규화 + sales_product_type_cost 신설

**Goal:** TBIZ024를 (1) master(`sales_product_type`) + (2) cost master(`sales_cost_master` 재활용) + (3) mapping(`sales_product_type_cost`) 3 테이블 정규화.

**Files:**
- Modify: `packages/db/schema/sales-product-type.ts`
- Create: `packages/shared/validation/sales-product-type.ts` (수정), `packages/shared/validation/sales-product-type-cost.ts`

- [ ] **Step 1: 운영 데이터 0건 확인**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sales_product_type; SELECT COUNT(*) FROM sales_cost_master;"
```

0/0이면 단순 drop column + create. non-zero면 jsonb→row unpack 마이그레이션 추가 필요(별도 사용자 합의).

- [ ] **Step 2: `sales-product-type.ts` schema 갱신**

`packages/db/schema/sales-product-type.ts`를 spec §4.3에 따라 수정:
- `costMappingJson` 컬럼 drop
- 새 테이블 `salesProductTypeCost` 추가 (FK to salesProductType + salesCostMaster, mapping row PK = (ws, productTypeId, costId, sdate))

전체 파일 내용은 spec §4.3 참조. 핵심 export:
```ts
export const salesProductType = pgTable("sales_product_type", { /* cost_mapping_json 제거된 master */ });
export const salesProductTypeCost = pgTable("sales_product_type_cost", { /* mapping row */ });
```

- [ ] **Step 3: 마이그레이션 생성**

```bash
pnpm --filter @jarvis/db db:generate
```

Generated SQL: `ALTER TABLE sales_product_type DROP COLUMN cost_mapping_json` + `CREATE TABLE sales_product_type_cost (...)`. 의도 확인 후 진행.

- [ ] **Step 4: 적용 + drift**

```bash
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --precommit
```

- [ ] **Step 5: Zod schema 추가**

`packages/shared/validation/sales-product-type-cost.ts` 신규:
```ts
import { z } from "zod";

export const productCostInput = z.object({
  productTypeId: z.string().uuid(),
  costId: z.string().uuid(),
  sdate: z.string().date(),
  edate: z.string().date().nullable(),
  bizYn: z.boolean(),
  note: z.string().nullable(),
});

export const productCostOutput = productCostInput.extend({
  id: z.string().uuid(),
  insDate: z.string().datetime(),
});
```

`packages/shared/validation/sales-product-type.ts` 갱신: `costMappingJson` 필드 제거.

- [ ] **Step 6: type-check + 영향 코드 정리**

```bash
pnpm --filter @jarvis/web type-check
```

기존 `sales/product-types/actions.ts`에서 `costMappingJson` 사용처를 모두 제거(이번 task에 inline 수정 — Task 7에서도 다룸).

- [ ] **Step 7: commit**

```bash
cd <worktree> && git rev-parse --abbrev-ref HEAD
git add -A
git commit -m "feat(p1.5/db): normalize sales_product_type into 3 tables (drop cost_mapping_json, add sales_product_type_cost)"
```

---

## Task 3: sales-mail-person 컬럼 추가

**Goal:** `mail_id text NOT NULL` + `memo text` 추가.

**Files:**
- Modify: `packages/db/schema/sales-mail-person.ts`
- Modify: `packages/shared/validation/sales-mail-person.ts`

- [ ] **Step 1: 0건 확인**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sales_mail_person;"
```

- [ ] **Step 2: schema 갱신**

`packages/db/schema/sales-mail-person.ts`에 컬럼 추가:
```ts
mailId: text("mail_id").notNull(),
memo: text("memo"),
```

또 unique 인덱스 추가:
```ts
mailIdUniq: uniqueIndex("sales_mail_person_mail_id_uniq").on(t.workspaceId, t.mailId),
```

- [ ] **Step 3: 마이그레이션 생성 + 0건 분기**

```bash
pnpm --filter @jarvis/db db:generate
```

0건이면 단순 ADD COLUMN NOT NULL OK. 운영 데이터 있으면 마이그레이션 SQL 수동 검토 X — `pnpm db:generate`가 NULLable로 만든 후 사용자가 backfill, 그다음 SET NOT NULL을 별도 마이그레이션으로 (이건 SDD task에 추가).

- [ ] **Step 4: 적용 + drift**

```bash
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --precommit
```

- [ ] **Step 5: Zod 갱신**

`packages/shared/validation/sales-mail-person.ts`에 `mailId: z.string().email()` (또는 단순 string), `memo: z.string().nullable()` 추가.

- [ ] **Step 6: commit**

```
git add -A
git commit -m "feat(p1.5/db): add mail_id (NOT NULL, unique) + memo to sales_mail_person"
```

---

## Task 4: EditableNumericCell 신설 (P2 spec 선반입)

**Goal:** 천단위 콤마 `###,###` 표시 + numeric input + click-to-edit (P1 EditableTextCell 패턴).

**Files:**
- Create: `apps/web/components/grid/cells/EditableNumericCell.tsx`
- Create: `apps/web/components/grid/cells/EditableNumericCell.test.tsx`

- [ ] **Step 1: failing test 작성**

`apps/web/components/grid/cells/EditableNumericCell.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EditableNumericCell } from "./EditableNumericCell";

describe("EditableNumericCell", () => {
  it("displays formatted number with commas", () => {
    render(<EditableNumericCell value={1234567} onChange={vi.fn()} />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("enters edit mode on click", () => {
    render(<EditableNumericCell value={100} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("100"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits raw number on Enter", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={0} onChange={onChange} />);
    fireEvent.click(screen.getByText("0"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "5000" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it("rejects non-numeric input", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={0} onChange={onChange} />);
    fireEvent.click(screen.getByText("0"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: run test (fail)**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/cells/EditableNumericCell.test.tsx
```

Expected: fail (file not found).

- [ ] **Step 3: 구현**

`apps/web/components/grid/cells/EditableNumericCell.tsx`:
```tsx
"use client";
import { useState, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
  align?: "left" | "right" | "center";
  readOnly?: boolean;
  className?: string;
};

export function EditableNumericCell({ value, onChange, align = "right", readOnly, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value === null ? "" : String(value));

  if (editing && !readOnly) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={handleKey}
        className={cn("w-full px-2 py-1 text-[13px] ring-2 ring-blue-500 inset", className)}
      />
    );
  }

  function commit() {
    if (draft === "") {
      onChange(null);
    } else if (/^-?\d+$/.test(draft.replace(/,/g, ""))) {
      onChange(Number(draft.replace(/,/g, "")));
    }
    // invalid → no onChange call (revert silently)
    setEditing(false);
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(value === null ? "" : String(value));
      setEditing(false);
    }
  }

  return (
    <div
      onClick={() => !readOnly && setEditing(true)}
      className={cn(
        "px-2 py-1 text-[13px] cursor-pointer",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {value === null ? "" : value.toLocaleString("ko-KR")}
    </div>
  );
}
```

- [ ] **Step 4: run tests (pass)**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/cells/EditableNumericCell.test.tsx
```

Expected: 4 pass.

- [ ] **Step 5: cells/index.ts에 export 추가**

`apps/web/components/grid/cells/index.ts`(있으면)에 `EditableNumericCell` export 추가. 없으면 grid baseline 사용처에서 직접 import.

- [ ] **Step 6: commit**

```
git add apps/web/components/grid/cells/EditableNumericCell.{tsx,test.tsx}
git commit -m "feat(grid): add EditableNumericCell with thousands-separator format"
```

---

## Task 5: admin/infra/licenses 라우트 + grid

**Goal:** TBIZ500 22 모듈 boolean grid + 22 모듈 그룹 헤더(`모듈|(01)채용관리`).

**Files:**
- Create: `apps/web/app/(app)/admin/infra/licenses/page.tsx`
- Create: `apps/web/app/(app)/admin/infra/licenses/actions.ts`
- Create: `apps/web/app/(app)/admin/infra/licenses/_components/InfraLicensesGrid.tsx`
- Create: `apps/web/app/(app)/admin/infra/licenses/_components/useInfraLicensesGridState.ts`
- Create: `apps/web/app/(app)/admin/infra/licenses/_components/ModuleCheckboxGroup.tsx`
- Create: `apps/web/lib/queries/infra-license.ts`
- Test: `apps/web/e2e/admin-infra-licenses.spec.ts`

- [ ] **Step 1: server lib 쿼리**

`apps/web/lib/queries/infra-license.ts`: list/save/delete 함수. workspaceId 필터, sensitivity 미적용. 반환 shape은 `packages/shared/validation/infra-license.ts` Zod schema와 일치.

- [ ] **Step 2: actions.ts**

`requirePermission(PERMISSIONS.SYSTEM_READ)` for list, `SYSTEM_CREATE/UPDATE/DELETE` for save batch. audit_log 액션 키: `infra.license.{create,update,delete}`. 트랜잭션 묶기.

- [ ] **Step 3: useInfraLicensesGridState 훅**

P1 `useCompaniesGridState`(`apps/web/app/(app)/admin/companies/_components/`) 패턴 그대로. generic `<T extends { id: string }>`이라 타입만 InfraLicense로 교체.

- [ ] **Step 4: ModuleCheckboxGroup**

22 boolean 컬럼을 grid에 전부 노출하면 너무 가로 길어짐. 그룹 헤더 형식:
```
| 모듈 | 사용자수 | 법인수 | ... |
| (01)채용 | (02)인사 | (03)조직 | ... | (27)파견 | 100 | 5 | ... |
```
P1 grid baseline은 단일 헤더라, 그룹 헤더는 별도 컴포넌트로 grid 위에 중첩 div로 그룹 라벨 표시. (Task 단계: 스크린샷 보고 wireframe 결정 — implementer가 P1 grid를 fork 또는 baseline 확장)

대안: 22 모듈 boolean을 단일 row에 하나의 multi-checkbox cell로 표시. legacy ibSheet는 22 컬럼이지만 jarvis는 grid 가로폭 제약 — implementer가 사용자에게 확인.

본 plan은 grouped header 우선:
- baseline `apps/web/components/grid/DataGrid.tsx`에 `groupHeaders?: { label, span }[]` prop 추가 (P2도 활용 가능)
- 또는 `_components/ModuleCheckboxGroup.tsx`에 grid 외 별도 헤더 div

- [ ] **Step 5: InfraLicensesGrid orchestrator**

`apps/web/app/(app)/admin/companies/_components/CompaniesGrid.tsx` 패턴 그대로. ibSheet `licenseMgr.jsp:17~51` Hidden:0 컬럼만:
- companyNm (Popup → company lookup, EditableSelectCell)
- symd / eymd (Date)
- devGbCd (Combo, INFRA_DEV_GB code_group)
- domainAddr / ipAddr (Text)
- 22 모듈 CheckBox (EditableBooleanCell — P1에 없으면 신설)
- userCnt / corpCnt (EditableNumericCell — Task 4)
- btnFile1 (placeholder Html cell, disabled)
- companyCd Hidden

- [ ] **Step 6: page.tsx (RSC)**

```tsx
import { getInfraLicenses } from "@/lib/queries/infra-license";
import { InfraLicensesGrid } from "./_components/InfraLicensesGrid";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";

export default async function InfraLicensesPage() {
  await requirePermission(PERMISSIONS.SYSTEM_READ);
  const licenses = await getInfraLicenses({ page: 0, limit: 50 });
  return <InfraLicensesGrid initial={licenses} />;
}
```

- [ ] **Step 7: e2e smoke**

`apps/web/e2e/admin-infra-licenses.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("admin infra licenses CRUD smoke", async ({ page }) => {
  await page.goto("/admin/infra/licenses");
  await expect(page.getByRole("heading", { name: /인프라 라이센스/i })).toBeVisible();
  // ... add row / save / verify reload
});
```

- [ ] **Step 8: 검증 게이트**

```bash
pnpm --filter @jarvis/web type-check && \
pnpm --filter @jarvis/web lint && \
pnpm --filter @jarvis/web exec vitest run && \
pnpm audit:rsc
```

- [ ] **Step 9: commit**

```
git add -A
git commit -m "feat(p1.5/admin): add infra license route + grid (TBIZ500 22 modules)"
```

---

## Task 6: sales/product-cost-mapping 라우트 + grid

**Goal:** sales_product_type_cost mapping row grid (Task 2 schema 의존).

**Files:**
- Create: `apps/web/app/(app)/sales/product-cost-mapping/{page.tsx, actions.ts, _components/}`
- Create: `apps/web/lib/queries/sales-product-type-cost.ts`
- Test: `apps/web/e2e/sales-product-cost-mapping.spec.ts`

- [ ] **Step 1**: queries — list/save/delete with workspaceId filter
- [ ] **Step 2**: actions — `requirePermission(SALES_ALL)`, audit `sales.product_type_cost.*`
- [ ] **Step 3**: grid orchestrator — productTypeNm (lookup from sales_product_type) + costNm (lookup from sales_cost_master) + sdate + edate + bizYn (EditableBooleanCell) + note + insdate
- [ ] **Step 4**: page.tsx RSC + e2e
- [ ] **Step 5**: 검증 게이트
- [ ] **Step 6**: commit

```
git commit -m "feat(p1.5/sales): add product-cost-mapping route + grid (TBIZ024 row mapping)"
```

---

## Task 7: sales/product-types grid 정리 (cost_mapping_json 제거)

**Goal:** Task 2 schema 변경에 맞춰 grid·actions에서 cost_mapping_json 사용처 제거.

**Files:**
- Modify: `apps/web/app/(app)/sales/product-types/_components/*Grid.tsx`
- Modify: `apps/web/app/(app)/sales/product-types/actions.ts`

- [ ] **Step 1**: grid columns 정의에서 costMappingJson 컬럼 제거 (legacy ibSheet `productTypeMgr.jsp:37~47`엔 master 컬럼만 — productCd, productNm)
- [ ] **Step 2**: insdate 컬럼 추가 (EditableDateCell, read-only)
- [ ] **Step 3**: actions에서 costMappingJson save/load 처리 제거. 매핑은 별도 라우트(Task 6)이므로 master CRUD만.
- [ ] **Step 4**: type-check + lint + 기존 e2e 통과 확인 (e2e가 cost_mapping을 검증하면 splitting)
- [ ] **Step 5**: commit

```
git commit -m "refactor(p1.5/sales): remove cost_mapping_json from product-types grid + actions"
```

---

## Task 8: sales/mail-persons grid columns 갱신

**Files:**
- Modify: `apps/web/app/(app)/sales/mail-persons/_components/*Grid.tsx`
- Modify: `apps/web/app/(app)/sales/mail-persons/actions.ts`
- Modify: `apps/web/e2e/sales-mail-persons.spec.ts` (새로 또는 기존 갱신)

- [ ] **Step 1**: grid columns에 `mailId` (EditableTextCell) + `memo` (EditableTextCell) + `insdate` 추가
- [ ] **Step 2**: PK 컬럼 `sabun` Hidden 정책 적용 (legacy ibSheet `bizMailPersonMgr.jsp:26~35` 일관)
- [ ] **Step 3**: actions에서 mailId/memo save 처리 + Zod validation
- [ ] **Step 4**: e2e — mailId 입력 + unique constraint 위반 케이스
- [ ] **Step 5**: 검증 게이트 + commit

```
git commit -m "feat(p1.5/sales): add mail_id/memo to mail-persons grid + Hidden policy"
```

---

## Task 9: 4 sales grid Hidden 정책 일괄 (customers + customer-contacts + product-types + mail-persons)

**Goal:** legacy ibSheet `Hidden:0` 컬럼만 default visible. PK · 미사용 컬럼 grid에서 제거.

**Files:**
- Modify: `apps/web/app/(app)/sales/customers/_components/*Grid.tsx`
- Modify: `apps/web/app/(app)/sales/customer-contacts/_components/*Grid.tsx`
- (product-types: Task 7에 포함 / mail-persons: Task 8에 포함 — 본 task은 customers + customer-contacts만)

- [ ] **Step 1: customers grid columns 정리**

`bizActCustCompanyMgr.jsp:221~233` Hidden:0 컬럼만:
- custNm (Text 200, 이미 노출됨)
- custKindCd (Combo, SALES_CUST_KIND)
- custDivCd (Combo, SALES_CUST_DIV)
- ceoNm (Text)
- telNo (Text)
- insdate (Date, 추가)

P1 노출 중인 `custCd / businessNo / businessKind / homepage / addr1` 5개 → grid에서 제거 (DB 컬럼은 보존, grid columns 배열에서만 빼기).

- [ ] **Step 2: customer-contacts grid columns 정리**

`bizActCustomerMgr.jsp:207~220` Hidden:0:
- custNm (추가 — P1 누락)
- custName (담당자명)
- jikweeNm (직위)
- orgNm (소속)
- telNo / hpNo / email
- insdate

PK `custMcd` Hidden, P1에서 노출했던 `statusYn / sabun` grid에서 제거.

- [ ] **Step 3: 검증 게이트 + 기존 e2e (sales-customers.spec.ts, P1 산출물) 갱신**

기존 e2e가 P1 컬럼 셋을 검증하면 새 셋으로 갱신.

```bash
pnpm --filter @jarvis/web exec playwright test sales-customers.spec.ts
```

- [ ] **Step 4: commit**

```
git commit -m "refactor(p1.5/sales): align customers + customer-contacts grids with legacy ibSheet Hidden policy"
```

---

## Task 10: menu_item seed + i18n 갱신

**Files:**
- Modify: `packages/db/seed/menus.ts`
- Modify: `packages/db/seed/sales-codes.ts`
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: menus.ts 갱신**

제거: `sales/licenses` 항목.
추가:
- `admin/infra` 그룹 (없으면 신설) + 자식 `admin/infra/licenses` ("인프라 라이센스")
- `sales/product-cost-mapping` ("제품-코스트 매핑") — sales 그룹 자식

- [ ] **Step 2: sales-codes.ts에 INFRA_DEV_GB code_group 추가**

```ts
{
  code: "INFRA_DEV_GB",
  name: "환경구분",
  items: [
    { code: "01", name: "개발" },
    { code: "02", name: "스테이징" },
    { code: "03", name: "운영" },
  ],
},
```

(SALES_* prefix가 아닌 INFRA_* prefix — admin/infra 도메인용)

- [ ] **Step 3: seed 재실행**

```bash
pnpm --filter @jarvis/db db:seed
```

- [ ] **Step 4: ko.json 갱신**

- 제거: `Sales.Licenses.*` 네임스페이스 전체
- 추가: `Admin.Infra.Licenses.*` (title, description, columns.*, modules.* 22개 라벨, status.*)
- 추가: `Sales.ProductCostMapping.*` (title, description, columns.*)
- 변경: `Sales.MailPersons.columns.{mailId, memo}` 추가, 4 grid columns에 `insdate`("등록일자")
- `Nav.admin.infra.licenses`, `Nav.sales.productCostMapping` 같은 메뉴 라벨

`jarvis-i18n` 스킬의 경계면 검증 — 새 키들이 컴포넌트 t() 호출과 1:1 일치하는지 확인.

- [ ] **Step 5: type-check + 개발 서버 smoke**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web dev   # 별도 터미널, 메뉴 트리 확인 + 라우트 접속
```

- [ ] **Step 6: commit**

```
git commit -m "feat(p1.5): update menu seed + ko.json (drop sales/licenses, add admin/infra/licenses + sales/product-cost-mapping)"
```

---

## Task 11: 검증 게이트 전체 + e2e 통과

**Goal:** 모든 게이트 통과 + 기존 회귀 없음 확인.

- [ ] **Step 1: 전체 type-check + lint**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
```

- [ ] **Step 2: unit test**

```bash
pnpm test
```

- [ ] **Step 3: schema-drift**

```bash
node scripts/check-schema-drift.mjs --precommit
```

- [ ] **Step 4: audit:rsc**

```bash
pnpm audit:rsc
```

- [ ] **Step 5: e2e 전체**

```bash
pnpm --filter @jarvis/web exec playwright test
```

특히 다음 e2e가 통과해야:
- `admin-companies.spec.ts` (P1 baseline, 회귀 없음 확인)
- `admin-infra-licenses.spec.ts` (Task 5 신규)
- `sales-customers.spec.ts` (Task 9 갱신)
- `sales-customer-contacts.spec.ts` (있으면, Task 9 갱신)
- `sales-product-cost-mapping.spec.ts` (Task 6 신규)
- `sales-mail-persons.spec.ts` (Task 8 신규/갱신)

- [ ] **Step 6: 실패 시 root-cause fix**

`superpowers:systematic-debugging` 스킬 따라 우회 금지, 근본 원인.

- [ ] **Step 7: 모든 게이트 통과 후 PR 직전 마무리 commit**

(보통 별도 commit 없음 — 이전 task에서 이미 commit. 게이트 결과 file로 출력하지 않음.)

---

## Operational Data Migration (ETL) Preparation

**Context:** 영업관리 모듈 전체(P1 + P1.5 + P2 + P3+) 완료 후 운영 PostgreSQL에 레거시 Oracle 데이터를 import한다. **개발 중에는 로컬 PG에 placeholder/sample 데이터**를 넣고 동작 검증, **운영 데이터(Oracle dump 23만 행)는 git push 절대 X**, 운영 서버에서만 별도 실행.

### 데이터 분리 정책

| 종류 | 위치 | git tracked? | 용도 |
|---|---|---|---|
| **Schema 변경** (Drizzle 마이그레이션) | `packages/db/drizzle/*.sql` | ✅ tracked | DDL — 로컬·운영 동일 적용 |
| **개발 시드 (placeholder)** | `packages/db/seed/sales-*.ts`, `packages/db/seed/companies-tsmt001.ts` 등 | ✅ tracked | `pnpm db:seed` 로컬 개발용 |
| **ETL 코드** (스크립트 자체) | `scripts/etl/sales/*.ts` | ✅ tracked | 재현성·리뷰 — 운영 서버 실행 시 동일 코드 사용 |
| **ETL 데이터** (Oracle dump, 운영 INSERT 데이터) | `.local/etl/sales/` | ❌ **.gitignored** (`.local/*` 정책 자동 적용) | 운영 데이터 본체 — 운영 서버에 SCP/별도 전송 |
| **운영 credentials** | `.env.production` 또는 SSM/Vault | ❌ never git | DATABASE_URL_PROD 등 |

### ETL 스크립트 구조 (P7 시점에 본격 작성, P1.5에선 placeholder 디렉토리만)

```
scripts/etl/sales/                      ← git tracked (코드)
├─ README.md                            # 실행 절차 (로컬 / 운영)
├─ extract-from-oracle-dump.ts          # .local/영업관리모듈/02_data_isu_st.sql 파싱
├─ transform/
│  ├─ tbiz100-to-sales-customer.ts     # legacy CUST_CD → uuid id 매핑
│  ├─ tbiz105-to-sales-customer-contact.ts
│  ├─ tbiz110-to-sales-opportunity.ts   # P2 도메인
│  ├─ tbiz115-to-sales-activity.ts
│  ├─ tbiz500-to-infra-license.ts       # P1.5
│  └─ tbiz024-to-sales-product-type-cost.ts
├─ load.ts                              # Drizzle insert + 트랜잭션 + audit_log
└─ verify.ts                            # row count 일치 + FK 무결성

.local/etl/sales/                       ← .gitignored (데이터)
├─ extracted/                           # extract 단계 산출물 (JSON/CSV)
├─ transformed/                         # transform 단계 산출물
└─ logs/                                # ETL 실행 로그
```

### 실행 절차

#### 로컬 개발 (P1.5 SDD 시점)
```bash
# 1. 스키마 마이그레이션
pnpm --filter @jarvis/db db:migrate

# 2. 코드/메뉴 시드 (placeholder)
pnpm --filter @jarvis/db db:seed

# 3. 개발용 sample 데이터 (선택, P1.5엔 0건 가정이라 skip 가능)
#    - 필요 시 .local/etl/sales/sample.sql을 psql로 직접 import
psql "$DATABASE_URL" -f .local/etl/sales/sample.sql
```

#### 운영 서버 (P7 본격 ETL 시점)
```bash
# 운영 서버에 동기화: 코드는 git pull, 데이터는 SCP
scp .local/영업관리모듈/02_data_isu_st.sql user@prod:/tmp/etl-source/

# 1. 운영 schema 마이그레이션 (사전 backup 후)
DATABASE_URL=$DATABASE_URL_PROD pnpm --filter @jarvis/db db:migrate

# 2. ETL 실행 (스크립트는 코드, 데이터는 운영 서버 로컬)
DATABASE_URL=$DATABASE_URL_PROD ETL_SOURCE_DIR=/tmp/etl-source \
  pnpm tsx scripts/etl/sales/load.ts --domain=customers --dry-run
DATABASE_URL=$DATABASE_URL_PROD ETL_SOURCE_DIR=/tmp/etl-source \
  pnpm tsx scripts/etl/sales/load.ts --domain=customers   # 실제 적용

# 3. 검증
DATABASE_URL=$DATABASE_URL_PROD pnpm tsx scripts/etl/sales/verify.ts
```

### P1.5 시점 ETL 영향

P1.5는 **schema drop/refactor**를 동반하므로 운영 서버 적용 시 주의:

| Task | 운영 서버 영향 | 대응 |
|---|---|---|
| Task 1 (sales_license drop) | 운영 데이터 0건 가정 — non-zero면 사용자 backup 후 진행 | `psql -c "\COPY (SELECT * FROM sales_license) TO 'sales_license_backup.csv' CSV"` 사전 |
| Task 2 (sales_product_type cost_mapping_json drop) | 0건 가정 — non-zero면 jsonb→row unpack 마이그레이션 추가 task 필요 | 별도 ETL 스크립트 `scripts/etl/sales/migrate-cost-mapping-json.ts` 작성, sales_product_type_cost로 row unpack |
| Task 3 (mail-person ADD COLUMN NOT NULL) | 운영 데이터 있으면 default `''` 후 NOT NULL 변환 (마이그레이션 두 단계) | Drizzle 자동 — `pnpm db:generate` 후 SQL 검토 |

### Plan 추가 task — P1.5엔 N/A, P7 ETL 시점에 별도 plan

본 P1.5 plan에는 **ETL 디렉토리 placeholder 생성만** 포함 (실제 스크립트는 P7 별도 plan):

- [ ] **(선택) Step: ETL 디렉토리 구조 생성**

```bash
mkdir -p scripts/etl/sales/transform
mkdir -p .local/etl/sales/{extracted,transformed,logs}
echo "# Sales ETL\n\nP7 시점에 본격 작성. 본 디렉토리는 placeholder." > scripts/etl/sales/README.md
echo "" > scripts/etl/sales/.gitkeep
```

`.local/etl/`는 `.local/*` 정책으로 자동 ignored. `scripts/etl/sales/`는 git tracked이지만 P1.5엔 README.md + .gitkeep만.

**결정 사항 (사용자 후속 확인)**:
- `scripts/etl/sales/`을 git tracked 유지(코드 share·재현성)? 또는 `.local/etl/sales/`에 코드까지 두고 운영 서버에 SCP만(보안 우선, 코드 share 포기)?
- 본 plan은 **전자 (코드 git, 데이터 .gitignored)** 권장 — P1.5엔 placeholder만, P7 plan에서 본격 결정.

---

## Self-Review (작성 후 작가가 수행)

### Spec coverage
| Spec § | 매핑 task |
|---|---|
| §4.1 sales_license drop | Task 1 ✓ |
| §4.2 infra_license 신규 | Task 5 (schema는 별도 task로 분리 추천 — Task 5 step 0에 schema create 포함하거나 새 Task 5a 추가). **gap 발견 → Task 5 Step 0에 schema create 명시 필요**. |
| §4.3 sales_product_type 정규화 | Task 2 ✓ |
| §4.4 sales_mail_person 컬럼 | Task 3 ✓ |
| §5.1 sales/licenses 라우트 drop | Task 1 step 6 ✓ |
| §5.2 admin/infra/licenses 라우트 | Task 5 ✓ |
| §5.3 sales/product-cost-mapping | Task 6 ✓ |
| §5.4 4 sales grid Hidden | Task 9 (customers + contacts) + Task 7 (product-types) + Task 8 (mail-persons) ✓ |
| §5.5 menu seed | Task 10 ✓ |
| §6 server actions | Task 5/6/7/8 안에 분산 ✓ |
| §7 audit | Task 5/6 안에 액션 키 명시 ✓ |
| §8 i18n | Task 10 ✓ |
| §9 tests | Task 4/5/6/8/11 ✓ |

**Gap 1 fix**: Task 5에 infra_license schema 신설 step 추가 필요. → 본 plan에 inline 추가 (아래 부록).

### Placeholder scan
- "TBD"/"TODO": 없음
- "implement later": 없음
- 코드 chunk: 핵심 코드는 본문에 포함, 일부 (queries, actions 세부)는 spec 참조로 간략화 — 이건 SDD implementer가 채움. **plan은 상위 프레임 + 검증 명령**으로 의도적 압축.

### Type consistency
- `sales_product_type_cost` PK = (ws, productTypeId, costId, sdate) — Task 2 schema와 Task 6 grid 일관 ✓
- `infra_license.devGbCode` ↔ INFRA_DEV_GB code_group — Task 5/10 일관 ✓
- `EditableNumericCell` props — Task 4 정의 / Task 5 사용 일관 ✓

---

## 부록 — Task 5 보강

Task 5 step 0 (실행 순서 가장 먼저) 추가:

- [ ] **Step 0: infra_license schema 신설 + 마이그레이션**

`packages/db/schema/infra-license.ts` 신규(spec §4.2 컬럼 모두 포함). `packages/db/schema/index.ts`에 export 추가.

```bash
pnpm --filter @jarvis/db db:generate
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --precommit
```

이후 step 1~9은 위 Task 5 본문 그대로.

---

## Execution Handoff

**Plan complete.** 본 세션은 plan + handoff까지로 결정 (사용자 우선 P2 본격 진행). 다음 세션에서:

**REQUIRED SUB-SKILL**: `superpowers:subagent-driven-development` — implementer → spec-reviewer → code-quality-reviewer 루프. spec-reviewer에 컨텍스트 주입:
- `jarvis-db-patterns` §9 경계면 교차 비교 체크리스트
- `jarvis-i18n` 경계면 검증
- 메모리 `feedback_legacy_ibsheet_hidden_policy.md` (ibSheet ground truth)

대안: `superpowers:executing-plans` 인라인 실행.

다음 세션 진입 시 본 plan 정독 + spec 정독 + 메모리 인덱스 확인.
