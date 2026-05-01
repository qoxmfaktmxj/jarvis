# Sales Mgmt P2 — Detail Sidebar 4-Tabs + Master-Detail Edit (Design Spec)

> **Disposable note (per memory rule).** 이 spec은 본 작업이 main에 머지되면 삭제된다. plan(`docs/superpowers/plans/2026-05-01-sales-mgmt-p2-tabs-edit.md`)은 spec을 task로 분해한다.

**Worktree:** `.claude/worktrees/angry-ishizaka-2c55af` · branch `claude/angry-ishizaka-2c55af` (base = main, ahead 0/0 at d587c7e)

**범위:** PR-1 (사이드바 4탭 backend + Mgr 카운트 칩) + PR-4 (master-detail edit pages + sidebar 통합) — `sales/customers` + `sales/customer-contacts` 두 도메인.

**비범위:**
- 영업기회/활동 grid·메모·dashboard — **P2 plan(`bold-noether-742a91`) 책임**
- admin/infra/licenses + 22 boolean grid + issueLicenseKey — **P1.5 plan(`eager-ritchie-9f4a82`) 책임**
- DataGrid baseline 인프라(`DataGridToolbar`, `useUrlFilters`, `validateDuplicateKeys`, `onRowDoubleClick` prop) — **festive-faraday-d0c615 baseline 책임**, 본 spec은 _사용만_

---

## 1. 시작 조건 (Pre-merge dependencies)

**4 PR 모두 main 머지 후 SDD 진입:**

| 워크트리 | 책임 | main 머지 상태 (2026-05-01 d587c7e 기준) |
|---|---|---|
| `festive-faraday-d0c615` | DataGrid baseline (toolbar/url-filters/dup-validate/dblClick) | ✅ 머지됨 (1d00db7 추정) |
| `eager-ritchie-9f4a82` | P1.5: sales-license drop + admin/infra/licenses + product-cost-mapping + mail-persons 보강 + 4 grid Hidden 정책 | ⏳ **대기** |
| `bold-noether-742a91` | P2: sales_opportunity + sales_activity 스키마/grid/dashboard + memo modal | ⏳ **대기** |
| `quirky-merkle-d9c2f2` | P2-A: 5 화면 baseline 적용 | ✅ 머지됨 (45bd8fb) |

본 spec은 P1.5(grid Hidden 정책 + insdate)·P2(`sales_opportunity.contact_id`·`sales_activity.contact_id` FK)에 강하게 의존. 머지 전엔 type-check 실패. **머지 신호 받기 전 SDD 절대 진입 금지.**

---

## 2. 핵심 의존 매트릭스 (P1.5 + P2 + baseline)

| 본 spec이 사용 | 출처 |
|---|---|
| `sales_customer_memo` (이미 존재, comtSeq + priorComtSeq) | P1 (현재 main) |
| `sales_customer_contact_memo` (**본 spec 신설**) | 본 spec Task 1 |
| `sales_opportunity` (customerId + contactId FK) | P2 Task 1 |
| `sales_activity` (customerId + contactId FK) | P2 Task 2 |
| `sales/customers` Mgr grid (Hidden 정책 + insdate 컬럼) | P1.5 Task 9 |
| `sales/customer-contacts` Mgr grid (Hidden 정책 + insdate) | P1.5 Task 9 |
| `DataGrid` baseline + `onRowDoubleClick` prop | festive-faraday baseline |
| `SALES_ALL` 권한 | P1 (현재 main, 재활용) |
| 메모 modal 디자인 패턴 | **P2 Task 7 MemoModal** (참조) |

**P2 MemoModal 참조:** P2가 `sales/opportunities/_components/MemoModal.tsx`와 `sales/activities/_components/MemoModal.tsx`를 신설한다. 본 spec의 `customers/_components/MemoModal.tsx`와 `customer-contacts/_components/MemoModal.tsx`는 P2 머지본의 컴포넌트 시그니처를 1:1 미러링해서 일관성 유지(컴포넌트 자체는 도메인별 server action을 호출하므로 별 파일).

---

## 3. 결정 사항 (사용자 승인 완료, 변경 금지)

| 결정 | 선택 | 사유 |
|---|---|---|
| **A. 사이드바 4탭 트리거** | A2: Mgr=카운트 칩 컬럼만, edit=우측 인라인 sidebar 4탭 | Mgr는 다량 스캔 / detail은 edit 페이지로 분리. 레거시 80% 충실 + Jarvis 단순도 우선 |
| **B. customer-contacts 메모 테이블** | B1: `sales_customer_contact_memo` 신설 | 레거시 별 endpoint(`getBizActCustomerCommentList` ↔ `getBizActCustCompanyCommentList`)는 별 테이블. 폴리모픽 회피 |
| **D. [id]/edit 라우트 형태** | D1: RSC page → 초기 fetch → client form island → server action save | P1.5 admin/infra/licenses 패턴 일관 |
| **E. Sidebar 컴포넌트 위치** | E1: 도메인별 (`CustomerDetailSidebar`, `ContactDetailSidebar`) | 탭 라벨·카운트 source 다름. over-engineering 회피 |
| **F. PR-1 vs PR-4 분할** | F1: PR-1=backend + 카운트 칩, PR-4=라우트 + sidebar 통합 | 인터페이스 안정 후 통합 |

---

## 4. 데이터 모델 (스키마 변경)

### 4.1 신설 — `sales_customer_contact_memo`

```ts
// packages/db/schema/sales-customer.ts (기존 파일에 append)
export const salesCustomerContactMemo = pgTable(
  "sales_customer_contact_memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    contactId: uuid("contact_id").notNull(),  // → salesCustomerContact.id (cascade delete)
    comtSeq: integer("comt_seq").notNull(),
    priorComtSeq: integer("prior_comt_seq"),  // 0=마스터 의견, >0=답글 (priorComtSeq → 부모 comtSeq)
    memo: text("memo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),  // → user.id (의견 작성자, 본인만 삭제)
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    wsContactIdx: index("sales_customer_contact_memo_ws_contact_idx").on(t.workspaceId, t.contactId),
    seqUniq: uniqueIndex("sales_customer_contact_memo_seq_uniq").on(t.workspaceId, t.contactId, t.comtSeq),
  }),
);
```

**일관성**: `salesCustomerMemo`(P1)와 컬럼 이름·인덱스 이름 컨벤션 1:1 미러. `priorComtSeq=0`은 마스터 의견, `>0`은 해당 마스터의 답글(2-레벨 트리, 대댓글 X — 레거시 충실).

**FK 정책**: 애플리케이션 레벨 cascade delete (P1 패턴 — DB 레벨 FK 선언은 일부 스키마만, 트리 cascade는 server action 트랜잭션에서 수행).

### 4.2 기존 — `sales_customer_memo` (P1, 변경 없음)

이미 `customer_id` + `comt_seq` + `prior_comt_seq` 보유. PR-1은 _기존 테이블만 사용_, 스키마 변경 없음.

---

## 5. Server Actions (PR-1 책임)

`apps/web/app/(app)/sales/customers/actions.ts` (기존 파일 확장):

| Action | 입력 | 출력 |
|---|---|---|
| `getCustomerTabCounts({ customerId })` | `{ customerId: uuid }` | `{ customerCnt, opCnt, actCnt, comtCnt }: number×4` |
| `listCustomerMemos({ customerId })` | `{ customerId: uuid }` | `{ rows: MemoTreeNode[] }` |
| `createCustomerMemo({ customerId, priorComtSeq, memo })` | … | `{ ok, comtSeq }` |
| `deleteCustomerMemo({ customerId, comtSeq })` | … | `{ ok }` (본인 검증 — `created_by = session.userId`) |

`apps/web/app/(app)/sales/customer-contacts/actions.ts` (기존 파일 확장):

| Action | 입력 | 출력 |
|---|---|---|
| `getContactTabCounts({ contactId })` | … | `{ custCompanyCnt: 0\|1, opCnt, actCnt, comtCnt }` |
| `listContactMemos({ contactId })` | … | `{ rows: MemoTreeNode[] }` |
| `createContactMemo({ contactId, priorComtSeq, memo })` | … | `{ ok, comtSeq }` |
| `deleteContactMemo({ contactId, comtSeq })` | … | `{ ok }` |

### 5.1 카운트 SQL (서버 헬퍼 `apps/web/lib/queries/sales-tabs.ts` 신설)

```ts
// PR-1: getCustomerTabCounts(workspaceId, customerId)
const [customerCnt, opCnt, actCnt, comtCnt] = await Promise.all([
  db.select({ c: count() }).from(salesCustomerContact)
    .where(and(eq(salesCustomerContact.workspaceId, workspaceId),
               eq(salesCustomerContact.customerId, customerId))).then(r => r[0]?.c ?? 0),
  db.select({ c: count() }).from(salesOpportunity)
    .where(and(eq(salesOpportunity.workspaceId, workspaceId),
               eq(salesOpportunity.customerId, customerId))).then(r => r[0]?.c ?? 0),
  db.select({ c: count() }).from(salesActivity)
    .where(and(eq(salesActivity.workspaceId, workspaceId),
               eq(salesActivity.customerId, customerId))).then(r => r[0]?.c ?? 0),
  db.select({ c: count() }).from(salesCustomerMemo)
    .where(and(eq(salesCustomerMemo.workspaceId, workspaceId),
               eq(salesCustomerMemo.customerId, customerId))).then(r => r[0]?.c ?? 0),
]);
```

`getContactTabCounts`는 `salesOpportunity.contactId` / `salesActivity.contactId` (P2 머지본 의존). `custCompanyCnt`는 contact row 자체의 `customerId` 필드 존재 여부로 결정 (1 또는 0).

### 5.2 메모 트리 빌드

```ts
type MemoTreeNode = {
  comtSeq: number;
  memo: string;
  authorName: string;        // user.name lookup
  insdate: string;            // 'YYYY-MM-DD HH:mm'
  isOwn: boolean;             // created_by === session.userId
  replies: MemoTreeNode[];    // priorComtSeq === this.comtSeq인 것들
};

// listCustomerMemos returns flat → server에서 tree로 변환
// priorComtSeq === 0 → 마스터, !=0 → 해당 마스터의 reply
```

서버에서 트리 빌드 후 반환. UI는 그대로 렌더 (재구성 X).

### 5.3 권한 + 사용자 검증

- 모든 server actions: `requirePermission(PERMISSIONS.SALES_ALL)` (P1 일관)
- `deleteCustomerMemo` / `deleteContactMemo`: 추가로 `created_by = session.userId` WHERE 절 → 본인 작성건만 삭제. ADMIN_ALL은 우회 가능 (`isAdmin(session)`).

### 5.4 audit_log

| Action | audit `action` 키 | resourceType |
|---|---|---|
| createCustomerMemo | `sales.customer.memo.create` | `sales_customer_memo` |
| deleteCustomerMemo | `sales.customer.memo.delete` | `sales_customer_memo` |
| createContactMemo | `sales.customer_contact.memo.create` | `sales_customer_contact_memo` |
| deleteContactMemo | `sales.customer_contact.memo.delete` | `sales_customer_contact_memo` |

count 함수는 mutation 아니므로 audit 안 남김.

---

## 6. UI 컴포넌트 (PR-1 + PR-4 분할)

### 6.1 PR-1: 카운트 칩 컬럼 cell

`apps/web/components/grid/cells/CountChipsCell.tsx` (또는 도메인 wrapper에 inline. baseline 미수정 위해 도메인 wrapper에서 ColumnDef render hook으로 처리):

```tsx
type Props = {
  counts: { customer?: number; op: number; act: number; comt: number };
};

export function CountChipsCell({ counts }: Props) {
  return (
    <div className="flex gap-1 text-[11px]">
      {counts.customer != null && <Chip label={`고객 ${counts.customer}`} />}
      <Chip label={`기회 ${counts.op}`} />
      <Chip label={`활동 ${counts.act}`} />
      <Chip label={`의견 ${counts.comt}`} />
    </div>
  );
}
```

**구현 방식**: Mgr server action `listCustomers` / `listCustomerContacts` 응답에 카운트 4개를 컬럼으로 포함시킴 (Promise.all 병렬). row당 4 sub-query 발생 — 50개 row × 4 = 200 query. 성능 우려 시 LATERAL JOIN 또는 별도 batch endpoint 검토(P3+).

**PR-1 책임**: server action 응답 shape에 counts 추가 + DataGrid `ColumnDef.render` prop으로 CountChipsCell 렌더. baseline DataGrid 미수정.

### 6.2 PR-1: 도메인별 MemoModal

`apps/web/app/(app)/sales/customers/_components/MemoModal.tsx`:

- props: `{ customerId: string; isOpen: boolean; onClose: () => void; }`
- `useEffect` on isOpen → `listCustomerMemos`
- 마스터 의견 list + 각 master 하단에 reply list (2-레벨)
- 각 행에 본인 작성건만 [삭제] 버튼 (`isOwn` flag 사용)
- 상단 [의견등록] 버튼 → 새 master memo (priorComtSeq=0)
- 마스터 행 [댓글] 버튼 → 해당 master의 reply 입력 (priorComtSeq=master.comtSeq)
- 디자인: P2 `MemoModal.tsx` 시그니처 미러 (P2 머지본 후 정확한 props 시그니처 일치 필요)

`apps/web/app/(app)/sales/customer-contacts/_components/MemoModal.tsx`: 동상, customerId → contactId.

### 6.3 PR-4: 도메인별 DetailSidebar 4탭

`apps/web/app/(app)/sales/customers/_components/CustomerDetailSidebar.tsx`:

- props: `{ customerId: string; customerName: string; }`
- 4 탭 버튼 row: `[고객 N] [기회 N] [활동 N] [의견 N]`
- 카운트는 `getCustomerTabCounts` server action 호출
- 클릭 동작:
  - 고객 → `router.push("/sales/customer-contacts?customerId=" + customerId)`
  - 기회 → `router.push("/sales/opportunities?customerId=" + customerId)` (P2 머지본 의존, query param 검색 필터로)
  - 활동 → `router.push("/sales/activities?customerId=" + customerId)` (P2 머지본 의존)
  - 의견 → MemoModal 오픈
- 카운트 자동 갱신: 의견 모달 닫힐 때 + customer save 후

`apps/web/app/(app)/sales/customer-contacts/_components/ContactDetailSidebar.tsx`: 동상.
- 4 탭: `[고객사 N] [기회 N] [활동 N] [의견 N]`
- 고객사 → `router.push("/sales/customers/" + contact.customerId + "/edit")` (1:1 link)
- 기회/활동 → `?contactId=` 필터 (P2 grid가 contactId 필터 지원해야 함 — P2 plan Task 5/6에 추가 필요할 수 있음. **P2 머지 후 확인**)

### 6.4 PR-4: master-detail edit 페이지

`apps/web/app/(app)/sales/customers/[id]/edit/page.tsx` (RSC):

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared";
import { getCustomer } from "../../actions";  // 신규 server action
import { CustomerEditForm } from "./_components/CustomerEditForm";
import { CustomerDetailSidebar } from "../../_components/CustomerDetailSidebar";

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession((await headers()).get("x-session-id") ?? "");
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }
  const customer = await getCustomer({ id });
  if (!customer) redirect("/sales/customers?error=not-found");

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <CustomerEditForm customer={customer} />
      <CustomerDetailSidebar customerId={customer.id} customerName={customer.custNm} />
    </div>
  );
}
```

`CustomerEditForm.tsx` (client island):
- 기본정보 폼: custCd(read-only)·custNm·custDivCd·ceoNm·telNo·businessNo·homepage·addr1·addr2 (레거시 `bizActCustCompanyIpt.jsp:662~745` 충실 — 주석 처리된 필드는 제외)
- [저장] / [삭제] / [뒤로가기] 버튼
- 저장 → `saveCustomers({ updates: [{ id, patch }] })` (P1 기존 server action 재활용)
- 삭제 → `saveCustomers({ deletes: [id] })` 후 `/sales/customers` 리다이렉트

`apps/web/app/(app)/sales/customer-contacts/[id]/edit/page.tsx` + `_components/ContactEditForm.tsx`: 동상. 폼 필드는 레거시 `bizActCustomerIpt.jsp:603~657` 충실 — custName·custNm(고객사 lookup)·orgNm·jikweeNm·hpNo·telNo·email·statusYn(select B10032)·switComp.

`getCustomer({ id })` / `getContact({ id })` server action도 PR-4에서 신설.

### 6.5 Mgr 그리드 더블클릭 진입

PR-4에서 Mgr 그리드의 `DataGrid` props에 `onRowDoubleClick={(row) => router.push(...)}` 추가. baseline은 이미 prop 노출(festive-faraday 머지본). 도메인 wrapper(`CustomersGridContainer`, `CustomerContactsGridContainer`)에서 prop 전달만.

---

## 7. i18n 키 (PR-1 + PR-4 분산)

`apps/web/messages/ko.json` 추가:

```json
{
  "Sales": {
    "Customers": {
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
      },
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
    },
    "CustomerContacts": {
      "Tabs": {
        "customer": "고객사 ({count})",
        "opportunities": "영업기회 ({count})",
        "activities": "영업활동 ({count})",
        "memos": "의견 ({count})"
      },
      "Memo": { /* 동상 — Customers.Memo와 키 1:1 미러, 라벨 텍스트만 컨택 컨텍스트 */ },
      "Edit": {
        "title": "고객담당자 편집",
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
        }
      }
    }
  }
}
```

**경계 검증** (`jarvis-i18n` 스킬 §경계면 검증): 보간 변수 `{count}` 양쪽 일치, `t("Sales.Customers.Tabs.customers", { count: 5 })` 호출이 ko.json 경로와 1:1.

---

## 8. 라우팅 + 그리드 진입 흐름

### 8.1 PR-1 후 (Mgr만 변경)

```
/sales/customers          → 기존 Mgr 그리드 + (신규) 카운트 칩 컬럼 (고객N·기회N·활동N·의견N)
                             [의견] 칩 클릭 → MemoModal 오픈 (별도 동작)
                             다른 칩 클릭 → 무동작 (PR-4 머지 전)
/sales/customer-contacts  → 동상
```

### 8.2 PR-4 후 (Mgr + edit 모두)

```
/sales/customers                  → Mgr 그리드 (카운트 칩 클릭 + 행 더블클릭 활성)
/sales/customers/:id/edit         → RSC: getCustomer + EditForm + Sidebar4Tabs
/sales/customer-contacts/:id/edit → 동상
```

행 더블클릭 → `router.push(/:id/edit)`. 그리드 baseline의 `onRowDoubleClick` prop 활용.

---

## 9. 테스트

### 9.1 Unit (Vitest)

| 테스트 | 위치 |
|---|---|
| 메모 트리 빌더 (flat → tree, priorComtSeq=0 마스터·>0 reply) | `apps/web/lib/queries/sales-tabs.test.ts` |
| 본인 확인 isOwn 로직 | 동상 |
| `getCustomerTabCounts` SQL shape | 동상 (memory PG 또는 schema mock) |

### 9.2 E2E (Playwright)

| 테스트 | 위치 | 검증 |
|---|---|---|
| `sales-customers-tabs.spec.ts` | apps/web/e2e/ | Mgr 카운트 칩 표시 + 의견 모달 CRUD + 본인 작성건만 삭제 버튼 |
| `sales-customers-edit.spec.ts` | 동상 | 그리드 더블클릭 → /:id/edit 진입 + 폼 저장 + sidebar 4탭 카운트 정합 + 사이드바 [기회] 클릭 시 `/sales/opportunities?customerId=X` 진입 |
| `sales-customer-contacts-tabs.spec.ts` | 동상 | 동상 |
| `sales-customer-contacts-edit.spec.ts` | 동상 | 동상 + 사이드바 [고객사] 클릭 시 customer edit 진입 |

PR-1 머지 시점엔 edit 페이지 e2e는 placeholder skip, PR-4 머지 시점에 활성.

---

## 10. 검증 게이트 (각 task 후 + PR 직전)

`jarvis-architecture` §검증 게이트 명령 표 따름. 본 spec 범위:

| 명령 | 본 spec에서 필수성 |
|---|---|
| `pnpm --filter @jarvis/web type-check` | ✅ 모든 task |
| `pnpm --filter @jarvis/web lint` | ✅ 모든 task |
| `pnpm test` | ✅ unit 추가 task |
| `pnpm db:generate` + `node scripts/check-schema-drift.mjs --precommit` | ✅ Task 1 (스키마 신설) |
| `pnpm wiki:check` | ❌ 비범위 |
| `pnpm audit:rsc` | ✅ PR-4 (RSC/client 경계 신설) |
| `pnpm eval:budget-test` | ❌ 비범위 |
| `pnpm --filter @jarvis/web exec playwright test` | ✅ PR 직전 |

---

## 11. ETL · 운영 데이터 영향

- `sales_customer_contact_memo` 신설은 0건 시작 — ETL은 P7 본격 (P1.5/P2 plan과 동일 정책).
- 기존 `sales_customer_memo`는 P1 schema 변경 없음 — count query만 추가.
- P2 schema(`sales_opportunity` / `sales_activity`) 의존 — P2 머지 의존성에 이미 명시.

별도 ETL placeholder 변경 없음.

---

## 12. PR 분할 (PR-1 / PR-4)

### PR-1: backend + Mgr 카운트 칩

**제목 안:** `feat(sales): customer/contact tab counts + memo modal backend`

**Task 분할 (plan 단계에서 정밀화):**
1. `sales_customer_contact_memo` 스키마 + Drizzle migration
2. Zod schema (`packages/shared/validation/sales/customer-memo.ts`, `.../contact-memo.ts`)
3. server lib `apps/web/lib/queries/sales-tabs.ts` (count 헬퍼 + 메모 트리 빌더)
4. server actions: customers/actions.ts + customer-contacts/actions.ts에 8 함수 추가
5. `MemoModal` 2개 도메인별 client component
6. Mgr server action 응답에 counts 4개 추가 (`listCustomers` / `listCustomerContacts` 출력 shape 변경)
7. Mgr 그리드 wrapper에 `CountChipsCell` 컬럼 추가 (DataGrid baseline 미수정)
8. i18n `Sales.Customers.Memo.*` + `Sales.Customers.Tabs.*` (contact 동상)
9. unit tests + e2e tabs spec
10. 검증 게이트 + commit

### PR-4: edit pages + sidebar 통합

**제목 안:** `feat(sales): customer/contact master-detail edit pages with 4-tab sidebar`

**Task 분할 (plan 단계에서 정밀화):**
1. server actions: `getCustomer({ id })` / `getContact({ id })` 신규
2. `CustomerEditForm` / `ContactEditForm` client islands (레거시 Ipt 폼 필드 충실)
3. `CustomerDetailSidebar` / `ContactDetailSidebar` (탭 4개 + count fetch + 라우팅)
4. `[id]/edit/page.tsx` 2개 RSC 라우트
5. Mgr 그리드 wrapper에 `onRowDoubleClick` prop 추가 (router.push)
6. i18n `Sales.Customers.Edit.*` + `Sales.CustomerContacts.Edit.*`
7. e2e edit spec 2개
8. 검증 게이트 + commit

PR-1 머지 후 main rebase → PR-4 진입. 같은 worktree 순차.

---

## 13. Self-review

### Spec coverage 자체 검증
- [x] 결정 A/B/D/E/F 모두 §3에 기록
- [x] PR-1 / PR-4 책임 §12에 task 단위 분해
- [x] 의존 매트릭스 §2 (P1.5 + P2 + baseline)
- [x] 시작 조건 §1 (4 PR 머지 신호)
- [x] 비범위 §0 머리말 (P1.5 / P2 / baseline 영역 명시 분리)
- [x] 메모 트리 모델 §5.2
- [x] 본인 검증 §5.3
- [x] audit 액션 키 §5.4
- [x] i18n 보간 변수 §7
- [x] 검증 게이트 §10

### Placeholder scan
- "TBD"/"TODO" 없음
- 코드 chunk: 핵심만 본문(스키마·SQL·page.tsx 골격), 본문은 plan/SDD에서 implementer가 채움
- P2 MemoModal 시그니처 1:1 미러는 P2 머지 후 정확한 시그니처 확인 필요 — plan Task에 명시 예정

### Type consistency
- `MemoTreeNode` (server) ↔ `MemoModal` props ↔ ko.json 키 일관 ✓
- `getCustomerTabCounts` 출력 shape 4 fields ↔ Mgr listCustomers row 추가 fields ↔ CountChipsCell props ✓
- P2 schema의 `customer_id` / `contact_id` 컬럼명 본 spec count SQL과 일치 ✓ (P2 plan Task 1 §65 / Task 2 §234 확인)

### 메모리 룰 일관
- "Plans and specs are disposable": 본 spec 머리말에 disposable 명시. 머지 직전 chore commit으로 삭제.
- "Subagent worktree explicit cd": SDD 진입 시 implementer 프롬프트에 명시 필요. plan에서 다룸.
- "Grid screens unified": 본 spec은 baseline(`@/components/grid/*`) 미수정 + 도메인 wrapper만 확장. 일관 ✓
- "Legacy ibsheet Hidden policy": Mgr 그리드 컬럼 변경(카운트 칩 추가)은 신규 컬럼이라 Hidden 정책 위반 아님. ✓

---

## 14. Self-review에서 추가 발견된 항목 (post-commit 보강)

### 14.1 P2 server actions 필터 누락 (PR-4 책임 추가)

**문제:** P2 plan Task 5 §opportunityListInput Zod schema는 `q, bizStepCode, productTypeCode, focusOnly, page, limit`만 정의. **`customerId` / `contactId` 필터 누락**. P2 plan Task 6 영업활동도 동상 (구체적 input은 plan에서 deferred).

**영향:** PR-4 sidebar [영업기회] 탭 클릭 시 `router.push("/sales/opportunities?customerId=X")`로 진입해도 grid가 필터 적용 못함 → 전체 list 표시.

**대응:** PR-4 task에 추가 — P2 머지본의 `listOpportunitiesAction` / `listActivitiesAction`에 `customerId?: uuid` + `contactId?: uuid` optional 필터 추가 (Zod input + queries WHERE 절). 별 commit.

**대안 검토:**
- (A) inline list in sidebar (페이지 이동 X) — 단순하나 사용자가 전체 grid 못 봄, 사이드바 정보량↑
- (B) PR-4가 P2 server actions 보강 (현 결정)
- (C) P2 plan을 수정해 사용자가 머지 전 반영 — P2 SDD 영역 침범

→ **결정: B** — PR-4 task 9에 명시 (plan 단계에서 task 분해).

### 14.2 카운트 N+1 우려

`listCustomers` 응답에 row마다 4 카운트 함께 반환 → 50 row × 4 sub-query = 200. 일반 도메인엔 무겁지 않으나 grid가 커지면 부담.

**대응 옵션:**
- (A) `LEFT JOIN LATERAL (SELECT COUNT(*) ...)` × 4 (단일 쿼리) — Drizzle SQL template으로 표현 가능
- (B) `listCustomers` + `getCustomerCounts(ids: uuid[])` 분리 (2 round-trip, 두 번째는 batch)
- (C) 그대로 (200 query) — 50 row는 매우 작음, 측정 후 결정

→ **결정: PR-1 SDD에서 implementer가 측정 후 선택.** spec은 (C) 기본, 200ms 초과 시 (A)로 전환. plan Task 6/7에 측정 step 명시.

### 14.3 user.name lookup (메모 작성자)

`sales_customer_memo.created_by` (uuid) → `user.name` (text) join 필요. 카운트엔 불필요, 메모 list에만.

**대응:** `listCustomerMemos` server lib에서 `LEFT JOIN user ON user.id = sales_customer_memo.created_by` (workspaceId scope). 사용자가 삭제됐으면 `name` null → UI에서 "(알 수 없음)" 표시.

### 14.4 sidebar [고객사] 탭 — contact.customerId null 가드

`ContactDetailSidebar` [고객사] 탭이 1:1 link하려면 `contact.customerId`가 non-null 필요. customer-contacts row의 customerId가 nullable(`uuid("customer_id")` — schema 121 line — `.notNull()` 없음)이라 null 가능.

**대응:** `custCompanyCnt = contact.customerId ? 1 : 0` (이미 spec §5.1에 명시), null이면 [고객사 0] 칩 비활성 + 클릭 무동작. UI 가드 plan task에 명시.

### 14.5 본인 검증 e2e

`deleteCustomerMemo` / `deleteContactMemo`가 본인 작성건만 삭제하는 검증. e2e fixture에 두 user 필요:
- `admin@jarvis.dev` (P1 fixture, 모든 권한)
- `viewer@jarvis.dev` (P1 fixture, SALES_READ만? 또는 SALES_ALL이지만 user_id 다름)

**대응:** P1 e2e fixture에 second user 있는지 plan 단계에서 확인 — 없으면 fixture 보강 task 추가. ADMIN_ALL은 본인 검증 우회 가능 (`isAdmin(session)`) — e2e에서 admin도 다른 사용자 메모 삭제 가능 검증.

---

## 15. 다음 단계

1. **iter 1:** spec 작성 + commit ✅ (574c325)
2. **iter 2~N:** 260초 cadence로 P1.5 + P2 머지 polling. 매 iter spec 보강 (이번 §14는 iter 2 산출물).
3. **머지 신호 후:** `superpowers:writing-plans`로 PR-1 plan 작성 → `superpowers:subagent-driven-development` 진입 → 머지 → PR-4 plan → SDD → 머지
4. **본 작업 완료 시:** spec + plan disposable 삭제 commit (메모리 룰)
