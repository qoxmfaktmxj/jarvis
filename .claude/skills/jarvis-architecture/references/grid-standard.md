# 그리드 표준 화면 (대량 데이터 마스터)

다량의 행 데이터를 표시·편집하는 모든 화면은 **DataGrid baseline**을 따른다. 시각·동작 표준은 `admin/companies` 화면을 reference implementation으로 하며, 모든 새 그리드는 이 표준에 1:1 부합해야 한다. 행 ≥ 20건이면 무조건 그리드 채택 — 카드형/모달폼 X.

## 🔒 절대 원칙 (2026-05-16 사용자 룰 명문화)

**그리드는 무조건 `<DataGrid<T>>` 한 컴포넌트만 사용. 자체 `<table>` + 부품 조합("하이브리드") 절대 금지.**

> "그리드는 항상 통일. 100개 기능 넣고 50개 안 쓰더라도 통일해서 진행."

DataGrid가 master/detail · lockOnExisting · readOnly · hideToolbar 등 모든 케이스를 prop으로 흡수. 새 케이스가 생기면 DataGrid에 prop 추가하지, **별도 컴포넌트로 분기 금지**.

### 금지 패턴

```tsx
// ❌ NO — 자체 <table> + EditableCell 조합 = 하이브리드
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
return (
  <table className="min-w-full">
    <thead>...</thead>
    <tbody>
      {rows.map((r) => <tr><td><EditableTextCell ... /></td></tr>)}
    </tbody>
  </table>
);
```

```tsx
// ✅ YES — DataGrid 사용
<DataGrid<Row>
  rows={rows}
  columns={columns}
  selectedId={selectedId}
  onSelect={setSelectedId}
  ...
/>
```

### Audit grep (회귀 차단)

신규 _components 파일에 자체 `<table>` 사용은 무조건 위반:
```bash
# 자체 <table> + grid 부품 조합 = 하이브리드 위반:
rg -l '<table\b' apps/web/app/\(app\)/ --glob '**/_components/**/*.tsx' \
  | xargs rg -l 'EditableTextCell|EditableSelectCell|GridToolbar|RowStatusBadge'
```
hit이 있으면 PR reject. 신규 케이스가 필요하면 DataGrid에 prop 추가하는 PR로 분리.

> **마이그레이션 상태 (2026-05-16):** 기존 하이브리드 그리드 13개 (admin/menus·codes, admin/infra/licenses, sales/* 일부, maintenance/stats, modal grids)는 단계적으로 DataGrid로 흡수 중. Phase A(이 PR) = DataGrid에 master/detail · lockOnExisting · readOnly · hideToolbar 4 props 추가 + 룰 명문화. Phase B 이후 = 13개 하이브리드 점진 마이그레이션.



## 1. baseline 컴포넌트 위치

**공유 그리드 인프라** (`apps/web/components/grid/`):
- [`DataGrid.tsx`](../../../../apps/web/components/grid/DataGrid.tsx) — 메인 orchestrator. 모든 도메인은 `<DataGrid<DomainRow>>`로 wrapping
- [`DataGridToolbar.tsx`](../../../../apps/web/components/grid/DataGridToolbar.tsx) — 좌측 children 슬롯 + 우측 Excel export 버튼
- [`GridToolbar.tsx`](../../../../apps/web/components/grid/GridToolbar.tsx) — DataGrid 내부 [입력]/[복사]/[저장(N)] 툴바
- [`useGridState.ts`](../../../../apps/web/components/grid/useGridState.ts) — `clean/new/dirty/deleted` 행 상태 훅. generic `<T extends { id: string }>`
- [`ColumnFilterRow.tsx`](../../../../apps/web/components/grid/ColumnFilterRow.tsx) — 헤더 아래 필터 row
- [`RowStatusBadge.tsx`](../../../../apps/web/components/grid/RowStatusBadge.tsx) — NEW/DIRTY/DELETED 시각 배지
- [`UnsavedChangesDialog.tsx`](../../../../apps/web/components/grid/UnsavedChangesDialog.tsx) — 미저장 변경 confirm
- [`cells/Editable{Text,TextArea,Select,Date,Boolean,Numeric}Cell.tsx`](../../../../apps/web/components/grid/cells/) — 인라인 편집 셀 6종
- [`utils/excelExport.ts`](../../../../apps/web/components/grid/utils/excelExport.ts) — Excel 내보내기 유틸
- [`utils/makeHiddenSkipCol.ts`](../../../../apps/web/components/grid/utils/makeHiddenSkipCol.ts) — ibsheet Hidden 정책 호환
- [`EmployeePicker.tsx`](../../../../apps/web/components/grid/EmployeePicker.tsx) — 사번 자동완성
- [`CodeGroupPopupLauncher.tsx`](../../../../apps/web/components/grid/CodeGroupPopupLauncher.tsx) — 코드그룹 팝업

**도메인 wrapping 규칙**: 도메인별로 `apps/web/app/(app)/{domain}/_components/{Domain}GridContainer.tsx` 1개. 컬럼/필터 정의 + reload + handleSave + handleExport만 책임지고 그리드 본체 로직은 무조건 baseline 호출.

## 1-bis. DataGrid 확장 props (2026-05-16 신설)

DataGrid가 master/detail · 잠금 컬럼 · read-only · modal embed 모든 케이스를 단일 컴포넌트로 흡수. 새 prop:

| Prop | 타입 | 용도 |
|------|------|------|
| `selectedId` | `string \| null \| undefined` | 외부 제어 행 선택 ID. master/detail 패턴. 미지정 시 DataGrid가 internal state로 관리 |
| `onSelect` | `(id: string \| null) => void` | 행 클릭 시 통지. master/detail에서 detail fetch 트리거 |
| `readOnly` | `boolean` | 그리드 전체 readonly (모든 셀 + GridToolbar + 삭제 컬럼 hide). 통계/조회용 |
| `hideToolbar` | `boolean` | GridToolbar(입력/복사/저장)만 hide. modal 임베드용. 셀 편집은 가능 |
| `columns[].lockOnExisting` | `boolean` | 신규 행에서만 편집 가능. 기존 행은 readonly. PK/식별자 컬럼용 (legacy ibsheet `KeyField:1` 대체) |

### master/detail 패턴 (DataGrid 단독 사용)

```tsx
// 부모 (Domain master/detail pattern)
const [selectedId, setSelectedId] = useState<string | null>(null);
const [detailRows, setDetailRows] = useState<DetailRow[]>([]);

const onSelectMaster = useCallback(async (id: string | null) => {
  if (!id) return;
  setSelectedId(id);
  const detail = await listDetail({ masterId: id });
  setDetailRows(detail.rows);
}, []);

return (
  <div className="grid grid-cols-[7fr_3fr] gap-3 min-h-0 flex-1">
    <DataGrid<MasterRow>
      rows={masterRows}
      columns={MASTER_COLUMNS}   // code 컬럼은 lockOnExisting: true
      selectedId={selectedId}
      onSelect={onSelectMaster}
      onSave={saveMaster}
      ...
    />
    <DataGrid<DetailRow>
      rows={detailRows}
      columns={DETAIL_COLUMNS}
      onSave={saveDetail}
      ...
    />
  </div>
);
```

부모는 두 DataGrid를 사이드 by 사이드 + state 관리만. 자체 `<table>` 만들지 않음. master/detail dirty 게이트는 각 DataGrid의 `onDirtyChange` + `onGridReady` 콜백으로 조립.

### read-only 그리드 (stats, 조회 전용)

```tsx
<DataGrid<StatsRow>
  rows={statsRows}
  columns={STATS_COLUMNS}
  readOnly
  onSave={async () => ({ ok: true })}  // no-op (호출 안 됨)
  onPageChange={() => {}}
  onFilterChange={() => {}}
  makeBlankRow={() => ({} as StatsRow)}  // no-op
  ...
/>
```

GridToolbar / 삭제 컬럼 자동 hide. 페이지네이션 / 필터 row / 컬럼 정렬 그대로.

### modal 임베드 그리드

```tsx
<DataGrid<RowInModal>
  rows={modalRows}
  columns={COLUMNS}
  hideToolbar    // GridToolbar만 hide
  onSave={...}   // 부모가 modal 자체 저장 버튼으로 트리거
  ...
/>
```

부모의 modal footer에서 자체 [저장] 버튼 + DataGrid `onGridReady`로 받은 grid API의 `toBatch()` 호출.

## 2. 필수 기능 (모든 그리드 7+1+1+1가지)

1. **인라인 편집** — 셀 클릭→편집, Enter/blur=commit, Esc=취소. 모달 폼 별도 사용 금지
2. **행 단위 dirty tracking** — clean/new/dirty/deleted 4 상태, RowStatusBadge로 시각화
3. **GridToolbar (DataGrid 내부)** — [입력] / [복사] / [저장 (N)] 3 버튼 고정
4. **컬럼 헤더 아래 필터 row** — type별 셀렉트/텍스트 (per-column 자동 적용)
5. **서버 페이징** — `page`/`limit`, default `limit=50`. 무한 스크롤 금지. **DataGrid가 `total > limit`이면 자동 페이지 컨트롤 표시, 아니면 자동 hide** (10절 분기 패턴 참조)
6. **미저장 변경 confirm dialog** — 페이지 이동/필터 변경/네비게이션 시 `UnsavedChangesDialog`
7. **server action batch save** — `{ creates, updates, deletes }` 한 트랜잭션 + audit_log insert
8. **DataGridToolbar (외부 toolbar)** — Excel 다운로드 버튼 + 도메인 검색 입력(필요 시)
9. **조회 클릭 시 자동 reset (2026-05-12 추가)** — `GridSearchForm.onResetGrid` required prop. 미저장 변경(dirty/new/deleted)을 사용자 확인 없이 즉시 폐기. 패턴:
   - **useGridState 직접 보유**: `<GridSearchForm onResetGrid={grid.discardChanges} ...>`
   - **DataGrid 캡슐화(GridContainer 패턴)**: `const gridApiRef = useRef<{ discardChanges: () => void } | null>(null)` 선언 → `<DataGrid onGridReady={(api) => { gridApiRef.current = api; }} ...>` → `<GridSearchForm onResetGrid={() => gridApiRef.current?.discardChanges()} ...>`
   - **sub-component 패턴**: 부모에서 `discardChanges`를 `onResetGrid: () => void` prop으로 내려받아 `GridSearchForm`에 전달
10. **검색 form은 GridSearchForm + GridFilterField로만 (2026-05-16 강제)** — 자체 `<form>`/`<div>`/`<label>` 작성 금지. 카드형 입력 패널은 `GridSearchForm`이 표준 토큰(`border-(--border-default) bg-(--bg-surface) px-4 py-3 rounded-md`)으로 일관 렌더. 우측 끝 [조회] 버튼 자동.

## 3. 디자인 토큰 (변경 금지)

| 항목 | 값 |
|---|---|
| 행 높이 | 32px (compact) |
| 셀 padding | x=8px y=4px |
| 헤더 폰트 | 11px semibold uppercase tracking-wide `text-slate-600` |
| 셀 폰트 | 13px `text-slate-900` |
| 헤더 배경 | `bg-slate-50` |
| 테두리 | `border-slate-200` |
| hover 행 | `bg-slate-50` |
| selected 행 | `bg-blue-50/40` |
| 편집 셀 ring | `ring-2 ring-blue-500 inset` |
| sticky 헤더 | `top-0 z-10` (필터 row가 그 아래 sticky) |
| 폰트 패밀리 | Inter |

**상태 배지 색상**:
- NEW: `bg-blue-100 text-blue-700`
- DIRTY: `bg-amber-100 text-amber-700`
- DELETED: `bg-rose-100 text-rose-700` + `line-through`

## 4. 버튼 표준화

| 버튼 | 위치 | 라벨 i18n 키 | variant | 상태별 텍스트 |
|---|---|---|---|---|
| 엑셀 다운로드 | 외부 DataGridToolbar 우측 (`ml-auto`) | `Sales.Common.Excel.button` / `.downloading` | `outline` size `sm` | 진행 중엔 `t("Excel.downloading")` 토글 |
| 입력(신규 행) | DataGrid 내부 GridToolbar 좌측 | `Common.Grid.insert` | `outline` | — |
| 복사 | GridToolbar 좌측 | `Common.Grid.copy` | `outline` | 선택 행 0개면 `disabled` |
| 저장 (N) | GridToolbar 좌측 | `Common.Grid.save` | `default` (primary) | dirty count 0이면 `disabled`, 진행 중이면 `Common.Grid.saving` |

**일관 원칙**:
- 모든 라벨은 i18n 키로. 하드코딩된 한국어 금지 (`jarvis-i18n` 스킬 강제)
- `isExporting` / `isSaving` 같은 진행 플래그가 있으면 라벨 토글 + `disabled` 동시 적용
- 셀에서 **별도 액션 버튼**(예: "삭제", "복제")은 추가하지 않는다. 행 선택 + 툴바 버튼 패턴으로 통일
- 모달 다이얼로그 신규 도입 금지. 미저장 변경만 `UnsavedChangesDialog` 사용

## 5. 컬럼 컨벤션

표준 정렬:

```
[좌측: PK/식별자] → [본문: 도메인 컬럼] → [우측 readonly: audit 필드]
```

| 위치 | 컬럼 | 비고 |
|---|---|---|
| 좌측 | `code` 또는 `employeeId` 또는 도메인 식별자 | width 90~110px, type `text` |
| 본문 | 도메인 데이터 | type 적합한 셀 사용 |
| 우측 | `updatedByName` | width 100px, **readOnly: true** |
| 우측 | `updatedAt` | width 160px, **readOnly: true** |

**컬럼 정의 규칙**:
- `key`는 **DB 컬럼명 그대로**. shape 일치를 강제 (`jarvis-db-patterns` 9.1)
- `width` 명시 필수. content-fit 금지 (헤더 폭 jitter 방지)
- 공유 enum (`status` 등)은 그리드 컴포넌트별 옵션 배열을 다시 만들지 말고 i18n + Zod enum 한 곳에서 단일 source
- audit 컬럼(`updatedBy*`/`updatedAt`)은 `readOnly: true` 강제 — 사용자 편집 불가
- Hidden 컬럼(레거시 ibsheet `Hidden:1`)은 `makeHiddenSkipCol`로 처리. 단, audit 정책상 export에는 포함될 수 있음(메모리 `feedback_legacy_ibsheet_hidden_policy.md`)

## 6. Server action 컨벤션

도메인 `actions.ts`는 정확히 두 함수를 export:

```ts
export async function list{Domain}(input: List{Domain}Input):
  Promise<{ ok: boolean; rows: {Domain}Row[]; total: number }>;

export async function save{Domain}(input: Save{Domain}Input):
  Promise<{ ok: boolean; inserted: number; updated: number; deleted: number; error?: string }>;
```

규칙:
- 권한 가드: 첫 줄에서 `requirePermission(...)` 또는 `resolveAdminContext()` 호출
- workspace 필터: 모든 WHERE/INSERT에 `workspaceId`
- batch save는 `db.transaction` 안에서 creates → updates → deletes 순으로
- 모든 mutation은 `audit_log` insert 동반 (`action: "{domain}.create|update|delete"` + before/after diff in `details`)
- update에는 `updatedBy: session.userId, updatedAt: new Date()` 항상 set
- 응답 shape는 Zod `{Domain}Output.parse(...)`로 강제

## 7. 금지 패턴

| 패턴 | 이유 |
|---|---|
| 신규 그리드에 `@tanstack/react-table` 도입 | DataGrid baseline와 분리 — admin/users 마이그레이션 후 0건. 신규 도입 시 PR 반려 |
| 카드형 그리드 (행을 카드로 늘어뜨림) | 데이터 밀도 손실. 메모리 `feedback_grid_design_unified.md` |
| 셀 안에 액션 버튼 (삭제/복제 인라인) | UX 비일관 — 툴바 버튼 패턴으로 통일 |
| 모달 폼 (신규 행 입력 다이얼로그) | 인라인 편집 강제 |
| 무한 스크롤 / virtualized rows | 서버 페이징 사용 |
| 일러스트 / 이모지 / 애니메이션 강조 | AI slop 회피 |
| `bg-blue-500` 등 raw Tailwind 색상 직접 적용 | 위 디자인 토큰만 사용 |
| 클라이언트 측 권한 필터 | 쿼리 WHERE의 workspaceId + server action 권한 가드에서 처리 (`jarvis-db-patterns` §4) |
| 응답에 `passwordHash`/secret 컬럼 노출 | server action returning에 화이트리스트 강제 (admin/users 패턴 참고) |

## 7-bis. 페이징 분기 패턴 (2026-05-16 신설)

그리드는 두 케이스로 갈림. DataGrid가 `total > limit` 자동 hide 로직을 가지므로 consumer는 **page/limit/total을 항상 전달**하기만 하면 됨. explicit "페이징 끄기" prop 없음.

### A. 페이징 필요 (대량 데이터 — admin/users, admin/companies, sales/*, projects 등)

- `page` 상태: `useTabState<number>("...page", 1)` (탭 전환 시 유지)
- `pendingFilters` 상태: `useTabState<Record<string, string>>("...pendingFilters", {})`
- `filterValues` 상태: `useTabState<Record<string, string>>("...filters", {})` (마지막 조회 시점 snapshot)
- reload 함수: `reload(nextPage, nextFilters)` → server action 호출 후 `setRows / setTotalCount / setPage / setFilterValues`
- DataGrid props: `page={page}` `limit={PAGE_SIZE}` `total={totalCount}` `onPageChange={(p) => reload(p, filterValues)}`
- → `total > limit`이면 페이지 컨트롤 자동 표시 (prev/N/M/next)

reference: `apps/web/app/(app)/admin/companies/_components/CompaniesGridContainer.tsx`

### B. 페이징 불필요 (소량 데이터 — holidays, code group, 기타 master)

- `page` 상태 X. `page={1}` 고정 전달
- `limit`은 예상 max보다 큰 값 (예: holidays는 16건 max, `PAGE_SIZE=100`)
- `total={rows.length}` — server에서 받은 전체 row 수
- `onPageChange={() => {}}` (no-op)
- 필터(year 등)는 `pendingFilters` 한 개라도 동일 패턴: GridSearchForm + GridFilterField + `reload(nextFilter)`
- → `total(=rows.length) <= limit(=PAGE_SIZE)` 자동 hide

reference: `apps/web/app/(app)/holidays/_components/HolidaysGridContainer.tsx`

### 공통 (둘 다 적용)

- GridSearchForm + GridFilterField 무조건 사용 (룰 §2.10)
- `onResetGrid` wiring 무조건 (룰 §2.9)
- `discardChanges` API 노출 (`onGridReady` 콜백)
- batch save / audit_log / workspaceId 필터 (룰 §6)

### C. windowedPagination (뷰포트 적응형 — 2026-05-16 신설)

대부분의 페이징 그리드는 `limit=50`이면 1600px 높이로 뷰포트(~850px) 아래로 넘쳐 페이지 컨트롤이 보이지 않는다. `windowedPagination` prop은 ResizeObserver로 테이블 컨테이너 높이를 측정하고 몇 행이 들어가는지 자동 계산해 `limit`을 동적으로 조절한다.

**DataGrid props**:
```tsx
windowedPagination               // 활성화 (boolean flag)
onAutoLimitChange={(next) => {   // limit 변경 통지
  setLimit(next);
  reload(1, urlFilters, next);   // next를 reload에 직접 전달
}}
```

**GridContainer 패턴**:
```tsx
// Props: limit: initialLimit
const [limit, setLimit] = useState(initialLimit);

const reload = useCallback(
  (nextPage: number, nextFilters: FilterState, nextLimit?: number) => {
    startTransition(async () => {
      const res = await listDomain({
        ...filters,
        page: nextPage,
        limit: nextLimit ?? limit,   // nextLimit이 있으면 state보다 우선
      });
      if (res.ok) { setRows(res.rows); setTotal(res.total); }
    });
  },
  [limit],  // limit state가 deps
);

// DataGrid:
<DataGrid
  ...
  limit={limit}
  windowedPagination
  onAutoLimitChange={(next) => {
    setLimit(next);
    reload(1, urlFilters, next);  // stale closure 방지: next 직접 전달
  }}
  onPageChange={(p) => {
    setUrlFilter("page", String(p));
    reload(p, { ...urlFilters, page: String(p) });
  }}
/>
```

**핵심 구현 (DataGrid.tsx 내부)**:
- 상수: `HEADER_ROW_HEIGHT=36`, `FILTER_ROW_HEIGHT=32`, `ROW_HEIGHT=32`, `AUTO_LIMIT_DEBOUNCE_MS=100`
- ResizeObserver → `containerH - chrome(header+groupHeader+filterRow)` / 32 = newLimit
- 디바운스 100ms, mount 시 즉시 측정
- `overflow-hidden` (windowedPagination=true) / `overflow-auto` (default)

**적용 대상 (페이징 그리드 전체)**:
- admin: companies, users, faq, doc-numbers
- projects: projects, beacons, history, modules
- maintenance: assignments, schedule
- sales: 21개 GridContainer 전부 (companies, activities, cloud-people-base, cloud-people-calc, contracts, contract-months, contract-services, contract-uploads, customer-contacts, customers, freelancers, mail-persons, opportunities, plan-view-permissions, plan-perf-upload, product-types, SalesFinanceGridContainer)
- add-dev, infra

**적용 제외 (고정 limit)**:
- `HolidaysGridContainer` — 소량(~16건), `windowedPagination` 불필요
- `admin/codes` `CodesPageClient` — MASTER_LIMIT=100, DETAIL_LIMIT=500 의도적 고정
- `admin/menus` `MenusPageClient` — MASTER_LIMIT=200 트리 표시 전부 로드
- `PlanDivCostsGridContainer`, `MonthExpSgaGridContainer`, `PurchasesGridContainer`, `TaxBillsGridContainer` — 페이지 컨트롤 없는 소량 그리드
- modal 임베드 그리드 — 모달 높이 제어가 별도

## 8. 신규 그리드 PR 체크리스트

새 그리드 화면 PR 머지 전 모두 통과해야 함. spec-reviewer가 검증:

- [ ] DataGrid baseline 사용 (TanStack Table / 자체 table 0건)
- [ ] DomainGridContainer 1개 + DataGrid 본체 미수정
- [ ] 필수 기능 7+1+1+1 모두 구현 (인라인 편집/dirty/툴바 3버튼/필터 row/페이징/confirm dialog/batch save/Excel export/조회 시 자동 reset/GridSearchForm 사용)
- [ ] 디자인 토큰 1:1 매칭 — admin/companies 옆에 두고 비교 시 차이 없음
- [ ] 컬럼 정렬: PK 좌측 → 본문 → audit 우측 readonly
- [ ] 모든 라벨 i18n 키 (하드코딩 한국어 grep 결과 0)
- [ ] server action `list{Domain}`/`save{Domain}` 두 함수 + 트랜잭션 + audit_log
- [ ] 권한 가드 첫 줄 (`requirePermission` 또는 `resolveAdminContext`)
- [ ] 응답 shape Zod parse, 비밀 컬럼(`passwordHash` 등) 미노출
- [ ] type-check 0 errors / lint 0 new warnings / `audit:rsc` 0 errors
- [ ] 기존 baseline 회귀 테스트(`useGridState.test.ts`/`DataGridToolbar.test.tsx` 등) 통과
- [ ] GridSearchForm에 `onResetGrid` 연결 (useGridState 직접: `grid.discardChanges`; DataGrid 캡슐화: `gridApiRef.current?.discardChanges()`; sub-component: prop 전달)
- [ ] 필터 입력 = GridSearchForm + GridFilterField (자체 form/div/label 작성 0건)
- [ ] 페이징 분기 (§7-bis) — 대량 데이터면 page/pendingFilters/filterValues state + reload(page, filters), 소량이면 page={1} + total={rows.length} + 자동 hide

## 9. 참고

- Reference implementation: `admin/companies` ([CompaniesGridContainer.tsx](../../../../apps/web/app/(app)/admin/companies/_components/CompaniesGridContainer.tsx))
- 추가 baseline 사용처(11곳): admin/codes·menus·infra-licenses·users · sales/customers·customer-contacts·mail-persons·opportunities·activities·product-types·product-cost-mapping
- ibsheet → React 매핑: 본 SKILL의 "ibsheet 이벤트 → React 매핑" 섹션
- 디자인 통일 메모리 규칙: `feedback_grid_design_unified.md`
- 참고 plan: [`docs/superpowers/plans/2026-04-30-company-master-grid.md`](../../../../docs/superpowers/plans/2026-04-30-company-master-grid.md), [`docs/superpowers/plans/2026-05-02-admin-users-grid-and-audit.md`](../../../../docs/superpowers/plans/2026-05-02-admin-users-grid-and-audit.md)
