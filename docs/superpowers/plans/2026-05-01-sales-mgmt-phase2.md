# Sales Mgmt Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 영업관리 P2 — 영업기회 + 영업활동 + 영업기회현황 dashboard 3 페이지 구현. P1 grid baseline 재활용 + Recharts 첫 도입(BarChart + LineChart).

**Architecture:** 12 task 분할. DB schema(1·2) → code_group seed(3) → 라우트 구현(4·5·6) → memo CRUD(7) → dashboard + Recharts(8) → menu/i18n(9) → ETL placeholder(10) → 검증(11) → finishing 사전 검증(12). 파일 변경 순서 20단계(`jarvis-architecture` 스킬) 준수.

**Tech Stack:** Next.js 15 + React 19 / Drizzle ORM / PostgreSQL 16 / **Recharts** (P2 첫 도입) / Vitest + Playwright / next-intl / TailwindCSS 4

**Spec:** [`docs/superpowers/specs/2026-05-01-sales-mgmt-phase2-design.md`](../specs/2026-05-01-sales-mgmt-phase2-design.md)

**Worktree:** `.claude/worktrees/bold-noether-742a91` · branch `claude/bold-noether-742a91` (base = `1e953ad`, P1.5 머지 후 main rebase)

**Dependency:** Task 4의 `EditableNumericCell`은 P1.5 Task 4에서 신설된 컴포넌트 재활용. P1.5 머지 전이면 import 실패 — finishing 단계에서 P1.5 머지 → rebase main → P2 머지 순서.

---

## File Structure

### Created
| 경로 | 책임 |
|---|---|
| `packages/db/schema/sales-opportunity.ts` | TBIZ110 + TBIZ112 (sales_opportunity + sales_opportunity_memo) |
| `packages/db/schema/sales-activity.ts` | TBIZ115 + TBIZ116 (sales_activity + sales_activity_memo) |
| `packages/shared/validation/sales-opportunity.ts` | Zod schema |
| `packages/shared/validation/sales-activity.ts` | Zod schema |
| `apps/web/lib/queries/sales-opportunity.ts` | list/save/dashboard 쿼리 |
| `apps/web/lib/queries/sales-activity.ts` | list/save 쿼리 |
| `apps/web/app/(app)/sales/opportunities/{page.tsx,actions.ts,_components/}` | 영업기회 라우트 |
| `apps/web/app/(app)/sales/opportunities/dashboard/{page.tsx,actions.ts,_components/}` | 영업기회현황 dashboard |
| `apps/web/app/(app)/sales/activities/{page.tsx,actions.ts,_components/}` | 영업활동 라우트 |
| `apps/web/e2e/sales-opportunities.spec.ts` | e2e |
| `apps/web/e2e/sales-activities.spec.ts` | e2e |
| `apps/web/e2e/sales-dashboard.spec.ts` | e2e |

### Modified
| 경로 | 변경 |
|---|---|
| `packages/db/schema/index.ts` | exports 추가 |
| `packages/db/seed/sales-codes.ts` | 12 신규 code_group 추가 |
| `packages/db/seed/menus.ts` | sales 그룹에 3 항목 추가 |
| `packages/shared/constants/permissions.ts` | (변경 없음 — SALES_ALL 재활용) |
| `apps/web/messages/ko.json` | Sales.Opportunities/Activities/Dashboard 추가 |
| `package.json` (apps/web) | recharts dependency 추가 |

### Reference (P1.5 의존)
- `apps/web/components/grid/cells/EditableNumericCell.tsx` (P1.5 Task 4 신설)

---

## Task 1: sales_opportunity + memo schema + 마이그레이션

**Goal:** TBIZ110 35 컬럼 nullable 보존 + TBIZ112 메모 테이블.

**Files:**
- Create: `packages/db/schema/sales-opportunity.ts`
- Modify: `packages/db/schema/index.ts`
- Generated: `packages/db/drizzle/NNNN_*.sql`

- [ ] **Step 1: schema 파일 작성**

`packages/db/schema/sales-opportunity.ts` (spec §4.1 컬럼 모두 — bigint 금액 / nullable text legacy / customer_id FK / sensitivity 미적용):

```ts
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";
import { salesCustomer, salesCustomerContact } from "./sales-customer.js";

export const salesOpportunity = pgTable(
  "sales_opportunity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),

    // legacy lookup
    legacyEnterCd: text("legacy_enter_cd"),
    legacyBizOpCd: text("legacy_biz_op_cd"),
    legacyCustCd: text("legacy_cust_cd"),
    legacyCustMcd: text("legacy_cust_mcd"),
    legacyCustName: text("legacy_cust_name"),

    // core
    bizOpNm: text("biz_op_nm").notNull(),
    customerId: uuid("customer_id").references(() => salesCustomer.id),
    contactId: uuid("contact_id").references(() => salesCustomerContact.id),
    customerName: text("customer_name"),                  // redundant cache (legacy CUST_NM)

    // last delivery (Q7=B nullable 보존만, P3에서 정규화)
    lastDlvCustomerName: text("last_dlv_customer_name"),
    lastDlvCustomerCd: text("last_dlv_customer_cd"),
    lastDlvSeq: text("last_dlv_seq"),

    // codes (12 신규 code_group ↔ varchar text)
    saleTypeCode: text("sale_type_code"),
    bizTypeCode: text("biz_type_code"),
    bizTypeDetailCode: text("biz_type_detail_code"),
    bizOpSourceCode: text("biz_op_source_code"),
    industryCode: text("industry_code"),
    bizStepCode: text("biz_step_code"),
    bizImpCode: text("biz_imp_code"),
    contPerCode: text("cont_per_code"),
    bizAreaCode: text("biz_area_code"),
    bizAreaDetail: text("biz_area_detail"),
    custTypeCode: text("cust_type_code"),
    productTypeCode: text("product_type_code"),           // SALES_PRODUCT_TYPE 재활용 (P1)

    // amounts
    contExpecAmt: bigint("cont_expec_amt", { mode: "number" }),
    contImplPer: numeric("cont_impl_per", { precision: 5, scale: 2 }),
    expecApplyAmt: bigint("expec_apply_amt", { mode: "number" }),

    // dates (Oracle 'YYYYMMDD' 8자 text 보존)
    contExpecYmd: text("cont_expec_ymd"),
    contExpecSymd: text("cont_expec_symd"),
    contExpecEymd: text("cont_expec_eymd"),
    bizStepYmd: text("biz_step_ymd"),

    focusMgrYn: boolean("focus_mgr_yn").default(false).notNull(),
    legacyFileSeq: integer("legacy_file_seq"),            // P3에서 attachment 도메인으로
    memo: text("memo"),
    orgNm: text("org_nm"),

    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    legacyUniq: uniqueIndex("sales_opportunity_legacy_uniq").on(t.workspaceId, t.legacyBizOpCd),
    wsIdx: index("sales_opportunity_ws_idx").on(t.workspaceId),
    wsStepIdx: index("sales_opportunity_ws_step_idx").on(t.workspaceId, t.bizStepCode),  // dashboard BarChart
    wsInsIdx: index("sales_opportunity_ws_ins_idx").on(t.workspaceId, t.insDate),         // 월별 LineChart
  }),
);

export const salesOpportunityMemo = pgTable(
  "sales_opportunity_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    opportunityId: uuid("opportunity_id").notNull().references(() => salesOpportunity.id, { onDelete: "cascade" }),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo").notNull(),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    seqUniq: uniqueIndex("sales_opportunity_memo_seq_uniq").on(t.opportunityId, t.comtSeq),
    oppIdx: index("sales_opportunity_memo_opp_idx").on(t.opportunityId),
  }),
);
```

- [ ] **Step 2: index.ts에 export 추가**

`packages/db/schema/index.ts`:
```ts
export * from "./sales-opportunity.js";
```

- [ ] **Step 3: 마이그레이션 생성**

```bash
cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/bold-noether-742a91
git rev-parse --abbrev-ref HEAD
pnpm --filter @jarvis/db db:generate
```

생성된 SQL 검토 — `CREATE TABLE sales_opportunity` + `CREATE TABLE sales_opportunity_memo` + 인덱스. 의도와 일치 확인.

- [ ] **Step 4: 적용 + drift**

```bash
pnpm --filter @jarvis/db db:migrate
node scripts/check-schema-drift.mjs --precommit
```

- [ ] **Step 5: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 6: commit**

```bash
git add packages/db/schema/sales-opportunity.ts packages/db/schema/index.ts packages/db/drizzle/
git commit -m "feat(p2/db): add sales_opportunity + sales_opportunity_memo (TBIZ110/112)"
```

---

## Task 2: sales_activity + memo schema + 마이그레이션

**Goal:** TBIZ115 영업활동 + TBIZ116 메모.

**Files:**
- Create: `packages/db/schema/sales-activity.ts`
- Modify: `packages/db/schema/index.ts`

- [ ] **Step 1: schema 파일 작성**

`packages/db/schema/sales-activity.ts`:

```ts
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";
import { user } from "./user.js";
import { salesCustomer, salesCustomerContact } from "./sales-customer.js";
import { salesOpportunity } from "./sales-opportunity.js";

export const salesActivity = pgTable(
  "sales_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),

    // legacy lookup
    legacyEnterCd: text("legacy_enter_cd"),
    legacyBizActCd: text("legacy_biz_act_cd"),
    legacyBizOpCd: text("legacy_biz_op_cd"),
    legacyCustCd: text("legacy_cust_cd"),
    legacyCustMcd: text("legacy_cust_mcd"),
    legacyAttSabun: text("legacy_att_sabun"),

    // core
    bizActNm: text("biz_act_nm").notNull(),
    opportunityId: uuid("opportunity_id").references(() => salesOpportunity.id),
    customerId: uuid("customer_id").references(() => salesCustomer.id),
    contactId: uuid("contact_id").references(() => salesCustomerContact.id),

    actYmd: text("act_ymd"),                        // 'YYYYMMDD'
    actTypeCode: text("act_type_code"),             // SALES_ACT_TYPE
    accessRouteCode: text("access_route_code"),     // SALES_ACCESS_ROUTE
    bizStepCode: text("biz_step_code"),             // SALES_BIZ_STEP
    productTypeCode: text("product_type_code"),     // SALES_PRODUCT_TYPE 재활용
    actContent: text("act_content"),

    attendeeUserId: uuid("attendee_user_id").references(() => user.id),
    legacyFileSeq: integer("legacy_file_seq"),      // P3
    memo: text("memo"),

    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    legacyUniq: uniqueIndex("sales_activity_legacy_uniq").on(t.workspaceId, t.legacyBizActCd),
    wsIdx: index("sales_activity_ws_idx").on(t.workspaceId),
    wsOppIdx: index("sales_activity_ws_opp_idx").on(t.workspaceId, t.opportunityId),
    wsActYmdIdx: index("sales_activity_ws_act_ymd_idx").on(t.workspaceId, t.actYmd),
  }),
);

export const salesActivityMemo = pgTable(
  "sales_activity_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    activityId: uuid("activity_id").notNull().references(() => salesActivity.id, { onDelete: "cascade" }),
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),
    memo: text("memo").notNull(),
    insUserId: uuid("ins_user_id").references(() => user.id),
    chkUserId: uuid("chk_user_id").references(() => user.id),
    insDate: timestamp("ins_date", { withTimezone: true }).defaultNow().notNull(),
    chkDate: timestamp("chk_date", { withTimezone: true }),
  },
  (t) => ({
    seqUniq: uniqueIndex("sales_activity_memo_seq_uniq").on(t.activityId, t.comtSeq),
    actIdx: index("sales_activity_memo_act_idx").on(t.activityId),
  }),
);
```

- [ ] **Step 2~5: index.ts export, db:generate, db:migrate, drift, type-check** (Task 1과 동일 절차)

- [ ] **Step 6: commit**

```
git commit -m "feat(p2/db): add sales_activity + sales_activity_memo (TBIZ115/116)"
```

---

## Task 3: 12 신규 code_group seed

**Goal:** 영업기회·활동 코드 컬럼용 12개 code_group + items placeholder. 운영 데이터 추출은 P7 시점.

**Files:**
- Modify: `packages/db/seed/sales-codes.ts`

- [ ] **Step 1: 12 code_group 추가**

기존 `SALES_CODE_GROUPS` 배열에 12개 추가 (P1 패턴 — 01/02/.../99 zero-pad). 핵심:

```ts
{
  code: "SALES_BIZ_STEP",
  name: "영업단계",
  items: [
    { code: "01", name: "발굴" },
    { code: "02", name: "접촉" },
    { code: "03", name: "제안" },
    { code: "04", name: "협상" },
    { code: "05", name: "계약" },
    { code: "06", name: "실패" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_BIZ_IMP",
  name: "영업기회 중요도",
  items: [
    { code: "01", name: "최상" },
    { code: "02", name: "상" },
    { code: "03", name: "중" },
    { code: "04", name: "하" },
  ],
},
{
  code: "SALES_SALE_TYPE",
  name: "판매유형",
  items: [
    { code: "01", name: "직판" },
    { code: "02", name: "간판" },
    { code: "03", name: "OEM" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_BIZ_TYPE",
  name: "사업유형",
  items: [
    { code: "01", name: "신규" },
    { code: "02", name: "갱신" },
    { code: "03", name: "확장" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_BIZ_TYPE_DETAIL",
  name: "사업유형 상세",
  items: [
    { code: "01", name: "라이센스 신규" },
    { code: "02", name: "라이센스 갱신" },
    { code: "03", name: "유지보수" },
    { code: "04", name: "교육" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_BIZ_OP_SOURCE",
  name: "영업기회 출처",
  items: [
    { code: "01", name: "인바운드" },
    { code: "02", name: "아웃바운드" },
    { code: "03", name: "소개" },
    { code: "04", name: "전시/행사" },
    { code: "05", name: "웹사이트" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_INDUSTRY",
  name: "산업구분",
  items: [
    { code: "01", name: "제조" },
    { code: "02", name: "IT/SW" },
    { code: "03", name: "유통/물류" },
    { code: "04", name: "금융" },
    { code: "05", name: "공공기관" },
    { code: "06", name: "의료/제약" },
    { code: "07", name: "건설/부동산" },
    { code: "08", name: "서비스" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_CONT_PER",
  name: "계약가능성",
  items: [
    { code: "01", name: "10%" },
    { code: "02", name: "30%" },
    { code: "03", name: "50%" },
    { code: "04", name: "70%" },
    { code: "05", name: "90%" },
  ],
},
{
  code: "SALES_BIZ_AREA",
  name: "영업지역",
  items: [
    { code: "01", name: "서울" },
    { code: "02", name: "경기" },
    { code: "03", name: "인천" },
    { code: "04", name: "강원" },
    { code: "05", name: "충청" },
    { code: "06", name: "전라" },
    { code: "07", name: "경상" },
    { code: "08", name: "제주" },
    { code: "09", name: "해외" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_CUST_TYPE",
  name: "고객유형",
  items: [
    { code: "01", name: "기존" },
    { code: "02", name: "신규" },
    { code: "03", name: "잠재" },
  ],
},
{
  code: "SALES_ACT_TYPE",
  name: "영업활동 유형",
  items: [
    { code: "01", name: "전화" },
    { code: "02", name: "방문" },
    { code: "03", name: "이메일" },
    { code: "04", name: "회의" },
    { code: "05", name: "제안서 발송" },
    { code: "06", name: "데모" },
    { code: "99", name: "기타" },
  ],
},
{
  code: "SALES_ACCESS_ROUTE",
  name: "접근경로",
  items: [
    { code: "01", name: "직접 방문" },
    { code: "02", name: "전화" },
    { code: "03", name: "온라인" },
    { code: "04", name: "소개" },
    { code: "99", name: "기타" },
  ],
},
```

운영 데이터 추출(P7) 시 `02_data_isu_st.sql` grep으로 실제 사용 코드값 확인 후 갱신.

- [ ] **Step 2: seed 실행 + 확인**

```bash
pnpm --filter @jarvis/db db:seed
psql "$DATABASE_URL" -c "SELECT code, name FROM code_group WHERE code LIKE 'SALES_%' ORDER BY code;"
```

기존 P1 10개 + 신규 12개 = 22개 SALES_* group 확인.

- [ ] **Step 3: commit**

```
git commit -m "feat(p2/seed): add 12 sales code groups (biz_step, biz_imp, sale_type, biz_type, ...)"
```

---

## Task 4: Recharts 의존성 추가

**Goal:** dashboard에서 Recharts 사용 위해 dependency 설치.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml` (자동)

- [ ] **Step 1: 설치**

```bash
cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/bold-noether-742a91
pnpm --filter @jarvis/web add recharts
```

- [ ] **Step 2: 버전 확인**

`apps/web/package.json`의 dependencies에 `"recharts": "^2.x.x"` 추가됨 확인.

- [ ] **Step 3: type-check**

```bash
pnpm --filter @jarvis/web type-check
```

- [ ] **Step 4: commit**

```
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(p2/deps): add recharts for sales dashboard charts"
```

---

## Task 5: sales/opportunities 라우트 + grid

**Goal:** ibSheet ground truth 9 visible 컬럼 grid + memo modal.

**Files:**
- Create: `packages/shared/validation/sales-opportunity.ts`
- Create: `apps/web/lib/queries/sales-opportunity.ts`
- Create: `apps/web/app/(app)/sales/opportunities/page.tsx`
- Create: `apps/web/app/(app)/sales/opportunities/actions.ts`
- Create: `apps/web/app/(app)/sales/opportunities/_components/OpportunitiesGrid.tsx`
- Create: `apps/web/app/(app)/sales/opportunities/_components/useOpportunitiesGridState.ts`
- Test: `apps/web/e2e/sales-opportunities.spec.ts`

- [ ] **Step 1: Zod schema**

`packages/shared/validation/sales-opportunity.ts`:
```ts
import { z } from "zod";

export const opportunityListInput = z.object({
  q: z.string().optional(),
  bizStepCode: z.string().optional(),
  productTypeCode: z.string().optional(),
  focusOnly: z.boolean().optional(),
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(50),
});

export const opportunityRowSchema = z.object({
  id: z.string().uuid(),
  bizOpNm: z.string(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  productTypeCode: z.string().nullable(),
  bizStepCode: z.string().nullable(),
  bizStepYmd: z.string().nullable(),
  orgNm: z.string().nullable(),
  insUserId: z.string().uuid().nullable(),
  insUserName: z.string().nullable(),
  bizOpSourceCode: z.string().nullable(),
  insDate: z.string().datetime(),
});
export type OpportunityRow = z.infer<typeof opportunityRowSchema>;

export const opportunityListOutput = z.object({
  rows: z.array(opportunityRowSchema),
  total: z.number().int(),
});

export const opportunitySaveInput = z.object({
  creates: z.array(opportunityRowSchema.omit({ id: true, insDate: true, insUserName: true })),
  updates: z.array(opportunityRowSchema.partial().extend({ id: z.string().uuid() })),
  deletes: z.array(z.string().uuid()),
});
```

- [ ] **Step 2: queries (server lib)**

`apps/web/lib/queries/sales-opportunity.ts`:
```ts
import "server-only";
import { db, schema, eq, and, count, desc, ilike, sql } from "@jarvis/db";
import type { OpportunityRow } from "@jarvis/shared/validation/sales-opportunity";

export async function listOpportunities(workspaceId: string, params: {
  q?: string; bizStepCode?: string; productTypeCode?: string; focusOnly?: boolean;
  page: number; limit: number;
}): Promise<{ rows: OpportunityRow[]; total: number }> {
  const o = schema.salesOpportunity;
  const u = schema.user;
  const conds = [eq(o.workspaceId, workspaceId)];
  if (params.q) conds.push(ilike(o.bizOpNm, `%${params.q}%`));
  if (params.bizStepCode) conds.push(eq(o.bizStepCode, params.bizStepCode));
  if (params.productTypeCode) conds.push(eq(o.productTypeCode, params.productTypeCode));
  if (params.focusOnly) conds.push(eq(o.focusMgrYn, true));

  const [rows, [c]] = await Promise.all([
    db.select({
      id: o.id,
      bizOpNm: o.bizOpNm,
      customerId: o.customerId,
      customerName: o.customerName,
      productTypeCode: o.productTypeCode,
      bizStepCode: o.bizStepCode,
      bizStepYmd: o.bizStepYmd,
      orgNm: o.orgNm,
      insUserId: o.insUserId,
      insUserName: u.name,
      bizOpSourceCode: o.bizOpSourceCode,
      insDate: o.insDate,
    }).from(o).leftJoin(u, eq(u.id, o.insUserId))
      .where(and(...conds))
      .orderBy(desc(o.insDate))
      .limit(params.limit).offset(params.page * params.limit),
    db.select({ count: count() }).from(o).where(and(...conds)),
  ]);

  return {
    rows: rows.map(r => ({ ...r, insDate: r.insDate.toISOString() })) as OpportunityRow[],
    total: c?.count ?? 0,
  };
}

export async function saveOpportunities(/* ... */) { /* batch transaction + audit_log */ }
```

(saveOpportunities 본문은 P1 `saveCompanies` 패턴 그대로 — creates/updates/deletes 트랜잭션 + audit `sales.opportunity.{create,update,delete}`)

- [ ] **Step 3: actions.ts**

```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { opportunityListInput, opportunityListOutput, opportunitySaveInput } from "@jarvis/shared/validation/sales-opportunity";
import { listOpportunities, saveOpportunities } from "@/lib/queries/sales-opportunity";

export async function listOpportunitiesAction(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.SALES_ALL);
  const input = opportunityListInput.parse(raw);
  const result = await listOpportunities(session.workspaceId, input);
  return opportunityListOutput.parse(result);
}

export async function saveOpportunitiesAction(raw: unknown) {
  const session = await requirePermission(PERMISSIONS.SALES_ALL);
  const input = opportunitySaveInput.parse(raw);
  return saveOpportunities(session.workspaceId, session.userId, input);
}
```

- [ ] **Step 4: useOpportunitiesGridState 훅**

P1 `useCompaniesGridState` 패턴 그대로 (`apps/web/app/(app)/admin/companies/_components/`). generic 타입으로 OpportunityRow 교체.

- [ ] **Step 5: OpportunitiesGrid orchestrator**

P1 `CompaniesGrid` 패턴. ibSheet ground truth (spec §5.1 표) 9 visible 컬럼:

| 컬럼 | width | type | code_group |
|---|---|---|---|
| 영업기회명 (bizOpNm) | 250 | EditableTextCell | — |
| 고객사명 (customerName) | 100 | EditableTextCell (or read-only display + customer popup) | — |
| 제품군 (productTypeCode) | 120 | EditableSelectCell | SALES_PRODUCT_TYPE |
| 영업기회단계 (bizStepCode) | 80 | EditableSelectCell | SALES_BIZ_STEP |
| 영업기회단계 변경일 (bizStepYmd) | 100 | EditableDateCell | — |
| 담당부서 (orgNm) | 100 | EditableTextCell | — |
| 영업담당 (insUserName) | 60 | display only | — |
| 영업기회출처 (bizOpSourceCode) | 200 | EditableSelectCell | SALES_BIZ_OP_SOURCE |
| 등록일자 (insDate) | 100 | EditableDateCell read-only | — |

스키마는 35 컬럼이지만 grid columns 배열엔 9개만. 사용자별 컬럼 visibility는 P3+에서.

- [ ] **Step 6: page.tsx (RSC)**

```tsx
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { listOpportunitiesAction } from "./actions";
import { OpportunitiesGrid } from "./_components/OpportunitiesGrid";
import { listCodeItems } from "@/lib/queries/code";

export default async function OpportunitiesPage() {
  await requirePermission(PERMISSIONS.SALES_ALL);
  const [data, codes] = await Promise.all([
    listOpportunitiesAction({ page: 0, limit: 50 }),
    listCodeItems(["SALES_PRODUCT_TYPE", "SALES_BIZ_STEP", "SALES_BIZ_OP_SOURCE"]),
  ]);
  return <OpportunitiesGrid initial={data} codes={codes} />;
}
```

- [ ] **Step 7: e2e**

`apps/web/e2e/sales-opportunities.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("opportunities grid CRUD", async ({ page }) => {
  await page.goto("/sales/opportunities");
  await expect(page.getByRole("heading", { name: /영업기회/i })).toBeVisible();
  // [입력] 버튼 → 새 행 추가 → 영업기회명 입력 → [저장]
  await page.getByRole("button", { name: /입력/i }).click();
  await page.getByRole("textbox").first().fill("E2E 테스트 영업기회");
  await page.getByRole("button", { name: /저장/i }).click();
  await expect(page.getByText("E2E 테스트 영업기회")).toBeVisible();
});
```

- [ ] **Step 8: 검증**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm audit:rsc
pnpm --filter @jarvis/web exec playwright test sales-opportunities.spec.ts
```

- [ ] **Step 9: commit**

```
git commit -m "feat(p2/sales): add opportunities grid (TBIZ110, ibSheet 9 visible columns)"
```

---

## Task 6: sales/activities 라우트 + grid

**Goal:** TBIZ115 영업활동 grid. opportunityId FK + bizOpCd 필터.

**Files:**
- Create: `packages/shared/validation/sales-activity.ts`
- Create: `apps/web/lib/queries/sales-activity.ts`
- Create: `apps/web/app/(app)/sales/activities/{page.tsx, actions.ts, _components/}`
- Test: `apps/web/e2e/sales-activities.spec.ts`

- [ ] **Step 1**: 영업활동 ibSheet ground truth 추출

```bash
grep -n "Hidden:" .local/영업관리모듈/jsp_biz/biz/activity/bizActMgr/bizActMgr.jsp | head -30
```

Hidden:0 컬럼 식별 후 spec §5.1 영업활동 표 갱신 (plan 단계 deferred — 본 step에서 채우기). 추정:
- bizActNm, opportunityId(or bizOpCd), customerName, actYmd, actTypeCode, accessRouteCode, attendeeUserName, bizStepCode, productTypeCode, insDate

- [ ] **Step 2~7**: Task 5와 동일 패턴 (validation → queries → actions → grid → page.tsx → e2e)

핵심 차이: filter `bizOpCd`(영업기회 ID) — 영업기회 grid에서 row click 시 query param으로 활동 grid 진입 가능 (옵션, 본 task엔 무관)

- [ ] **Step 8: commit**

```
git commit -m "feat(p2/sales): add activities grid (TBIZ115, opportunity FK + biz_op filter)"
```

---

## Task 7: 영업기회/활동 memo CRUD

**Goal:** sales_opportunity_memo / sales_activity_memo 메모 추가/조회 (modal 또는 row expand).

**Files:**
- Modify: `apps/web/app/(app)/sales/opportunities/actions.ts` (memo CRUD 추가)
- Modify: `apps/web/app/(app)/sales/activities/actions.ts` (memo CRUD 추가)
- Create: `apps/web/app/(app)/sales/opportunities/_components/MemoModal.tsx`
- Create: `apps/web/app/(app)/sales/activities/_components/MemoModal.tsx`

- [ ] **Step 1**: MemoModal client component (둘 다 공통 패턴)
- [ ] **Step 2**: actions에 listMemos / saveMemos / deleteMemo 추가 (audit `sales.opportunity.memo.*`, `sales.activity.memo.*`)
- [ ] **Step 3**: grid row에 [메모] 버튼 추가 → modal open → 메모 list + add
- [ ] **Step 4**: 검증 + commit

```
git commit -m "feat(p2/sales): add memo CRUD for opportunities + activities"
```

---

## Task 8: sales/opportunities/dashboard + Recharts

**Goal:** KPI 카드 4 + 단계별 BarChart + 월별 신규 LineChart.

**Files:**
- Create: `apps/web/app/(app)/sales/opportunities/dashboard/page.tsx`
- Create: `apps/web/app/(app)/sales/opportunities/dashboard/actions.ts`
- Create: `apps/web/app/(app)/sales/opportunities/dashboard/_components/KPICards.tsx`
- Create: `apps/web/app/(app)/sales/opportunities/dashboard/_components/StepDistributionChart.tsx`
- Create: `apps/web/app/(app)/sales/opportunities/dashboard/_components/MonthlyNewChart.tsx`
- Test: `apps/web/e2e/sales-dashboard.spec.ts`

- [ ] **Step 1: queries — getOpportunityDashboard**

`apps/web/lib/queries/sales-opportunity.ts`에 추가:
```ts
export async function getOpportunityDashboard(workspaceId: string) {
  const o = schema.salesOpportunity;
  const [kpis, byStep, monthlyNew] = await Promise.all([
    db.select({
      total: count(),
      inProgressAmt: sql<number>`SUM(CASE WHEN ${o.bizStepCode} NOT IN ('05','06') THEN COALESCE(${o.contExpecAmt}, 0) ELSE 0 END)`,
      monthNew: sql<number>`COUNT(*) FILTER (WHERE ${o.insDate} >= DATE_TRUNC('month', NOW()))`,
      focus: sql<number>`COUNT(*) FILTER (WHERE ${o.focusMgrYn} = true)`,
    }).from(o).where(eq(o.workspaceId, workspaceId)).then(r => r[0]),

    db.select({
      stepCode: o.bizStepCode,
      cnt: count(),
    }).from(o).where(eq(o.workspaceId, workspaceId))
      .groupBy(o.bizStepCode),

    db.select({
      ym: sql<string>`TO_CHAR(${o.insDate}, 'YYYY-MM')`,
      cnt: count(),
    }).from(o).where(and(
      eq(o.workspaceId, workspaceId),
      sql`${o.insDate} >= NOW() - INTERVAL '6 months'`,
    )).groupBy(sql`TO_CHAR(${o.insDate}, 'YYYY-MM')`).orderBy(sql`TO_CHAR(${o.insDate}, 'YYYY-MM')`),
  ]);

  return { kpis, byStep, monthlyNew };
}
```

- [ ] **Step 2: actions.ts**

```ts
"use server";
import { requirePermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { getOpportunityDashboard } from "@/lib/queries/sales-opportunity";

export async function getDashboardAction() {
  const session = await requirePermission(PERMISSIONS.SALES_ALL);
  return getOpportunityDashboard(session.workspaceId);
}
```

- [ ] **Step 3: KPICards (client component)**

`apps/web/app/(app)/sales/opportunities/dashboard/_components/KPICards.tsx`:
```tsx
"use client";
type Props = {
  kpis: { total: number; inProgressAmt: number; monthNew: number; focus: number };
};

export function KPICards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <KPI label="전체 영업기회" value={kpis.total.toLocaleString("ko-KR")} />
      <KPI label="진행 중 예상금액" value={`₩${(kpis.inProgressAmt / 1e8).toFixed(1)}억`} />
      <KPI label="이번달 신규" value={kpis.monthNew.toLocaleString("ko-KR")} />
      <KPI label="집중관리" value={kpis.focus.toLocaleString("ko-KR")} />
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: StepDistributionChart (client, Recharts)**

```tsx
"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  data: { stepCode: string | null; stepName: string; cnt: number }[];
};

export function StepDistributionChart({ data }: Props) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">단계별 영업기회 분포</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="stepName" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Bar dataKey="cnt" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 5: MonthlyNewChart (client, Recharts)**

```tsx
"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  data: { ym: string; cnt: number }[];
};

export function MonthlyNewChart({ data }: Props) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">월별 신규 영업기회</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="ym" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="cnt" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: page.tsx (RSC + step name lookup)**

```tsx
import { getDashboardAction } from "./actions";
import { KPICards } from "./_components/KPICards";
import { StepDistributionChart } from "./_components/StepDistributionChart";
import { MonthlyNewChart } from "./_components/MonthlyNewChart";
import { listCodeItems } from "@/lib/queries/code";

export default async function DashboardPage() {
  const [data, codes] = await Promise.all([
    getDashboardAction(),
    listCodeItems(["SALES_BIZ_STEP"]),
  ]);

  const stepLookup = new Map(codes.SALES_BIZ_STEP.map(c => [c.code, c.name]));
  const byStepWithNames = data.byStep.map(b => ({
    stepCode: b.stepCode,
    stepName: b.stepCode ? (stepLookup.get(b.stepCode) ?? b.stepCode) : "(미설정)",
    cnt: b.cnt,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">영업기회현황</h1>
      <KPICards kpis={data.kpis} />
      <div className="grid grid-cols-2 gap-4">
        <StepDistributionChart data={byStepWithNames} />
        <MonthlyNewChart data={data.monthlyNew} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: e2e smoke**

`apps/web/e2e/sales-dashboard.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("opportunities dashboard renders KPI + 2 charts", async ({ page }) => {
  await page.goto("/sales/opportunities/dashboard");
  await expect(page.getByRole("heading", { name: /영업기회현황/i })).toBeVisible();
  await expect(page.getByText(/전체 영업기회/i)).toBeVisible();
  await expect(page.getByText(/단계별 영업기회 분포/i)).toBeVisible();
  await expect(page.getByText(/월별 신규 영업기회/i)).toBeVisible();
});
```

- [ ] **Step 8: audit:rsc 필수**

```bash
pnpm audit:rsc
```

Recharts 컴포넌트가 'use client'로 정확히 분리됐는지 검증.

- [ ] **Step 9: commit**

```
git commit -m "feat(p2/sales): add opportunities dashboard with Recharts (KPI + step distribution + monthly new)"
```

---

## Task 9: menu seed + i18n 갱신

**Files:**
- Modify: `packages/db/seed/menus.ts`
- Modify: `apps/web/messages/ko.json`

- [ ] **Step 1: menus.ts**

sales 그룹에 3 항목 추가:
```ts
{ slug: "sales/opportunities", label: "영업기회", parent: "sales", order: 100 },
{ slug: "sales/activities", label: "영업활동", parent: "sales", order: 110 },
{ slug: "sales/opportunities/dashboard", label: "영업기회현황", parent: "sales", order: 120 },
```

권한 매핑: `SALES_ALL` (P1 일관).

- [ ] **Step 2: seed 재실행**

```bash
pnpm --filter @jarvis/db db:seed
```

- [ ] **Step 3: ko.json 갱신**

새 네임스페이스:
```json
{
  "Sales": {
    "Opportunities": {
      "title": "영업기회",
      "description": "영업기회를 관리하고 단계별로 추적합니다.",
      "columns": {
        "bizOpNm": "영업기회명",
        "customerName": "고객사명",
        "productType": "제품군",
        "bizStep": "영업기회단계",
        "bizStepYmd": "단계 변경일",
        "orgNm": "담당부서",
        "insName": "영업담당",
        "bizOpSource": "영업기회출처",
        "insdate": "등록일자"
      },
      "actions": {
        "memo": "메모",
        "openActivities": "활동 보기"
      }
    },
    "Activities": {
      "title": "영업활동",
      "description": "고객 접촉 및 활동을 기록합니다.",
      "columns": { "bizActNm": "활동명", "actYmd": "활동일", "actType": "유형", "accessRoute": "접근경로", "attendee": "참석자", "actContent": "내용", "insdate": "등록일자" }
    },
    "Dashboard": {
      "title": "영업기회현황",
      "kpis": {
        "total": "전체 영업기회",
        "inProgressAmt": "진행 중 예상금액",
        "monthNew": "이번달 신규",
        "focus": "집중관리"
      },
      "charts": {
        "stepDistribution": "단계별 영업기회 분포",
        "monthlyNew": "월별 신규 영업기회"
      }
    }
  },
  "Nav": {
    "sales": {
      "opportunities": "영업기회",
      "activities": "영업활동",
      "dashboard": "영업기회현황"
    }
  }
}
```

`jarvis-i18n` 스킬 경계면 검증 — 모든 `t("Sales.Opportunities.*")` 호출이 ko.json 경로와 일치, 보간 변수 일치.

- [ ] **Step 4: type-check + 개발 서버 smoke**

```bash
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web dev   # 별도 터미널, 메뉴 트리 접속
```

- [ ] **Step 5: commit**

```
git commit -m "feat(p2): add menu items + ko.json (Sales.Opportunities/Activities/Dashboard)"
```

---

## Task 10: ETL placeholder (P1.5와 동일 정책)

**Goal:** 운영 데이터 ETL placeholder. 본격 작성은 P7 별도 plan.

**Files:**
- Create: `scripts/etl/sales/README.md` (이미 P1.5에 있으면 추가만)
- Create: `.local/etl/sales/.gitkeep` (운영 데이터 위치, .gitignored 자동)

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p scripts/etl/sales/transform
mkdir -p .local/etl/sales/{extracted,transformed,logs}
```

P1.5 머지 후엔 이미 존재 — 본 task는 idempotent.

- [ ] **Step 2: README 갱신 (P2 도메인 추가)**

`scripts/etl/sales/README.md`에 P2 도메인 transform 파일 추가 명시:
```
transform/
  tbiz110-to-sales-opportunity.ts   # P2
  tbiz112-to-sales-opportunity-memo.ts
  tbiz115-to-sales-activity.ts
  tbiz116-to-sales-activity-memo.ts
```

본격 ETL 코드는 P7. P2엔 placeholder + spec/handoff에 정책 명시.

- [ ] **Step 3: commit**

```
git add scripts/etl/sales/
git commit -m "docs(p2/etl): note P2 domains in sales ETL placeholder (TBIZ110/112/115/116)"
```

---

## Task 11: 검증 게이트 + e2e 통과

**Goal:** 모든 게이트 통과.

- [ ] **Step 1: type-check + lint 전체**

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

- [ ] **Step 4: audit:rsc (Recharts client 경계 중요)**

```bash
pnpm audit:rsc
```

- [ ] **Step 5: e2e 전체**

```bash
pnpm --filter @jarvis/web exec playwright test
```

특히:
- `sales-opportunities.spec.ts`
- `sales-activities.spec.ts`
- `sales-dashboard.spec.ts`
- 기존 P1 e2e 회귀 없음 (`admin-companies.spec.ts`, `sales-customers.spec.ts`)

- [ ] **Step 6: 실패 시 systematic-debugging**

`superpowers:systematic-debugging` 따라 우회 금지, 근본 원인.

---

## Task 12: P1.5 머지 후 main rebase + finishing 사전

**Goal:** P1.5 PR이 main에 머지된 후 P2 worktree base를 main으로 rebase.

- [ ] **Step 1: P1.5 머지 확인**

```bash
git fetch origin main
git log origin/main --oneline -10 | grep -i "p1.5\|infra/licenses\|product-cost-mapping"
```

P1.5 머지 commit 존재 확인.

- [ ] **Step 2: rebase main**

```bash
cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/bold-noether-742a91
git rev-parse --abbrev-ref HEAD   # claude/bold-noether-742a91 검증
git rebase origin/main
```

충돌 가능성 (낮음):
- `packages/db/schema/index.ts` exports — sales-license 제거 + sales-opportunity/activity 추가가 같은 파일
- `apps/web/messages/ko.json` — Sales.Licenses 제거 + Sales.Opportunities 추가
- `packages/db/seed/menus.ts` — sales/licenses 제거 + admin/infra/licenses + sales/product-cost-mapping + sales/opportunities/activities/dashboard

해결: 의도된 변경 모두 유지(병합).

- [ ] **Step 3: rebase 후 검증 게이트 재실행**

```bash
pnpm --filter @jarvis/db db:migrate    # P1.5 마이그레이션 + P2 마이그레이션 합쳐 적용
pnpm --filter @jarvis/web type-check
pnpm test
node scripts/check-schema-drift.mjs --precommit
```

- [ ] **Step 4: EditableNumericCell 의존 확인**

P1.5에서 신설된 `apps/web/components/grid/cells/EditableNumericCell.tsx`이 main에 있는지 확인. P2 grid 어디서 사용 중인지 (영업기회·활동·dashboard에 금액 컬럼이 grid에 노출되지 않아 사실 P2 grid는 사용 안 할 수도. 단 spec §11.4에 P1.5 선반입 명시 — P2 hidden 컬럼이 노출되면 사용).

P2 grid 9 visible 컬럼엔 금액 없음 (Hidden:1) — 사실 P2엔 EditableNumericCell 직접 사용 X. dashboard KPI는 displayonly. 하지만 P1.5 신설 컴포넌트가 main에 있는지만 확인.

- [ ] **Step 5: P2 spec/plan disposable 삭제 commit**

```bash
git rm docs/superpowers/specs/2026-05-01-sales-mgmt-phase2-design.md
git rm docs/superpowers/plans/2026-05-01-sales-mgmt-phase2.md
git commit -m "chore(p2): remove disposable spec/plan before merge"
```

- [ ] **Step 6: PR 작성 (finishing-a-development-branch에 위임)**

`superpowers:finishing-a-development-branch` 스킬 진입. PR body 자동 생성, main 머지 후 worktree 폐기.

---

## Operational Data Migration (ETL) — P1.5와 동일 정책

본 plan §10 placeholder 참조. P1.5 plan의 "Operational Data Migration" 섹션과 100% 일관:
- 코드: `scripts/etl/sales/` git tracked
- 데이터: `.local/etl/sales/` git ignored
- 본격 ETL: P7 별도 plan

P2 도메인 추가:
- `tbiz110-to-sales-opportunity.ts` (영업기회 본체)
- `tbiz112-to-sales-opportunity-memo.ts`
- `tbiz115-to-sales-activity.ts`
- `tbiz116-to-sales-activity-memo.ts`

운영 데이터 0건 가정 P1.5와 동일. non-zero면 사용자 확인 후 backfill 마이그레이션 별도 task.

---

## Self-Review

### Spec coverage
| Spec § | 매핑 task |
|---|---|
| §4.1 sales_opportunity + memo schema | Task 1 ✓ |
| §4.2 sales_activity + memo schema | Task 2 ✓ |
| §4.2 12 신규 code_group | Task 3 ✓ |
| §5.1 ibSheet ground truth 9 visible | Task 5 step 5 ✓ (영업활동은 Task 6 step 1에서 추출) |
| §5.2 EditableNumericCell P1.5 선반입 | Task 12 step 4 (P1.5 머지 의존, P2 grid는 직접 사용 X) ✓ |
| §5.3 dashboard KPI 4 + 2 charts | Task 8 ✓ |
| §6 server actions | Task 5/6/7/8 ✓ |
| §7 audit | Task 5/6/7 actions에 명시 ✓ |
| §8 i18n | Task 9 ✓ |
| §9 tests | Task 5/6/8/11 ✓ |

### Placeholder scan
- "TBD"/"TODO": 없음
- 영업활동 ibSheet ground truth: Task 6 step 1에서 grep으로 추출(implementer가 채움) — 의도된 deferred, plan 작성 단계에선 spec §5.1 표가 영업기회만이라 P2 plan 단계도 영업기회만 명시.
- saveOpportunities 본문: Task 5 step 2에서 P1 saveCompanies 패턴 참조로 표현 — implementer가 P1 코드 read 후 작성. 약간 placeholder 성격이지만 명확한 reference.

### Type consistency
- `OpportunityRow` (Task 5 Zod) ↔ queries return ↔ Grid props 일관 ✓
- `bizStepCode` 컬럼명 (schema/queries/UI 모두) ✓
- `productTypeCode` ↔ SALES_PRODUCT_TYPE code_group ✓

---

## Execution Handoff

**Plan complete.** P1.5와 동일 패턴 — SDD 진입 시 implementer에 명시:
1. `cd /c/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/bold-noether-742a91`
2. `git rev-parse --abbrev-ref HEAD` → `claude/bold-noether-742a91`
3. plan §Task N 정독 후 step-by-step
4. commit 직전 다시 cd + branch 검증

**REQUIRED SUB-SKILL**: `superpowers:subagent-driven-development` — implementer → spec-reviewer → code-quality-reviewer 루프. spec-reviewer 컨텍스트:
- `jarvis-db-patterns` §9 경계면 교차 비교
- `jarvis-i18n` 경계면 검증
- 메모리 `feedback_legacy_ibsheet_hidden_policy.md` (ibSheet ground truth)
- 메모리 `feedback_subagent_worktree.md` (multi-worktree commit)

**머지 순서 의존**: P1.5 PR 먼저 main 머지 → P2 worktree rebase main → P2 PR 머지. Task 12에 명시.

**다음 phase**: P3 (계약 도메인 + MISSING 프로시저 2건). P2 finishing 시 P3 handoff 작성.
