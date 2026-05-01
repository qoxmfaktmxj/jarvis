# Sales Mgmt P2 — Detail Sidebar 4-Tabs + Master-Detail Edit (Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sales/customers + sales/customer-contacts에 (1) Mgr 그리드 카운트 칩 컬럼 + 의견(메모) 모달 backend (PR-1), (2) `[id]/edit` master-detail 페이지 + 우측 4탭 사이드바 (PR-4)를 추가한다.

**Architecture:** 19 task 분할 — Task 1~10이 PR-1 (backend + 카운트 칩), Task 11~19가 PR-4 (edit 페이지 + sidebar). 파일 변경 순서는 `jarvis-architecture` §파일 변경 순서 20단계를 따름: 스키마(1) → 마이그레이션(2) → Zod(3) → server lib(4) → server actions(5) → UI 컴포넌트(6~7) → i18n(8) → 테스트(9) → 검증·commit(10) → PR-4 동상.

**Tech Stack:** Next.js 15 App Router + React 19 / Drizzle ORM / PostgreSQL 16 / Vitest + Playwright / next-intl

**Spec:** [`docs/superpowers/specs/2026-05-01-sales-mgmt-p2-tabs-edit-design.md`](../specs/2026-05-01-sales-mgmt-p2-tabs-edit-design.md)

**Worktree:** `.claude/worktrees/angry-ishizaka-2c55af` · branch `claude/angry-ishizaka-2c55af` (base = main with P1.5 already rebased)

**Dependency:**
- **P1.5** (eager-ritchie-9f4a82) — ✅ 머지됨 (main HEAD 9161fc4 시점). sales/customers + customer-contacts 그리드 Hidden 정책 적용. `CustomerRow.createdAt`, `CustomerContactRow.custNm`/`createdAt` 필드 추가됨. 본 plan은 그 위에서 작업.
- **P2** (bold-noether-742a91) — ⏳ 대기 중. `sales_opportunity` + `sales_activity` 스키마 + grid + memo modal. **본 plan의 Task 4·5·6·12에 P2-BLOCKED 마커**. P2 머지 후 SDD 진입.

---

## File Structure

### Created (PR-1)

| 경로 | 책임 |
|---|---|
| `packages/db/schema/sales-customer.ts` (수정) | `salesCustomerContactMemo` 테이블 export 추가 (기존 파일에 append) |
| `packages/db/drizzle/NNNN_sales_customer_contact_memo.sql` | 자동 생성 |
| `packages/shared/validation/sales/customer-memo.ts` | Zod schema (이미 존재 X — 신설) |
| `packages/shared/validation/sales/customer-contact-memo.ts` | Zod schema 신설 |
| `apps/web/lib/queries/sales-tabs.ts` | count 헬퍼 + 메모 트리 빌더 |
| `apps/web/lib/queries/sales-tabs.test.ts` | unit tests |
| `apps/web/app/(app)/sales/customers/_components/MemoModal.tsx` | 의견 모달 (customer 도메인) |
| `apps/web/app/(app)/sales/customers/_components/CountChipsCell.tsx` | 카운트 칩 cell render (도메인 wrapper inline OK) |
| `apps/web/app/(app)/sales/customer-contacts/_components/MemoModal.tsx` | 의견 모달 (contact 도메인) |
| `apps/web/app/(app)/sales/customer-contacts/_components/CountChipsCell.tsx` | 동상 |
| `apps/web/e2e/sales-customers-tabs.spec.ts` | e2e |
| `apps/web/e2e/sales-customer-contacts-tabs.spec.ts` | e2e |

### Modified (PR-1)

| 경로 | 변경 |
|---|---|
| `apps/web/app/(app)/sales/customers/actions.ts` | 4 server action 추가 + `listCustomers` 출력 shape에 counts 추가 |
| `apps/web/app/(app)/sales/customer-contacts/actions.ts` | 4 server action 추가 + `listCustomerContacts` 출력 shape에 counts 추가 |
| `packages/shared/validation/sales/customer.ts` | `CustomerRow`에 `counts` 필드 추가 |
| `packages/shared/validation/sales/customer-contact.ts` | `CustomerContactRow`에 `counts` 필드 추가 |
| `apps/web/app/(app)/sales/customers/_components/CustomersGridContainer.tsx` | 카운트 칩 컬럼 추가 + MemoModal state |
| `apps/web/app/(app)/sales/customer-contacts/_components/CustomerContactsGridContainer.tsx` | 동상 |
| `apps/web/messages/ko.json` | `Sales.Customers.Tabs.*` + `Sales.Customers.Memo.*` + `Sales.CustomerContacts.Tabs.*` + `Sales.CustomerContacts.Memo.*` |

### Created (PR-4)

| 경로 | 책임 |
|---|---|
| `apps/web/app/(app)/sales/customers/[id]/edit/page.tsx` | RSC 라우트 (customer detail) |
| `apps/web/app/(app)/sales/customers/[id]/edit/_components/CustomerEditForm.tsx` | client island 폼 |
| `apps/web/app/(app)/sales/customers/_components/CustomerDetailSidebar.tsx` | 우측 4탭 사이드바 |
| `apps/web/app/(app)/sales/customer-contacts/[id]/edit/page.tsx` | RSC 라우트 (contact detail) |
| `apps/web/app/(app)/sales/customer-contacts/[id]/edit/_components/ContactEditForm.tsx` | client island 폼 |
| `apps/web/app/(app)/sales/customer-contacts/_components/ContactDetailSidebar.tsx` | 우측 4탭 사이드바 |
| `apps/web/e2e/sales-customers-edit.spec.ts` | e2e |
| `apps/web/e2e/sales-customer-contacts-edit.spec.ts` | e2e |

### Modified (PR-4)

| 경로 | 변경 |
|---|---|
| `apps/web/components/grid/DataGrid.tsx` | **baseline 1줄 patch**: optional `onRowDoubleClick?: (row: T) => void` prop 추가 (non-breaking, 기존 사용처 영향 0) |
| `apps/web/components/grid/types.ts` (선택) | `DataGridProps` 타입 export 시 prop 추가 |
| `apps/web/app/(app)/sales/customers/actions.ts` | `getCustomer({ id })` 추가 |
| `apps/web/app/(app)/sales/customer-contacts/actions.ts` | `getContact({ id })` 추가 |
| `apps/web/app/(app)/sales/customers/_components/CustomersGridContainer.tsx` | `onRowDoubleClick` prop 전달 → `router.push(/sales/customers/${row.id}/edit)` |
| `apps/web/app/(app)/sales/customer-contacts/_components/CustomerContactsGridContainer.tsx` | 동상 |
| `apps/web/messages/ko.json` | `Sales.Customers.Edit.*` + `Sales.CustomerContacts.Edit.*` |
| **P2 server actions** (`sales/opportunities/actions.ts`, `sales/activities/actions.ts`) | **[P2-BLOCKED]** `customerId?: uuid` + `contactId?: uuid` optional 필터 추가 — P2 머지 후만 |

---

## Task 1 (PR-1): `sales_customer_contact_memo` schema + 마이그레이션

**Files:**
- Modify: `packages/db/schema/sales-customer.ts` (append 1 export)
- Modify: `packages/db/schema/index.ts` (이미 sales-customer.ts export 중이라 자동)
- Generated: `packages/db/drizzle/NNNN_*.sql`

- [ ] **Step 1: 운영 데이터 0건 가정 (신규 테이블이라 항상 OK)**

신설이므로 backup 불필요.

- [ ] **Step 2: schema append**

`packages/db/schema/sales-customer.ts` 파일 끝(line 152 이후)에 추가:

```ts
export const salesCustomerContactMemo = pgTable(
  "sales_customer_contact_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    wsContactIdx: index("sales_customer_contact_memo_ws_contact_idx").on(t.workspaceId, t.contactId),
    seqUniq: uniqueIndex("sales_customer_contact_memo_seq_uniq").on(t.workspaceId, t.contactId, t.comtSeq),
  }),
);
```

- [ ] **Step 3: 마이그레이션 생성**

```bash
cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/angry-ishizaka-2c55af
git rev-parse --abbrev-ref HEAD
pnpm --filter @jarvis/db db:generate
```

Expected: `packages/db/drizzle/NNNN_*.sql` 생성. `CREATE TABLE "sales_customer_contact_memo"` + 2 인덱스 포함.

- [ ] **Step 4: 적용 + drift**

```bash
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --precommit
```

Expected: drift exit 0.

- [ ] **Step 5: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 6: commit**

```bash
git add packages/db/schema/sales-customer.ts packages/db/drizzle/
git commit -m "feat(p2/db): add sales_customer_contact_memo (2-level reply tree)"
```

---

## Task 2 (PR-1): Zod validation + `CustomerRow`/`CustomerContactRow`에 counts 필드

**Files:**
- Create: `packages/shared/validation/sales/customer-memo.ts`
- Create: `packages/shared/validation/sales/customer-contact-memo.ts`
- Modify: `packages/shared/validation/sales/customer.ts`
- Modify: `packages/shared/validation/sales/customer-contact.ts`

- [ ] **Step 1: customer-memo.ts 신설**

```ts
import { z } from "zod";

// 메모 트리 노드 (server에서 build 후 client에 그대로 전달)
export const memoTreeNodeSchema: z.ZodType<MemoTreeNode> = z.lazy(() =>
  z.object({
    comtSeq: z.number().int(),
    memo: z.string(),
    authorName: z.string().nullable(),
    insdate: z.string(),
    isOwn: z.boolean(),
    replies: z.array(memoTreeNodeSchema),
  }),
);

export type MemoTreeNode = {
  comtSeq: number;
  memo: string;
  authorName: string | null;
  insdate: string;
  isOwn: boolean;
  replies: MemoTreeNode[];
};

// 입출력
export const customerMemoListInput = z.object({ customerId: z.string().uuid() });
export const customerMemoListOutput = z.object({
  rows: z.array(memoTreeNodeSchema),
});

export const customerMemoCreateInput = z.object({
  customerId: z.string().uuid(),
  priorComtSeq: z.number().int().min(0),  // 0 = 마스터 의견, >0 = reply
  memo: z.string().min(1).max(4000),
});
export const customerMemoCreateOutput = z.object({
  ok: z.boolean(),
  comtSeq: z.number().int().nullable(),
});

export const customerMemoDeleteInput = z.object({
  customerId: z.string().uuid(),
  comtSeq: z.number().int(),
});
export const customerMemoDeleteOutput = z.object({ ok: z.boolean() });

// 카운트
export const customerTabCountsInput = z.object({ customerId: z.string().uuid() });
export const customerTabCountsOutput = z.object({
  customerCnt: z.number().int(),
  opCnt: z.number().int(),
  actCnt: z.number().int(),
  comtCnt: z.number().int(),
});
```

- [ ] **Step 2: customer-contact-memo.ts 신설**

상기 파일 1:1 미러, `customerId` → `contactId`, `customerCnt` → `custCompanyCnt`:

```ts
import { z } from "zod";
import type { MemoTreeNode } from "./customer-memo.js";
export type { MemoTreeNode };

export const memoTreeNodeSchema: z.ZodType<MemoTreeNode> = z.lazy(() =>
  z.object({
    comtSeq: z.number().int(),
    memo: z.string(),
    authorName: z.string().nullable(),
    insdate: z.string(),
    isOwn: z.boolean(),
    replies: z.array(memoTreeNodeSchema),
  }),
);

export const contactMemoListInput = z.object({ contactId: z.string().uuid() });
export const contactMemoListOutput = z.object({ rows: z.array(memoTreeNodeSchema) });

export const contactMemoCreateInput = z.object({
  contactId: z.string().uuid(),
  priorComtSeq: z.number().int().min(0),
  memo: z.string().min(1).max(4000),
});
export const contactMemoCreateOutput = z.object({
  ok: z.boolean(),
  comtSeq: z.number().int().nullable(),
});

export const contactMemoDeleteInput = z.object({
  contactId: z.string().uuid(),
  comtSeq: z.number().int(),
});
export const contactMemoDeleteOutput = z.object({ ok: z.boolean() });

export const contactTabCountsInput = z.object({ contactId: z.string().uuid() });
export const contactTabCountsOutput = z.object({
  custCompanyCnt: z.number().int(),
  opCnt: z.number().int(),
  actCnt: z.number().int(),
  comtCnt: z.number().int(),
});
```

- [ ] **Step 3: `customer.ts` Zod schema에 counts 추가**

`packages/shared/validation/sales/customer.ts`의 `customerRowSchema` 또는 `listCustomersOutput.rows`에 다음 필드 추가:

```ts
counts: z.object({
  customer: z.number().int(),  // contact 인원수
  op: z.number().int(),
  act: z.number().int(),
  comt: z.number().int(),
}).nullable(),  // P2 미머지 시 op/act는 0 (BLOCKED 상태에서도 type 안전)
```

P2-BLOCKED 처리: `op`/`act` 필드는 P2 머지 전엔 항상 0. plan Task 4 step 1 참조.

- [ ] **Step 4: `customer-contact.ts` 동상**

`packages/shared/validation/sales/customer-contact.ts`의 row schema에:

```ts
counts: z.object({
  custCompany: z.number().int(),  // 0 또는 1
  op: z.number().int(),
  act: z.number().int(),
  comt: z.number().int(),
}).nullable(),
```

- [ ] **Step 5: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 6: commit**

```bash
git add packages/shared/validation/sales/
git commit -m "feat(p2/validation): add customer/contact memo + tab counts Zod schemas"
```

---

## Task 3 (PR-1): server lib `sales-tabs.ts` (메모 트리 빌더 only)

**Goal:** 메모 트리 빌더만 먼저 구현 (Task 4의 count 헬퍼는 P2 의존이라 다음 task로 분리).

**Files:**
- Create: `apps/web/lib/queries/sales-tabs.ts`

- [ ] **Step 1: failing test 작성**

`apps/web/lib/queries/sales-tabs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildMemoTree } from "./sales-tabs";

describe("buildMemoTree", () => {
  const flatRows = [
    { comtSeq: 1, priorComtSeq: 0, memo: "first master",  authorName: "alice", insdate: "2026-05-01 10:00", createdBy: "u1" },
    { comtSeq: 2, priorComtSeq: 1, memo: "reply to 1",    authorName: "bob",   insdate: "2026-05-01 10:05", createdBy: "u2" },
    { comtSeq: 3, priorComtSeq: 0, memo: "second master", authorName: "alice", insdate: "2026-05-01 11:00", createdBy: "u1" },
    { comtSeq: 4, priorComtSeq: 1, memo: "another reply", authorName: "alice", insdate: "2026-05-01 11:30", createdBy: "u1" },
  ];

  it("groups masters at top level (priorComtSeq=0)", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree).toHaveLength(2);
    expect(tree[0].comtSeq).toBe(1);
    expect(tree[1].comtSeq).toBe(3);
  });

  it("attaches replies under their master", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree[0].replies).toHaveLength(2);
    expect(tree[0].replies[0].comtSeq).toBe(2);
    expect(tree[0].replies[1].comtSeq).toBe(4);
    expect(tree[1].replies).toHaveLength(0);
  });

  it("flags isOwn correctly per row based on session userId", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree[0].isOwn).toBe(true);  // alice (u1)
    expect(tree[0].replies[0].isOwn).toBe(false);  // bob (u2)
    expect(tree[0].replies[1].isOwn).toBe(true);   // alice (u1)
    expect(tree[1].isOwn).toBe(true);
  });

  it("orphan reply (priorComtSeq points to non-existent master) is silently dropped", () => {
    const orphan = [
      { comtSeq: 1, priorComtSeq: 99, memo: "orphan", authorName: "x", insdate: "2026-05-01", createdBy: "u9" },
    ];
    expect(buildMemoTree(orphan, "u1")).toEqual([]);
  });
});
```

- [ ] **Step 2: run test (fail)**

```bash
pnpm --filter @jarvis/web exec vitest run lib/queries/sales-tabs.test.ts
```

Expected: fail (file not found).

- [ ] **Step 3: 구현 — buildMemoTree만**

`apps/web/lib/queries/sales-tabs.ts`:

```ts
import "server-only";
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-memo";

export type FlatMemoRow = {
  comtSeq: number;
  priorComtSeq: number | null;
  memo: string;
  authorName: string | null;
  insdate: string;
  createdBy: string | null;
};

/**
 * 메모 flat list → 2-level tree.
 * 마스터 의견(priorComtSeq=0 또는 null)은 top-level, reply(priorComtSeq>0)는 해당 master.replies에.
 * orphan reply(부모 master 없음)는 silently 드롭.
 * isOwn = (createdBy === sessionUserId).
 */
export function buildMemoTree(rows: FlatMemoRow[], sessionUserId: string | null): MemoTreeNode[] {
  const masters = new Map<number, MemoTreeNode>();
  const masterOrder: number[] = [];
  const replies: FlatMemoRow[] = [];

  for (const r of rows) {
    if (!r.priorComtSeq || r.priorComtSeq === 0) {
      masters.set(r.comtSeq, {
        comtSeq: r.comtSeq,
        memo: r.memo,
        authorName: r.authorName,
        insdate: r.insdate,
        isOwn: r.createdBy != null && r.createdBy === sessionUserId,
        replies: [],
      });
      masterOrder.push(r.comtSeq);
    } else {
      replies.push(r);
    }
  }
  for (const r of replies) {
    const parent = masters.get(r.priorComtSeq!);
    if (!parent) continue;  // orphan
    parent.replies.push({
      comtSeq: r.comtSeq,
      memo: r.memo,
      authorName: r.authorName,
      insdate: r.insdate,
      isOwn: r.createdBy != null && r.createdBy === sessionUserId,
      replies: [],
    });
  }
  return masterOrder.map((seq) => masters.get(seq)!).filter(Boolean);
}
```

- [ ] **Step 4: run tests (pass)**

```bash
pnpm --filter @jarvis/web exec vitest run lib/queries/sales-tabs.test.ts
```

Expected: 4 pass.

- [ ] **Step 5: commit**

```bash
git add apps/web/lib/queries/sales-tabs.{ts,test.ts}
git commit -m "feat(p2/lib): add buildMemoTree (flat → 2-level tree, orphan-safe, isOwn flag)"
```

---

## Task 4 (PR-1): server lib `sales-tabs.ts` count 헬퍼 [P2-BLOCKED]

**Goal:** 4 카운트 함수 추가. **`opCnt` / `actCnt` SQL은 P2 머지 후만 컴파일 가능.** P2 미머지 시 임시로 `0` 리턴 + TODO 마커.

**Files:**
- Modify: `apps/web/lib/queries/sales-tabs.ts`

- [ ] **Step 1: failing test 추가 (P2-BLOCKED 시 op/act = 0)**

`apps/web/lib/queries/sales-tabs.test.ts`에 추가:

```ts
import { getCustomerTabCounts, getContactTabCounts } from "./sales-tabs";
// ... (DB mock 또는 in-memory PG로 — 본 plan은 fixture 패턴은 implementer 결정)

describe("getCustomerTabCounts", () => {
  it("returns customerCnt + comtCnt (op/act stay 0 until P2 schema merged)", async () => {
    // fixture: customer X with 3 contacts + 5 memos in DB
    const counts = await getCustomerTabCounts("workspace1", "customer-X");
    expect(counts.customerCnt).toBe(3);
    expect(counts.comtCnt).toBe(5);
    expect(counts.opCnt).toBe(0);  // P2-BLOCKED, returns 0
    expect(counts.actCnt).toBe(0);
  });
});
```

- [ ] **Step 2: 구현 — count 4개 (op/act는 P2-BLOCKED 시 0)**

`apps/web/lib/queries/sales-tabs.ts`에 추가:

```ts
import { db } from "@jarvis/db/client";
import { salesCustomerContact, salesCustomerMemo, salesCustomerContactMemo } from "@jarvis/db/schema";
// P2 머지 후 활성화: import { salesOpportunity, salesActivity } from "@jarvis/db/schema";
import { and, count, eq } from "drizzle-orm";

export async function getCustomerTabCounts(workspaceId: string, customerId: string) {
  const [customerCnt, comtCnt] = await Promise.all([
    db.select({ c: count() }).from(salesCustomerContact)
      .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
                 eq(salesCustomerContact.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
    db.select({ c: count() }).from(salesCustomerMemo)
      .where(and(eq(salesCustomerMemo.workspaceId, workspaceId),
                 eq(salesCustomerMemo.customerId, customerId)))
      .then(r => Number(r[0]?.c ?? 0)),
  ]);

  // [P2-BLOCKED] sales_opportunity / sales_activity 스키마 P2 머지 후 활성화
  // const [opCnt, actCnt] = await Promise.all([
  //   db.select({ c: count() }).from(salesOpportunity)
  //     .where(and(eq(salesOpportunity.workspaceId, workspaceId),
  //                eq(salesOpportunity.customerId, customerId)))
  //     .then(r => Number(r[0]?.c ?? 0)),
  //   db.select({ c: count() }).from(salesActivity)
  //     .where(and(eq(salesActivity.workspaceId, workspaceId),
  //                eq(salesActivity.customerId, customerId)))
  //     .then(r => Number(r[0]?.c ?? 0)),
  // ]);
  const opCnt = 0;
  const actCnt = 0;

  return { customerCnt, opCnt, actCnt, comtCnt };
}

export async function getContactTabCounts(workspaceId: string, contactId: string) {
  // contact의 customerId 존재 여부로 custCompanyCnt 결정
  const [contact] = await db.select({ customerId: salesCustomerContact.customerId })
    .from(salesCustomerContact)
    .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
               eq(salesCustomerContact.id, contactId)));
  const custCompanyCnt = contact?.customerId ? 1 : 0;

  const comtCnt = await db.select({ c: count() }).from(salesCustomerContactMemo)
    .where(and(eq(salesCustomerContactMemo.workspaceId, workspaceId),
               eq(salesCustomerContactMemo.contactId, contactId)))
    .then(r => Number(r[0]?.c ?? 0));

  // [P2-BLOCKED] op/act
  const opCnt = 0;
  const actCnt = 0;

  return { custCompanyCnt, opCnt, actCnt, comtCnt };
}
```

- [ ] **Step 3: P2 unblock 가이드 명시 (코드 주석)**

`sales-tabs.ts` 파일 상단에 P2-BLOCKED 코멘트 블록 추가:

```ts
/**
 * [P2-BLOCKED] sales_opportunity / sales_activity 의존성:
 * P2 plan(bold-noether-742a91)이 main에 머지된 직후 본 파일의 주석 처리된 import + count
 * SQL을 활성화하라. 활성화 위치: getCustomerTabCounts 내 opCnt/actCnt 계산, getContactTabCounts
 * 동상. e2e 테스트(`sales-customers-tabs.spec.ts`)도 op/act > 0 케이스로 갱신 필요.
 */
```

- [ ] **Step 4: run tests (pass — op/act = 0 검증)**

```bash
pnpm --filter @jarvis/web exec vitest run lib/queries/sales-tabs.test.ts
```

- [ ] **Step 5: commit**

```bash
git add apps/web/lib/queries/sales-tabs.ts apps/web/lib/queries/sales-tabs.test.ts
git commit -m "feat(p2/lib): add tab counts (op/act blocked on P2 merge)"
```

---

## Task 5 (PR-1): server actions — customer/contact memo CRUD + tab counts

**Files:**
- Modify: `apps/web/app/(app)/sales/customers/actions.ts`
- Modify: `apps/web/app/(app)/sales/customer-contacts/actions.ts`

- [ ] **Step 1: customers/actions.ts에 4 함수 추가**

기존 파일 끝에 append (resolveSalesContext 재활용):

```ts
import {
  customerMemoListInput, customerMemoListOutput,
  customerMemoCreateInput, customerMemoCreateOutput,
  customerMemoDeleteInput, customerMemoDeleteOutput,
  customerTabCountsInput, customerTabCountsOutput,
} from "@jarvis/shared/validation/sales/customer-memo";
import { salesCustomerMemo, user } from "@jarvis/db/schema";
import { buildMemoTree, getCustomerTabCounts as queryCustomerTabCounts } from "@/lib/queries/sales-tabs";
import { isAdmin } from "@jarvis/auth";
import { desc, max, sql } from "drizzle-orm";

export async function getCustomerTabCounts(rawInput: z.input<typeof customerTabCountsInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const { customerId } = customerTabCountsInput.parse(rawInput);
  const counts = await queryCustomerTabCounts(ctx.workspaceId, customerId);
  return { ok: true as const, ...customerTabCountsOutput.parse(counts) };
}

export async function listCustomerMemos(rawInput: z.input<typeof customerMemoListInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [] };
  const { customerId } = customerMemoListInput.parse(rawInput);

  const rows = await db
    .select({
      comtSeq: salesCustomerMemo.comtSeq,
      priorComtSeq: salesCustomerMemo.priorComtSeq,
      memo: salesCustomerMemo.memo,
      authorName: user.name,
      insdate: salesCustomerMemo.createdAt,
      createdBy: salesCustomerMemo.createdBy,
    })
    .from(salesCustomerMemo)
    .leftJoin(user, eq(user.id, salesCustomerMemo.createdBy))
    .where(and(
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
    ))
    .orderBy(salesCustomerMemo.comtSeq);

  const tree = buildMemoTree(
    rows.map((r) => ({
      comtSeq: r.comtSeq,
      priorComtSeq: r.priorComtSeq,
      memo: r.memo,
      authorName: r.authorName,
      insdate: r.insdate.toISOString().slice(0, 16).replace("T", " "),
      createdBy: r.createdBy,
    })),
    ctx.userId ?? null,
  );

  return customerMemoListOutput.parse({ rows: tree });
}

export async function createCustomerMemo(rawInput: z.input<typeof customerMemoCreateInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerMemoCreateOutput.parse({ ok: false, comtSeq: null });
  const { customerId, priorComtSeq, memo } = customerMemoCreateInput.parse(rawInput);

  const result = await db.transaction(async (tx) => {
    // 다음 comtSeq = max + 1 (workspaceId + customerId scope)
    const [maxRow] = await tx.select({ m: max(salesCustomerMemo.comtSeq) })
      .from(salesCustomerMemo)
      .where(and(
        eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
        eq(salesCustomerMemo.customerId, customerId),
      ));
    const nextSeq = (maxRow?.m ?? 0) + 1;

    await tx.insert(salesCustomerMemo).values({
      workspaceId: ctx.workspaceId,
      customerId,
      comtSeq: nextSeq,
      priorComtSeq: priorComtSeq === 0 ? null : priorComtSeq,
      memo,
      createdBy: ctx.userId ?? undefined,
    });
    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer.memo.create",
      resourceType: "sales_customer_memo",
      resourceId: customerId,
      details: { comtSeq: nextSeq, priorComtSeq } as Record<string, unknown>,
      success: true,
    });
    return nextSeq;
  });

  return customerMemoCreateOutput.parse({ ok: true, comtSeq: result });
}

export async function deleteCustomerMemo(rawInput: z.input<typeof customerMemoDeleteInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return customerMemoDeleteOutput.parse({ ok: false });
  const { customerId, comtSeq } = customerMemoDeleteInput.parse(rawInput);

  // 본인 검증: created_by === userId OR isAdmin
  const session = await getSession((await resolveSessionId())!);
  const adminBypass = session ? isAdmin(session) : false;

  await db.transaction(async (tx) => {
    // 마스터 의견이면 reply 도 cascade delete
    const conds = [
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
      eq(salesCustomerMemo.comtSeq, comtSeq),
    ];
    if (!adminBypass) conds.push(eq(salesCustomerMemo.createdBy, ctx.userId!));
    await tx.delete(salesCustomerMemo).where(and(...conds));

    // priorComtSeq === comtSeq 인 reply도 삭제 (마스터 삭제 시 cascade)
    await tx.delete(salesCustomerMemo).where(and(
      eq(salesCustomerMemo.workspaceId, ctx.workspaceId),
      eq(salesCustomerMemo.customerId, customerId),
      eq(salesCustomerMemo.priorComtSeq, comtSeq),
    ));

    await tx.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.customer.memo.delete",
      resourceType: "sales_customer_memo",
      resourceId: customerId,
      details: { comtSeq } as Record<string, unknown>,
      success: true,
    });
  });

  return customerMemoDeleteOutput.parse({ ok: true });
}
```

- [ ] **Step 2: customer-contacts/actions.ts 동상 (8 → 4 함수 추가)**

위 4 함수의 customer → contact 미러. 차이:
- `customerId` → `contactId`
- `salesCustomerMemo` → `salesCustomerContactMemo`
- audit `sales.customer.memo.*` → `sales.customer_contact.memo.*`
- count 함수 → `getContactTabCounts`

전체 코드는 implementer가 customer/actions.ts의 4 함수를 1:1 미러로 작성. 본 plan은 동일 패턴이므로 코드 chunk 생략.

- [ ] **Step 3: type-check + lint**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
```

- [ ] **Step 4: commit**

```bash
git add apps/web/app/\(app\)/sales/customers/actions.ts apps/web/app/\(app\)/sales/customer-contacts/actions.ts
git commit -m "feat(p2/sales): add memo CRUD + tab count actions for customer + contact"
```

---

## Task 6 (PR-1): listCustomers/listCustomerContacts 응답에 counts 추가

**Files:**
- Modify: `apps/web/app/(app)/sales/customers/actions.ts` (`listCustomers`)
- Modify: `apps/web/app/(app)/sales/customer-contacts/actions.ts` (`listCustomerContacts`)

- [ ] **Step 1: `listCustomers` 응답 매핑에 counts 추가**

기존 코드(actions.ts:97 부근의 `rows.map`) 옆에 별 batch 호출:

```ts
// rows fetch 후
const customerIds = rows.map((r) => r.id);
const countsMap = customerIds.length > 0
  ? new Map(
      await Promise.all(
        customerIds.map(async (id) => [id, await queryCustomerTabCounts(ctx.workspaceId, id)] as const),
      ),
    )
  : new Map();
// rows.map 결과에 추가
counts: countsMap.get(r.id) ?? null,  // null이면 grid 칩 비활성
```

성능 측정 후 N+1 문제면 LATERAL JOIN으로 전환 (spec §14.2). plan 단계에선 N+1 그대로 + 측정 단계 명시.

- [ ] **Step 2: 측정**

```bash
# psql로 50건 쿼리 시간 측정
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM sales_customer;"
# 페이지 로드 후 dev 콘솔 network tab에서 listCustomers latency 확인
```

기준: 200ms 미만 OK. 초과 시 implementer가 LATERAL JOIN으로 리팩토링 (별 commit).

- [ ] **Step 3: `listCustomerContacts` 동상**

- [ ] **Step 4: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 5: commit**

```bash
git commit -m "feat(p2/sales): include tab counts in listCustomers/listCustomerContacts response"
```

---

## Task 7 (PR-1): MemoModal 컴포넌트 + Mgr 그리드 카운트 칩 컬럼 + 모달 연결

**Files:**
- Create: `apps/web/app/(app)/sales/customers/_components/MemoModal.tsx`
- Create: `apps/web/app/(app)/sales/customer-contacts/_components/MemoModal.tsx`
- Modify: `apps/web/app/(app)/sales/customers/_components/CustomersGridContainer.tsx`
- Modify: `apps/web/app/(app)/sales/customer-contacts/_components/CustomerContactsGridContainer.tsx`

- [ ] **Step 1: MemoModal — customer 도메인**

`apps/web/app/(app)/sales/customers/_components/MemoModal.tsx`:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  listCustomerMemos, createCustomerMemo, deleteCustomerMemo,
} from "../actions";
import type { MemoTreeNode } from "@jarvis/shared/validation/sales/customer-memo";

type Props = {
  customerId: string | null;  // null이면 모달 닫힘
  customerName?: string;
  onClose: () => void;
  onCountChange?: () => void;  // 의견 변동 시 부모가 카운트 새로고침
};

export function MemoModal({ customerId, customerName, onClose, onCountChange }: Props) {
  const t = useTranslations("Sales.Customers.Memo");
  const [tree, setTree] = useState<MemoTreeNode[]>([]);
  const [, startTransition] = useTransition();
  const [composing, setComposing] = useState<{ priorComtSeq: number } | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!customerId) return;
    startTransition(async () => {
      const res = await listCustomerMemos({ customerId });
      if ("rows" in res) setTree(res.rows);
    });
  }, [customerId]);

  if (!customerId) return null;

  const reload = () => {
    startTransition(async () => {
      const res = await listCustomerMemos({ customerId });
      if ("rows" in res) setTree(res.rows);
      onCountChange?.();
    });
  };

  const submit = async () => {
    if (!composing || !draft.trim()) return;
    await createCustomerMemo({ customerId, priorComtSeq: composing.priorComtSeq, memo: draft.trim() });
    setDraft("");
    setComposing(null);
    reload();
  };

  const remove = async (priorComtSeq: number, isMaster: boolean) => {
    const msg = isMaster ? t("deleteMasterConfirm") : t("deleteReplyConfirm");
    if (!confirm(msg)) return;
    await deleteCustomerMemo({ customerId, comtSeq: priorComtSeq });
    reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[80vh] w-[720px] overflow-y-auto rounded bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("title")} — {customerName ?? ""}</h2>
          <button onClick={onClose} aria-label="close">✕</button>
        </div>

        {composing?.priorComtSeq === 0 ? (
          <div className="mb-4 rounded border bg-slate-50 p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded border p-2 text-sm"
              rows={3}
              placeholder={t("memoPlaceholder")}
            />
            <button onClick={submit} className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white">
              {t("createMaster")}
            </button>
          </div>
        ) : (
          <button onClick={() => setComposing({ priorComtSeq: 0 })} className="mb-4 rounded bg-slate-900 px-3 py-1 text-sm text-white">
            {t("createMaster")}
          </button>
        )}

        {tree.length === 0 ? (
          <p className="text-sm text-slate-500">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {tree.map((m) => (
              <li key={m.comtSeq} className="rounded border-l-4 border-slate-500 p-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{m.authorName ?? "(?)"} · {m.insdate}</span>
                  {m.isOwn && (
                    <button onClick={() => remove(m.comtSeq, true)} className="text-xs text-rose-600">
                      {t("delete")}
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.memo}</p>
                <button onClick={() => setComposing({ priorComtSeq: m.comtSeq })} className="mt-2 text-xs text-slate-700">
                  {t("createReply")}
                </button>

                {composing?.priorComtSeq === m.comtSeq && (
                  <div className="mt-2 rounded border bg-slate-50 p-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full rounded border p-2 text-sm"
                      rows={2}
                      placeholder={t("memoPlaceholder")}
                    />
                    <button onClick={submit} className="mt-1 rounded bg-slate-700 px-2 py-1 text-xs text-white">
                      {t("createReply")}
                    </button>
                  </div>
                )}

                {m.replies.length > 0 && (
                  <ul className="mt-2 space-y-2 border-t pt-2">
                    {m.replies.map((r) => (
                      <li key={r.comtSeq} className="ml-6 rounded border-l-2 border-slate-300 pl-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{r.authorName ?? "(?)"} · {r.insdate}</span>
                          {r.isOwn && (
                            <button onClick={() => remove(r.comtSeq, false)} className="text-xs text-rose-600">
                              {t("delete")}
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{r.memo}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: MemoModal — contact 도메인 (1:1 미러)**

`customer-contacts/_components/MemoModal.tsx`:
- props: `contactId` + `contactName`
- import: `listContactMemos`, `createContactMemo`, `deleteContactMemo`
- t namespace: `Sales.CustomerContacts.Memo`
- 코드 chunk 생략 (위 customer 버전 1:1 미러)

- [ ] **Step 3: CustomersGridContainer에 카운트 칩 컬럼 + 모달 state**

`CustomersGridContainer.tsx`의 `COLUMNS` 배열에 추가 (createdAt 컬럼 앞):

```tsx
{
  key: "counts",  // CustomerRow.counts
  label: "탭",
  type: "readonly",
  width: 200,
  render: (row) => row.counts ? (
    <CountChips
      counts={{
        customer: row.counts.customer,
        op: row.counts.op,
        act: row.counts.act,
        comt: row.counts.comt,
      }}
      onMemoClick={() => setMemoTarget({ id: row.id, name: row.custNm })}
    />
  ) : <span className="text-slate-300">—</span>,
},
```

`CountChips`는 inline component:

```tsx
function CountChips({ counts, onMemoClick }: { counts: { customer: number; op: number; act: number; comt: number }; onMemoClick: () => void }) {
  return (
    <div className="flex gap-1 text-[11px]">
      <span className="rounded bg-slate-100 px-2 py-0.5">고객 {counts.customer}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">기회 {counts.op}</span>
      <span className="rounded bg-slate-100 px-2 py-0.5">활동 {counts.act}</span>
      <button onClick={(e) => { e.stopPropagation(); onMemoClick(); }} className="rounded bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200">
        의견 {counts.comt}
      </button>
    </div>
  );
}
```

container 함수 내부에 모달 state 추가:

```tsx
const [memoTarget, setMemoTarget] = useState<{ id: string; name: string } | null>(null);
```

JSX 끝(`</DataGrid>` 뒤)에 모달:

```tsx
<MemoModal
  customerId={memoTarget?.id ?? null}
  customerName={memoTarget?.name}
  onClose={() => setMemoTarget(null)}
  onCountChange={() => reload(page, filterValues)}
/>
```

- [ ] **Step 4: CustomerContactsGridContainer 동상**

차이:
- 칩 라벨: `고객사 → 기회 → 활동 → 의견`
- `customer` → `custCompany`
- `MemoModal` import 위치: `customer-contacts/_components/MemoModal`

- [ ] **Step 5: type-check + lint**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
```

- [ ] **Step 6: commit**

```bash
git commit -m "feat(p2/sales): add MemoModal + count chip column to customer + contact grids"
```

---

## Task 8 (PR-1): i18n — Sales.*.Tabs + Sales.*.Memo

**Files:**
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: 추가**

`Sales.Customers` (line 1040 부근)에 sub-key 추가:

```json
"Tabs": {
  "customers": "고객 ({count})",
  "opportunities": "영업기회 ({count})",
  "activities": "영업활동 ({count})",
  "memos": "의견 ({count})"
},
"Memo": {
  "title": "고객사 의견",
  "createMaster": "의견 등록",
  "createReply": "댓글",
  "delete": "삭제",
  "deleteMasterConfirm": "의견 삭제 시 댓글도 모두 삭제됩니다. 삭제하시겠습니까?",
  "deleteReplyConfirm": "댓글을 삭제하시겠습니까?",
  "empty": "등록된 의견이 없습니다.",
  "memoLabel": "의견",
  "memoPlaceholder": "의견을 입력하세요"
}
```

`Sales.CustomerContacts` (line 1059 부근)에 동상 — `Tabs.customer` / `Memo.title` 라벨만 컨택 컨텍스트로:
- `Tabs.customer: "고객사 ({count})"`
- `Memo.title: "고객담당자 의견"`

- [ ] **Step 2: 컴포넌트 호출과 1:1 일치 검증 (jarvis-i18n 경계면)**

```bash
grep -rn 't("Sales\.Customers\.Memo' apps/web/app/\(app\)/sales/customers/_components/
grep -rn 't("Sales\.CustomerContacts\.Memo' apps/web/app/\(app\)/sales/customer-contacts/_components/
```

각 결과의 키가 ko.json 경로와 일치 확인.

- [ ] **Step 3: type-check + dev 서버 smoke**

```bash
pnpm --filter @jarvis/web type-check
# 별도 터미널: pnpm --filter @jarvis/web dev → /sales/customers 접속, 의견 칩 클릭 → 모달 한국어 라벨 표시 확인
```

- [ ] **Step 4: commit**

```bash
git commit -m "feat(p2/i18n): add Sales.{Customers,CustomerContacts}.{Tabs,Memo} keys"
```

---

## Task 9 (PR-1): e2e — 카운트 칩 + 의견 모달

**Files:**
- Create: `apps/web/e2e/sales-customers-tabs.spec.ts`
- Create: `apps/web/e2e/sales-customer-contacts-tabs.spec.ts`

- [ ] **Step 1: customers e2e**

```ts
import { test, expect } from "@playwright/test";

test.describe("sales/customers — tab counts + memo modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin@jarvis.dev");
    await page.getByLabel("비밀번호").fill("admin123");
    await page.getByRole("button", { name: /로그인/i }).click();
    await page.goto("/sales/customers");
  });

  test("displays count chips for each row", async ({ page }) => {
    await expect(page.getByText("고객", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("의견", { exact: false }).first()).toBeVisible();
  });

  test("clicking memo chip opens MemoModal", async ({ page }) => {
    const firstMemoChip = page.getByRole("button", { name: /의견/i }).first();
    await firstMemoChip.click();
    await expect(page.getByRole("heading", { name: /고객사 의견/i })).toBeVisible();
  });

  test("creates and deletes own memo (master)", async ({ page }) => {
    await page.getByRole("button", { name: /의견/i }).first().click();
    await page.getByRole("button", { name: /의견 등록/i }).first().click();
    await page.getByPlaceholder("의견을 입력하세요").fill("e2e 테스트 의견");
    await page.getByRole("button", { name: /의견 등록/i }).last().click();
    await expect(page.getByText("e2e 테스트 의견")).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /삭제/i }).first().click();
    await expect(page.getByText("e2e 테스트 의견")).toHaveCount(0);
  });

  test("non-owner cannot see delete button on others' memos", async ({ page, browser }) => {
    // admin이 메모 등록
    await page.getByRole("button", { name: /의견/i }).first().click();
    await page.getByRole("button", { name: /의견 등록/i }).first().click();
    await page.getByPlaceholder("의견을 입력하세요").fill("admin only");
    await page.getByRole("button", { name: /의견 등록/i }).last().click();

    // viewer로 다른 컨텍스트에서 로그인
    const viewerCtx = await browser.newContext();
    const viewerPage = await viewerCtx.newPage();
    await viewerPage.goto("/login");
    await viewerPage.getByLabel("이메일").fill("viewer@jarvis.dev");
    await viewerPage.getByLabel("비밀번호").fill("viewer123");
    await viewerPage.getByRole("button", { name: /로그인/i }).click();
    await viewerPage.goto("/sales/customers");
    await viewerPage.getByRole("button", { name: /의견/i }).first().click();

    // admin's "admin only" memo는 보이지만 그 옆 [삭제] 버튼은 없어야
    const memoItem = viewerPage.locator("li", { hasText: "admin only" });
    await expect(memoItem).toBeVisible();
    await expect(memoItem.getByRole("button", { name: /삭제/i })).toHaveCount(0);
    await viewerCtx.close();
  });
});
```

- [ ] **Step 2: customer-contacts e2e (동상)**

`/sales/customer-contacts`로 진입, 칩 라벨 `고객사 → 기회 → 활동 → 의견` 확인. 같은 4 테스트 케이스.

- [ ] **Step 3: e2e fixture 확인**

P1 e2e fixture에 `admin@jarvis.dev` + `viewer@jarvis.dev` 두 user가 seed됐는지 확인:

```bash
grep -rn "admin@jarvis.dev\|viewer@jarvis.dev" packages/db/seed/
```

없으면 implementer가 fixture 보강 task를 별 task로 추가 (본 plan에 미명시 — fixture가 이미 있다고 가정).

- [ ] **Step 4: e2e 실행**

```bash
pnpm --filter @jarvis/web exec playwright test sales-customers-tabs.spec.ts sales-customer-contacts-tabs.spec.ts
```

- [ ] **Step 5: commit**

```bash
git commit -m "test(p2/sales): add e2e for tab counts + memo modal (admin + viewer ownership)"
```

---

## Task 10 (PR-1): 검증 게이트 + PR 생성

- [ ] **Step 1: 전체 검증**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test
node scripts/check-schema-drift.mjs --precommit
pnpm audit:rsc
pnpm --filter @jarvis/web exec playwright test
```

- [ ] **Step 2: 실패 시 systematic-debugging**

`superpowers:systematic-debugging` 따라 우회 금지, 근본 원인.

- [ ] **Step 3: PR 직전 spec/plan 보존 (메모리 룰: 머지 직전 삭제)**

본 PR 이전에 spec/plan 삭제하지 않음. 4 PR(PR-1 + PR-4) 모두 머지 후 별 chore commit으로 삭제.

- [ ] **Step 4: PR 생성**

```bash
gh pr create --title "feat(sales): customer/contact tab counts + memo modal backend (PR-1)" --body "$(cat <<'EOF'
## Summary
- Adds `sales_customer_contact_memo` schema (2-level reply tree, mirror of P1 `sales_customer_memo`)
- 4 server actions per domain: `getXxxTabCounts`, `listXxxMemos`, `createXxxMemo`, `deleteXxxMemo` (본인 검증, ADMIN_ALL 우회)
- `listCustomers`/`listCustomerContacts` 응답에 `counts: { ... } | null` 필드 추가
- Mgr 그리드에 카운트 칩 컬럼 + 의견 모달 client component
- i18n `Sales.{Customers,CustomerContacts}.{Tabs,Memo}` 추가

## Dependencies
- P1.5 (eager-ritchie-9f4a82) ✅ merged
- P2 (bold-noether-742a91) ⏳ — `opCnt`/`actCnt` SQL은 P2 머지 후 활성화 (현재 0). 코드에 `[P2-BLOCKED]` 마커.

## Test plan
- [x] type-check / lint
- [x] vitest unit (buildMemoTree)
- [x] e2e: 카운트 칩 표시, 모달 열기/닫기, 의견 CRUD, 본인 검증 (admin vs viewer)
- [x] schema-drift / audit:rsc

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: PR 머지 후 main rebase + PR-4 진입**

```bash
git fetch origin main
git rebase origin/main
```

---

## Task 11 (PR-4): baseline DataGrid에 `onRowDoubleClick` prop 추가 (1줄 patch)

**Goal:** spec §3 가정대로라면 baseline에 이미 있어야 했지만 실제 main에 없음. PR-4의 첫 commit으로 optional non-breaking 추가.

**Files:**
- Modify: `apps/web/components/grid/DataGrid.tsx`

- [ ] **Step 1: prop 타입 추가**

`DataGrid.tsx:29~54`의 `DataGridProps` 정의에 추가:

```ts
/** 행 더블클릭 콜백 (master-detail 진입용) */
onRowDoubleClick?: (row: T) => void;
```

- [ ] **Step 2: 함수 시그니처 + tr 핸들러**

```tsx
export function DataGrid<T extends WithId>({
  rows: initialRows,
  total,
  columns,
  filters,
  page,
  limit,
  makeBlankRow,
  onPageChange,
  onFilterChange,
  onSave,
  filterValues: externalFilterValues,
  emptyMessage = "데이터가 없습니다.",
  onRowDoubleClick,  // ← 추가
}: DataGridProps<T>) {
```

`<tr>` (line 170 부근)에:

```tsx
onDoubleClick={() => onRowDoubleClick?.(r.data)}
```

기존 `onClick={() => setSelected(r.data.id)}` 바로 다음 줄.

- [ ] **Step 3: type-check + 회귀 e2e (admin-companies)**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web exec playwright test admin-companies.spec.ts
```

기존 admin/companies + sales/* 5 화면이 prop 미전달 시 동작 동일해야.

- [ ] **Step 4: commit**

```bash
git commit -m "feat(grid): add optional onRowDoubleClick prop to DataGrid (non-breaking)"
```

---

## Task 12 (PR-4): P2 server actions에 customerId/contactId optional 필터 추가 [P2-BLOCKED]

**Goal:** `sales/opportunities/actions.ts`의 `listOpportunitiesAction` Zod input에 `customerId?: uuid` + `contactId?: uuid` 추가 + queries WHERE 절. `sales/activities` 동상.

**Files (P2 머지 후만 존재):**
- Modify: `packages/shared/validation/sales-opportunity.ts` — `opportunityListInput` 확장
- Modify: `apps/web/lib/queries/sales-opportunity.ts` — listOpportunities 함수 conds 추가
- Modify: `packages/shared/validation/sales-activity.ts` — 동상
- Modify: `apps/web/lib/queries/sales-activity.ts` — 동상

- [ ] **Step 1: P2 머지 확인 (전제 조건)**

```bash
git log origin/main --oneline | grep "p2/sales\|sales_opportunity\|sales_activity"
```

P2 commit이 없으면 본 task 스킵 (PR-4는 P2 머지 후만).

- [ ] **Step 2: opportunityListInput 확장**

```ts
export const opportunityListInput = z.object({
  q: z.string().optional(),
  bizStepCode: z.string().optional(),
  productTypeCode: z.string().optional(),
  focusOnly: z.boolean().optional(),
  customerId: z.string().uuid().optional(),  // ← 추가
  contactId: z.string().uuid().optional(),    // ← 추가
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(50),
});
```

- [ ] **Step 3: listOpportunities WHERE 추가**

`apps/web/lib/queries/sales-opportunity.ts`의 `listOpportunities`:

```ts
if (params.customerId) conds.push(eq(o.customerId, params.customerId));
if (params.contactId) conds.push(eq(o.contactId, params.contactId));
```

- [ ] **Step 4: sales-activity 동상**

- [ ] **Step 5: e2e — `/sales/opportunities?customerId=X` URL이 X의 기회만 보여주는지 검증**

`apps/web/e2e/sales-customers-edit.spec.ts` (Task 18에서 작성)에서 sidebar [기회] 클릭 → URL 변경 + grid count 일치 확인.

- [ ] **Step 6: commit**

```bash
git commit -m "feat(p2/sales): add customerId/contactId optional filters to opportunity/activity actions (PR-4 sidebar dependency)"
```

---

## Task 13 (PR-4): `getCustomer` / `getContact` server actions

**Files:**
- Modify: `apps/web/app/(app)/sales/customers/actions.ts`
- Modify: `apps/web/app/(app)/sales/customer-contacts/actions.ts`
- Create: `packages/shared/validation/sales/customer-detail.ts`

- [ ] **Step 1: Zod**

`packages/shared/validation/sales/customer-detail.ts`:

```ts
import { z } from "zod";

export const getCustomerInput = z.object({ id: z.string().uuid() });
export const customerDetailSchema = z.object({
  id: z.string().uuid(),
  custCd: z.string(),
  custNm: z.string(),
  custKindCd: z.string().nullable(),
  custDivCd: z.string().nullable(),
  ceoNm: z.string().nullable(),
  telNo: z.string().nullable(),
  businessNo: z.string().nullable(),
  homepage: z.string().nullable(),
  addrNo: z.string().nullable(),
  addr1: z.string().nullable(),
  addr2: z.string().nullable(),
  // 추가 필드는 spec §6.4 폼 기준
});
export const getCustomerOutput = z.object({
  customer: customerDetailSchema.nullable(),
});

export const getContactInput = z.object({ id: z.string().uuid() });
export const contactDetailSchema = z.object({
  id: z.string().uuid(),
  custMcd: z.string(),
  customerId: z.string().uuid().nullable(),
  custNm: z.string().nullable(),  // joined from sales_customer
  custName: z.string().nullable(),
  jikweeNm: z.string().nullable(),
  orgNm: z.string().nullable(),
  hpNo: z.string().nullable(),
  telNo: z.string().nullable(),
  email: z.string().nullable(),
  statusYn: z.boolean().nullable(),
  switComp: z.string().nullable(),
});
export const getContactOutput = z.object({
  contact: contactDetailSchema.nullable(),
});
```

- [ ] **Step 2: getCustomer 구현**

`customers/actions.ts`에 추가:

```ts
export async function getCustomer(rawInput: z.input<typeof getCustomerInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return getCustomerOutput.parse({ customer: null });
  const { id } = getCustomerInput.parse(rawInput);

  const [row] = await db.select()
    .from(salesCustomer)
    .where(and(eq(salesCustomer.id, id), eq(salesCustomer.workspaceId, ctx.workspaceId)));

  if (!row) return getCustomerOutput.parse({ customer: null });

  return getCustomerOutput.parse({
    customer: {
      id: row.id,
      custCd: row.custCd,
      custNm: row.custNm,
      custKindCd: row.custKindCd ?? null,
      custDivCd: row.custDivCd ?? null,
      ceoNm: row.ceoNm ?? null,
      telNo: row.telNo ?? null,
      businessNo: row.businessNo ?? null,
      homepage: row.homepage ?? null,
      addrNo: row.addrNo ?? null,
      addr1: row.addr1 ?? null,
      addr2: row.addr2 ?? null,
    },
  });
}
```

- [ ] **Step 3: getContact 구현 (customer 기본 정보 join)**

```ts
export async function getContact(rawInput: z.input<typeof getContactInput>) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return getContactOutput.parse({ contact: null });
  const { id } = getContactInput.parse(rawInput);

  const [row] = await db
    .select({
      id: salesCustomerContact.id,
      custMcd: salesCustomerContact.custMcd,
      customerId: salesCustomerContact.customerId,
      custNm: salesCustomer.custNm,  // join
      custName: salesCustomerContact.custName,
      jikweeNm: salesCustomerContact.jikweeNm,
      orgNm: salesCustomerContact.orgNm,
      hpNo: salesCustomerContact.hpNo,
      telNo: salesCustomerContact.telNo,
      email: salesCustomerContact.email,
      statusYn: salesCustomerContact.statusYn,
      switComp: salesCustomerContact.switComp,
    })
    .from(salesCustomerContact)
    .leftJoin(salesCustomer, eq(salesCustomer.id, salesCustomerContact.customerId))
    .where(and(eq(salesCustomerContact.id, id), eq(salesCustomerContact.workspaceId, ctx.workspaceId)));

  return getContactOutput.parse({ contact: row ?? null });
}
```

- [ ] **Step 4: type-check + commit**

```bash
pnpm --filter @jarvis/web type-check
git commit -m "feat(p2/sales): add getCustomer + getContact server actions (master-detail fetch)"
```

---

## Task 14 (PR-4): `CustomerEditForm` + `ContactEditForm` (client islands)

**Files:**
- Create: `apps/web/app/(app)/sales/customers/[id]/edit/_components/CustomerEditForm.tsx`
- Create: `apps/web/app/(app)/sales/customer-contacts/[id]/edit/_components/ContactEditForm.tsx`

- [ ] **Step 1: CustomerEditForm**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveCustomers } from "../../../actions";

type Customer = {
  id: string;
  custCd: string;
  custNm: string;
  custKindCd: string | null;
  custDivCd: string | null;
  ceoNm: string | null;
  telNo: string | null;
  businessNo: string | null;
  homepage: string | null;
  addrNo: string | null;
  addr1: string | null;
  addr2: string | null;
};

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const t = useTranslations("Sales.Customers.Edit");
  const [draft, setDraft] = useState(customer);
  const [, startTransition] = useTransition();

  const update = <K extends keyof Customer>(k: K, v: Customer[K]) => setDraft({ ...draft, [k]: v });

  const save = () => {
    startTransition(async () => {
      await saveCustomers({
        creates: [],
        updates: [{ id: customer.id, patch: draft }],
        deletes: [],
      });
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm(t("actions.deleteConfirm"))) return;
    startTransition(async () => {
      await saveCustomers({ creates: [], updates: [], deletes: [customer.id] });
      router.push("/sales/customers");
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h2 className="text-lg font-semibold">{t("fieldset")}</h2>
      <Field label={t("fields.custCd")} value={draft.custCd} readOnly />
      <Field label={t("fields.custNm")} value={draft.custNm} onChange={(v) => update("custNm", v)} required />
      <Field label={t("fields.ceoNm")} value={draft.ceoNm ?? ""} onChange={(v) => update("ceoNm", v || null)} />
      <Field label={t("fields.telNo")} value={draft.telNo ?? ""} onChange={(v) => update("telNo", v || null)} />
      <Field label={t("fields.businessNo")} value={draft.businessNo ?? ""} onChange={(v) => update("businessNo", v || null)} />
      <Field label={t("fields.homepage")} value={draft.homepage ?? ""} onChange={(v) => update("homepage", v || null)} />
      <Field label={t("fields.addr1")} value={draft.addr1 ?? ""} onChange={(v) => update("addr1", v || null)} />
      <Field label={t("fields.addr2")} value={draft.addr2 ?? ""} onChange={(v) => update("addr2", v || null)} />

      <div className="flex gap-2">
        <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-sm text-white">{t("actions.save")}</button>
        <button type="button" onClick={remove} className="rounded bg-rose-600 px-3 py-1 text-sm text-white">{t("actions.delete")}</button>
        <button type="button" onClick={() => router.push("/sales/customers")} className="rounded border px-3 py-1 text-sm">{t("actions.back")}</button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, readOnly, required }: {
  label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-600"> *</span>}</span>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        required={required}
        className="mt-1 w-full rounded border px-2 py-1 text-sm read-only:bg-slate-50"
      />
    </label>
  );
}
```

- [ ] **Step 2: ContactEditForm 동상**

차이:
- 폼 필드: custName, custNm(readonly join), orgNm, jikweeNm, hpNo, telNo, email, statusYn(boolean — spec §14.6 known limitation), switComp
- save: `saveCustomerContacts`
- back: `/sales/customer-contacts`

- [ ] **Step 3: type-check + commit**

```bash
pnpm --filter @jarvis/web type-check
git commit -m "feat(p2/sales): add CustomerEditForm + ContactEditForm client islands"
```

---

## Task 15 (PR-4): `CustomerDetailSidebar` + `ContactDetailSidebar` (4탭)

**Files:**
- Create: `apps/web/app/(app)/sales/customers/_components/CustomerDetailSidebar.tsx`
- Create: `apps/web/app/(app)/sales/customer-contacts/_components/ContactDetailSidebar.tsx`

- [ ] **Step 1: CustomerDetailSidebar**

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCustomerTabCounts } from "../actions";
import { MemoModal } from "./MemoModal";

type Counts = { customerCnt: number; opCnt: number; actCnt: number; comtCnt: number };

export function CustomerDetailSidebar({ customerId, customerName }: { customerId: string; customerName: string }) {
  const t = useTranslations("Sales.Customers.Tabs");
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [, startTransition] = useTransition();

  const loadCounts = () => startTransition(async () => {
    const res = await getCustomerTabCounts({ customerId });
    if (res.ok) setCounts({ customerCnt: res.customerCnt, opCnt: res.opCnt, actCnt: res.actCnt, comtCnt: res.comtCnt });
  });

  useEffect(loadCounts, [customerId]);

  if (!counts) return <aside className="w-[300px] rounded border p-4">로딩 중…</aside>;

  return (
    <aside className="w-[300px] space-y-3 rounded border p-4">
      <h3 className="text-sm font-semibold">상세 정보</h3>
      <div className="grid grid-cols-2 gap-2">
        <TabButton label={t("customers", { count: counts.customerCnt })} onClick={() => router.push(`/sales/customer-contacts?customerId=${customerId}`)} />
        <TabButton label={t("opportunities", { count: counts.opCnt })} onClick={() => router.push(`/sales/opportunities?customerId=${customerId}`)} disabled={counts.opCnt === 0} />
        <TabButton label={t("activities", { count: counts.actCnt })} onClick={() => router.push(`/sales/activities?customerId=${customerId}`)} disabled={counts.actCnt === 0} />
        <TabButton label={t("memos", { count: counts.comtCnt })} onClick={() => setMemoOpen(true)} primary />
      </div>

      {memoOpen && (
        <MemoModal
          customerId={customerId}
          customerName={customerName}
          onClose={() => { setMemoOpen(false); loadCounts(); }}
          onCountChange={loadCounts}
        />
      )}
    </aside>
  );
}

function TabButton({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded border px-2 py-1 text-xs",
        primary ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: ContactDetailSidebar 동상**

차이:
- props: `contactId`, `contactName`, `customerId` (1:1 link용, null 가능)
- 탭 라벨: customer (← `/sales/customers/${customerId}/edit` 또는 disabled if null), opportunities/activities (`?contactId=...`), memos
- import: `getContactTabCounts` from contact actions
- t namespace: `Sales.CustomerContacts.Tabs`

- [ ] **Step 3: type-check + commit**

```bash
pnpm --filter @jarvis/web type-check
git commit -m "feat(p2/sales): add CustomerDetailSidebar + ContactDetailSidebar (4-tab counts + nav)"
```

---

## Task 16 (PR-4): `[id]/edit` RSC 라우트 2개

**Files:**
- Create: `apps/web/app/(app)/sales/customers/[id]/edit/page.tsx`
- Create: `apps/web/app/(app)/sales/customer-contacts/[id]/edit/page.tsx`

- [ ] **Step 1: customers/[id]/edit/page.tsx**

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CustomerEditForm } from "./_components/CustomerEditForm";
import { CustomerDetailSidebar } from "../../_components/CustomerDetailSidebar";
import { getCustomer } from "../../actions";

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const res = await getCustomer({ id });
  if (!res.customer) redirect("/sales/customers?error=not-found");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Customer" title={res.customer.custNm} description={`고객사코드 ${res.customer.custCd}`} />
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <CustomerEditForm customer={res.customer} />
        <CustomerDetailSidebar customerId={res.customer.id} customerName={res.customer.custNm} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: customer-contacts/[id]/edit/page.tsx 동상**

차이:
- props: `contact`, `contactId`, `contactName` (custName)
- sidebar: ContactDetailSidebar with contactId + contact.customerId
- redirect 시 `/sales/customer-contacts?error=not-found`

- [ ] **Step 3: type-check + dev 서버 smoke (라우트 진입)**

```bash
pnpm --filter @jarvis/web type-check
# pnpm --filter @jarvis/web dev → 그리드 행 더블클릭 → /sales/customers/<uuid>/edit 진입 확인
```

- [ ] **Step 4: commit**

```bash
git commit -m "feat(p2/sales): add customers/[id]/edit + customer-contacts/[id]/edit RSC routes"
```

---

## Task 17 (PR-4): Mgr 그리드 `onRowDoubleClick` 핸들러 연결

**Files:**
- Modify: `apps/web/app/(app)/sales/customers/_components/CustomersGridContainer.tsx`
- Modify: `apps/web/app/(app)/sales/customer-contacts/_components/CustomerContactsGridContainer.tsx`

- [ ] **Step 1: CustomersGridContainer**

```tsx
import { useRouter } from "next/navigation";
// ...
export function CustomersGridContainer(props: Props) {
  const router = useRouter();
  // ... 기존 코드

  return (
    <DataGrid<CustomerRow>
      // ... 기존 props
      onRowDoubleClick={(row) => router.push(`/sales/customers/${row.id}/edit`)}
    />
  );
}
```

- [ ] **Step 2: CustomerContactsGridContainer 동상**

`router.push(\`/sales/customer-contacts/${row.id}/edit\`)`.

- [ ] **Step 3: type-check + commit**

```bash
pnpm --filter @jarvis/web type-check
git commit -m "feat(p2/sales): wire grid onRowDoubleClick to navigate to [id]/edit"
```

---

## Task 18 (PR-4): i18n — Sales.*.Edit + e2e

**Files:**
- Modify: `apps/web/messages/ko.json`
- Create: `apps/web/e2e/sales-customers-edit.spec.ts`
- Create: `apps/web/e2e/sales-customer-contacts-edit.spec.ts`

- [ ] **Step 1: ko.json에 Sales.Customers.Edit + Sales.CustomerContacts.Edit 추가**

`Sales.Customers` (line 1040 부근, Memo 옆)에:

```json
"Edit": {
  "title": "고객사 편집",
  "fieldset": "기본정보",
  "fields": {
    "custCd": "고객사코드",
    "custNm": "고객사명",
    "custDivCd": "업종구분",
    "ceoNm": "대표자명",
    "telNo": "전화번호",
    "businessNo": "사업자등록번호",
    "homepage": "홈페이지",
    "addrNo": "우편번호",
    "addr1": "주소",
    "addr2": "상세주소"
  },
  "actions": {
    "save": "저장",
    "delete": "삭제",
    "back": "뒤로가기",
    "deleteConfirm": "삭제하시겠습니까?"
  }
}
```

`Sales.CustomerContacts.Edit` (동상, 컨택 폼 필드):

```json
"Edit": {
  "title": "고객담당자 편집",
  "fieldset": "기본정보",
  "fields": {
    "custName": "고객명",
    "custNm": "고객사명",
    "orgNm": "부서",
    "jikweeNm": "직위",
    "hpNo": "핸드폰",
    "telNo": "전화번호",
    "email": "이메일",
    "statusYn": "재직상태",
    "switComp": "이직회사"
  },
  "actions": { ... 동상 }
}
```

- [ ] **Step 2: customers-edit.spec.ts**

```ts
import { test, expect } from "@playwright/test";

test.describe("sales/customers/[id]/edit", () => {
  test("double-click row navigates to /:id/edit", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("이메일").fill("admin@jarvis.dev");
    await page.getByLabel("비밀번호").fill("admin123");
    await page.getByRole("button", { name: /로그인/i }).click();
    await page.goto("/sales/customers");
    const firstRow = page.locator("tbody tr").first();
    await firstRow.dblclick();
    await expect(page).toHaveURL(/\/sales\/customers\/[0-9a-f-]+\/edit/);
    await expect(page.getByText("기본정보")).toBeVisible();
    await expect(page.getByText(/고객 \d+/)).toBeVisible();  // sidebar 카운트
  });

  test("sidebar [고객] tab navigates to /sales/customer-contacts?customerId=", async ({ page }) => {
    await page.goto("/login");
    // ... login
    await page.goto("/sales/customers");
    await page.locator("tbody tr").first().dblclick();
    await page.getByRole("button", { name: /^고객 \d+$/ }).click();
    await expect(page).toHaveURL(/\/sales\/customer-contacts\?customerId=/);
  });

  test("save updates row + back navigates", async ({ page }) => {
    await page.goto("/login");
    // ... login
    await page.goto("/sales/customers");
    await page.locator("tbody tr").first().dblclick();
    await page.getByLabel("대표자명").fill("e2e CEO");
    await page.getByRole("button", { name: /저장/i }).click();
    await page.getByRole("button", { name: /뒤로가기/i }).click();
    await expect(page).toHaveURL(/\/sales\/customers$/);
  });
});
```

- [ ] **Step 3: customer-contacts-edit.spec.ts (동상)**

차이: 라우트 / 폼 필드 / sidebar [고객사] 탭 클릭 시 `/sales/customers/${customerId}/edit` 이동.

- [ ] **Step 4: e2e + commit**

```bash
pnpm --filter @jarvis/web exec playwright test sales-customers-edit.spec.ts sales-customer-contacts-edit.spec.ts
git commit -m "feat(p2/sales): add Edit i18n + e2e for [id]/edit double-click + sidebar nav"
```

---

## Task 19 (PR-4): 검증 게이트 + PR + spec/plan 삭제

- [ ] **Step 1: 전체 검증 게이트**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test
node scripts/check-schema-drift.mjs --precommit
pnpm audit:rsc
pnpm --filter @jarvis/web exec playwright test
```

- [ ] **Step 2: spec + plan 삭제 (메모리 룰: 머지 직전 disposable 정리)**

```bash
git rm docs/superpowers/specs/2026-05-01-sales-mgmt-p2-tabs-edit-design.md
git rm docs/superpowers/plans/2026-05-01-sales-mgmt-p2-tabs-edit.md
git commit -m "chore(p2): remove disposable spec/plan before PR-4 merge"
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --title "feat(sales): customer/contact master-detail edit + 4-tab sidebar (PR-4)" --body "$(cat <<'EOF'
## Summary
- `sales/customers/[id]/edit` + `sales/customer-contacts/[id]/edit` RSC routes
- `CustomerEditForm` + `ContactEditForm` client islands (legacy `bizActCustCompanyIpt.jsp` / `bizActCustomerIpt.jsp` field parity)
- `CustomerDetailSidebar` + `ContactDetailSidebar` (4-tab count display + navigation)
- DataGrid `onRowDoubleClick` optional non-breaking prop (1-line baseline patch)
- Mgr 그리드 더블클릭 → `[id]/edit` 진입
- P2 server actions에 `customerId` / `contactId` optional 필터 추가 (sidebar [기회]/[활동] 탭 navigation)

## Dependencies
- PR-1 (이 PR과 같은 worktree, 먼저 머지 권장)
- P2 (bold-noether-742a91) ✅ — Task 12에서 P2 schema 의존 코드 활성화

## Test plan
- [x] type-check / lint
- [x] e2e: 더블클릭 진입, sidebar 4탭 카운트, [고객]/[기회]/[활동] 탭 navigation, 저장/삭제/뒤로가기

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage
| Spec § | 매핑 task |
|---|---|
| §3 결정 A2 (Mgr 칩 + edit sidebar) | Task 7 (칩) + Task 15 (sidebar) ✓ |
| §3 결정 B1 (sales_customer_contact_memo 신설) | Task 1 ✓ |
| §3 결정 D1 (RSC + client island + server action) | Task 16 (RSC) + Task 14 (client) ✓ |
| §3 결정 E1 (도메인별 sidebar) | Task 15 (2 컴포넌트) ✓ |
| §3 결정 F1 (PR-1 backend / PR-4 라우트) | Task 1~10 (PR-1) / 11~19 (PR-4) ✓ |
| §4.1 sales_customer_contact_memo schema | Task 1 ✓ |
| §5.1 카운트 SQL | Task 4 ✓ |
| §5.2 메모 트리 빌더 | Task 3 ✓ |
| §5.3 권한 + 본인 검증 | Task 5 (deleteCustomerMemo + isAdmin) ✓ |
| §5.4 audit_log 액션 키 | Task 5 (코드 chunk) ✓ |
| §6.1 카운트 칩 cell | Task 7 ✓ |
| §6.2 MemoModal | Task 7 ✓ |
| §6.3 DetailSidebar | Task 15 ✓ |
| §6.4 EditForm | Task 14 ✓ |
| §6.5 onRowDoubleClick | Task 11 (baseline patch) + Task 17 (wire) ✓ |
| §7 i18n | Task 8 (Memo) + Task 18 (Edit) ✓ |
| §9 unit + e2e | Task 3/9/18 ✓ |
| §14.1 P2 filter 추가 | Task 12 ✓ |
| §14.2 N+1 측정 | Task 6 step 2 ✓ |
| §14.3 user.name LEFT JOIN | Task 5 listCustomerMemos 코드 chunk ✓ |
| §14.4 contact.customerId null 가드 | Task 15 step 2 (disabled prop) ✓ |
| §14.5 본인 검증 e2e | Task 9 (admin + viewer) ✓ |
| §14.6 statusYn boolean 그대로 | Task 14 step 2 (known limitation) ✓ |
| §14.7 ko.json 충돌 검증 | Task 8 step 2 (grep) ✓ |

### Placeholder scan
- "TBD" / "TODO" / "implement later": 없음
- 핵심 코드 chunk: 모든 step에 포함. ContactEditForm / ContactDetailSidebar / customer-contacts MemoModal은 customer 1:1 미러로 명시 (코드 중복 회피).
- "Similar to Task N": 일부 미러 task에 사용했으나 차이점 명시 (필드명, namespace, 라벨).

### Type consistency
- `MemoTreeNode` (Task 2 Zod) ↔ buildMemoTree 반환 (Task 3) ↔ MemoModal props (Task 7) 일관 ✓
- `getCustomerTabCounts` 출력 (Task 4) ↔ Zod (Task 2) ↔ Sidebar setCounts (Task 15) ↔ ko.json `Tabs.{customers,opportunities,activities,memos}` 일관 ✓
- `customerId` / `contactId` uuid 일관 ✓
- baseline `onRowDoubleClick?: (row: T) => void` (Task 11) ↔ Mgr container 사용 (Task 17) 일관 ✓

---

## Execution Handoff

**Plan complete.** 다음 세션에서:

**REQUIRED SUB-SKILL**: `superpowers:subagent-driven-development` — implementer → spec-reviewer → code-quality-reviewer 루프. spec-reviewer 컨텍스트:
- `jarvis-db-patterns` §9 경계면 교차 비교 체크리스트
- `jarvis-i18n` 경계면 검증
- 메모리 `feedback_legacy_ibsheet_hidden_policy.md` (ibSheet ground truth — 본 plan은 카운트 칩 컬럼 추가뿐이라 정책 위반 없음)
- 메모리 `feedback_subagent_worktree.md` (multi-worktree commit 시 cd + branch 검증)

**머지 순서:**
1. **P2 (bold-noether-742a91) 머지 대기** — Task 4·5·6·12·15·17 P2-BLOCKED 부분이 활성화됨
2. PR-1 SDD → 머지
3. PR-4 SDD → 머지 (Task 19 step 2에서 spec/plan 삭제)

**다음 phase**: P3 (계약 도메인 또는 statusYn schema 정정 등 known limitation 정리).
