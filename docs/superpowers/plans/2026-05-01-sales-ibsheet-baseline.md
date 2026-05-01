# Sales ibsheet Behavior Parity Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 영업관리 5 화면 + 향후 P2 신규 라우트에 공통으로 활용될 ibsheet 행동 패리티 인프라 5종을 신규 파일로 추가. 기존 5 GridContainer + DataGrid 본체 미수정 — P1.5/P2 worktree와 충돌 회피.

**Architecture:** 5 신규 utility/hook/component + skill doc 갱신을 7 task로 TDD 분할. 영향 계층: lib(11) + components(~16) + 테스트(20)만. 14 계층 N/A. 검증 게이트: type-check + lint + vitest + audit:rsc.

**Tech Stack:** Next.js 15 + React 19 / TypeScript / Vitest + Testing Library / next/navigation / TailwindCSS 4

**Worktree:** `.claude/worktrees/festive-faraday-d0c615` · branch `claude/festive-faraday-d0c615` (base = main `e43bd06`)

**No spec:** 작업 범위가 작고 도메인 결정 없음(legacy ibsheet 패턴 1:1 포팅). brainstorming 합의 직후 plan 직접 작성, 사용자 합의됨.

---

## Impact Matrix (17 Layers per `jarvis-architecture`)

| Layer | Impact | Notes |
|---|---|---|
| DB 스키마 | N/A | 본 세션 schema 미수정 |
| Validation (Zod) | N/A | |
| 권한 (34 PERMISSIONS) | N/A | 새 PERMISSION 없음 |
| 세션 vs 권한 모델 | N/A | server action 없음 |
| Sensitivity 필터 | N/A | |
| Ask AI / tool-use agent | N/A | |
| Wiki-fs (Karpathy) | N/A | |
| 검색 (pg-search/precedent) | N/A | |
| 서버 액션/API | N/A | export server action은 P2-A에서 추가 |
| 서버 로직 (lib) | **변경** | `apps/web/lib/hooks/useUrlFilters.ts` (new), `apps/web/lib/utils/validateDuplicateKeys.ts` (new) |
| UI 라우트 | N/A | |
| UI 컴포넌트 | **변경** | `apps/web/components/grid/utils/makeHiddenSkipCol.ts` (new), `DataGridToolbar.tsx` (new), `CodeGroupPopupLauncher.tsx` (new) |
| i18n 키 | N/A | baseline은 모든 사용자 노출 문구를 prop passthrough — i18n 적용은 호출자(P2-A) |
| 테스트 | **변경** | 5 vitest unit test 신규 |
| 워커 잡 | N/A | |
| LLM 호출 | N/A | |
| Audit | N/A | mutation 없음 |

---

## Verification Gates

| Gate | When |
|---|---|
| `pnpm --filter @jarvis/web type-check` | Task 7 (PR 직전) |
| `pnpm --filter @jarvis/web lint` | Task 7 |
| `pnpm --filter @jarvis/web exec vitest run components/grid/utils/makeHiddenSkipCol components/grid/DataGridToolbar.test components/grid/CodeGroupPopupLauncher.test lib/hooks/useUrlFilters.test lib/utils/validateDuplicateKeys.test` | task별 (TDD red-green) + Task 7 일괄 |
| `pnpm audit:rsc` | Task 7 — 신규 client 컴포넌트 3개 RSC 경계 검증 |

**불필요한 게이트:** `db:generate`, `check-schema-drift`, `wiki:check`, `eval:budget-test`, `playwright e2e` — 본 plan 영향 범위 밖.

---

## File Structure

### Created (10 files)

| Path | Responsibility |
|---|---|
| `apps/web/components/grid/utils/makeHiddenSkipCol.ts` | Hidden:1 컬럼 export 제외 헬퍼 — legacy `makeHiddenSkipCol` 동등 |
| `apps/web/components/grid/utils/makeHiddenSkipCol.test.ts` | unit test |
| `apps/web/components/grid/DataGridToolbar.tsx` | Toolbar wrapper — `onExport` slot. **`use client`** |
| `apps/web/components/grid/DataGridToolbar.test.tsx` | unit test (RTL) |
| `apps/web/components/grid/CodeGroupPopupLauncher.tsx` | code_group(B10025 등) popup 런처. **`use client`** |
| `apps/web/components/grid/CodeGroupPopupLauncher.test.tsx` | unit test |
| `apps/web/lib/hooks/useUrlFilters.ts` | URL searchParams ↔ filterValues 양방향 동기화. **`use client`** |
| `apps/web/lib/hooks/useUrlFilters.test.ts` | unit test |
| `apps/web/lib/utils/validateDuplicateKeys.ts` | 다중 키 중복 검증 — legacy `dupChk(sheet, "k1\|k2\|k3")` 동등 |
| `apps/web/lib/utils/validateDuplicateKeys.test.ts` | unit test |
| `docs/superpowers/plans/2026-05-01-sales-ibsheet-baseline.md` | 본 plan (disposable) |

### Modified

| Path | Change |
|---|---|
| `.claude/skills/jarvis-architecture/SKILL.md` | "ibsheet 이벤트 → React 매핑" 섹션 추가 (영구 도메인 지식) |
| `CLAUDE.md` | 변경 이력 1줄 추가 |

### NOT touched (불변 원칙 — 충돌 회피)

- `apps/web/components/grid/DataGrid.tsx` — P1.5(`groupHeaders` prop) 영역
- `apps/web/app/(app)/sales/**/_components/*.tsx` — P1.5(컬럼 fix) + P2-A(baseline 적용) 영역
- `apps/web/messages/ko.json` — i18n은 P2-A에서 추가
- `packages/db/schema/**`, `packages/shared/**` — P1.5/P2 영역

---

## Task 1: makeHiddenSkipCol utility

**Goal:** Hidden:1 컬럼을 export 컬럼 배열에서 제거하는 순수 함수. legacy `makeHiddenSkipCol(sheet)`는 sheet 인스턴스를 mutate하지만 우리는 column 정의 배열을 받아 새 배열 반환.

**Files:**
- Create: `apps/web/components/grid/utils/makeHiddenSkipCol.ts`
- Test: `apps/web/components/grid/utils/makeHiddenSkipCol.test.ts`

- [ ] **Step 1: failing test 작성**

`apps/web/components/grid/utils/makeHiddenSkipCol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeHiddenSkipCol, type ExportableColumn } from "./makeHiddenSkipCol";

describe("makeHiddenSkipCol", () => {
  it("filters out columns where hidden is true", () => {
    const cols: ExportableColumn[] = [
      { key: "custCd", header: "고객사코드", hidden: true },
      { key: "custNm", header: "고객사명", hidden: false },
      { key: "telNo", header: "전화번호" },
    ];
    expect(makeHiddenSkipCol(cols)).toEqual([
      { key: "custNm", header: "고객사명", hidden: false },
      { key: "telNo", header: "전화번호" },
    ]);
  });

  it("returns same items when no hidden columns", () => {
    const cols: ExportableColumn[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];
    expect(makeHiddenSkipCol(cols)).toEqual(cols);
  });

  it("returns empty array when all hidden", () => {
    const cols: ExportableColumn[] = [{ key: "a", header: "A", hidden: true }];
    expect(makeHiddenSkipCol(cols)).toEqual([]);
  });

  it("preserves additional column properties via generic type", () => {
    type WithWidth = ExportableColumn & { width: number };
    const cols: WithWidth[] = [
      { key: "a", header: "A", width: 80 },
      { key: "b", header: "B", width: 100, hidden: true },
    ];
    const result = makeHiddenSkipCol(cols);
    expect(result).toEqual([{ key: "a", header: "A", width: 80 }]);
    expect(result[0]?.width).toBe(80);
  });
});
```

- [ ] **Step 2: test 실행 → FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/utils/makeHiddenSkipCol.test.ts
```
Expected: FAIL with "Cannot find module './makeHiddenSkipCol'"

- [ ] **Step 3: 최소 구현**

`apps/web/components/grid/utils/makeHiddenSkipCol.ts`:

```ts
export type ExportableColumn = {
  key: string;
  header: string;
  hidden?: boolean;
};

export function makeHiddenSkipCol<T extends ExportableColumn>(
  cols: readonly T[],
): T[] {
  return cols.filter((c) => !c.hidden);
}
```

- [ ] **Step 4: test 실행 → PASS**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/utils/makeHiddenSkipCol.test.ts
```
Expected: 4 passed

- [ ] **Step 5: branch verify + commit**

```bash
cd C:/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/festive-faraday-d0c615
git rev-parse --abbrev-ref HEAD
# Expected: claude/festive-faraday-d0c615

git add apps/web/components/grid/utils/makeHiddenSkipCol.ts apps/web/components/grid/utils/makeHiddenSkipCol.test.ts
git commit -m "$(cat <<'EOF'
feat(grid): add makeHiddenSkipCol utility for excel export filtering

Filters Hidden:1 columns out of export column defs. Mirrors legacy
ibsheet makeHiddenSkipCol() pattern as pure function over readonly
column array. Generic over T extends ExportableColumn so callers
can pass extended column types (with width, format, etc.).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: validateDuplicateKeys utility

**Goal:** 행 배열에서 다중 키 조합 중복 검출. legacy `dupChk(sheet, "k1|k2|k3")` 동등. **lib/utils** 위치 — UI 컴포넌트 종속 없는 순수 함수.

**Files:**
- Create: `apps/web/lib/utils/validateDuplicateKeys.ts`
- Test: `apps/web/lib/utils/validateDuplicateKeys.test.ts`

- [ ] **Step 1: failing test**

`apps/web/lib/utils/validateDuplicateKeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findDuplicateKeys } from "./validateDuplicateKeys";

describe("findDuplicateKeys", () => {
  it("returns empty when no duplicates", () => {
    const rows = [
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "A", devGbCd: "X", symd: "20260201" },
      { custCd: "B", devGbCd: "X", symd: "20260101" },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "devGbCd", "symd"])).toEqual([]);
  });

  it("returns composite duplicate keys joined with |", () => {
    const rows = [
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "A", devGbCd: "X", symd: "20260101" },
      { custCd: "B", devGbCd: "X", symd: "20260101" },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "devGbCd", "symd"])).toEqual([
      "A|X|20260101",
    ]);
  });

  it("treats null and undefined as empty string in key", () => {
    const rows = [
      { custCd: "A", symd: null as unknown as string },
      { custCd: "A", symd: undefined as unknown as string },
    ];
    expect(findDuplicateKeys(rows, ["custCd", "symd"])).toEqual(["A|"]);
  });

  it("supports number keys", () => {
    const rows = [
      { id: 1, type: 10 },
      { id: 1, type: 10 },
    ];
    expect(findDuplicateKeys(rows, ["id", "type"])).toEqual(["1|10"]);
  });

  it("returns each duplicate exactly once even when triplicated", () => {
    const rows = [
      { k: "A" },
      { k: "A" },
      { k: "A" },
      { k: "B" },
    ];
    expect(findDuplicateKeys(rows, ["k"])).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run lib/utils/validateDuplicateKeys.test.ts
```

- [ ] **Step 3: 구현**

`apps/web/lib/utils/validateDuplicateKeys.ts`:

```ts
export function findDuplicateKeys<T extends Record<string, unknown>>(
  rows: readonly T[],
  keys: readonly (keyof T)[],
): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const row of rows) {
    const composite = keys.map((k) => String(row[k] ?? "")).join("|");
    if (seen.has(composite)) {
      dups.add(composite);
    } else {
      seen.add(composite);
    }
  }
  return Array.from(dups);
}
```

- [ ] **Step 4: PASS**

Expected: 5 passed

- [ ] **Step 5: commit**

```bash
git add apps/web/lib/utils/validateDuplicateKeys.ts apps/web/lib/utils/validateDuplicateKeys.test.ts
git commit -m "$(cat <<'EOF'
feat(lib): add findDuplicateKeys for composite-key validation

Mirrors legacy ibsheet dupChk(sheet, 'k1|k2|k3') pattern as pure
function. Returns each duplicate key once. Used by P2-A in
sales/product-cost-mapping (enterCd|productTypeCd|costCd|sdate)
and admin/infra/licenses (companyCd|devGbCd|symd) before save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: useUrlFilters hook

**Goal:** 검색 폼 필드를 URL searchParams에 영속화. 페이지 이동·새로고침 후에도 검색 조건 유지. legacy `${map.searchXxx}` JSP 패턴 동등.

**Files:**
- Create: `apps/web/lib/hooks/useUrlFilters.ts`
- Test: `apps/web/lib/hooks/useUrlFilters.test.ts`

- [ ] **Step 1: failing test (RTL + Next mock)**

`apps/web/lib/hooks/useUrlFilters.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useUrlFilters } from "./useUrlFilters";

const replaceMock = vi.fn();
let currentSearch = "custNm=acme&page=1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => "/sales/customers",
}));

describe("useUrlFilters", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    currentSearch = "custNm=acme&page=1";
  });

  it("reads initial values from URL searchParams", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "", page: "1" } }),
    );
    expect(result.current.values).toEqual({ custNm: "acme", page: "1" });
  });

  it("falls back to defaults when param missing in URL", () => {
    currentSearch = "page=1";
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "default", page: "1" } }),
    );
    expect(result.current.values.custNm).toBe("default");
  });

  it("setValue pushes new value to URL via router.replace with scroll:false", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "" } }),
    );
    act(() => {
      result.current.setValue("custNm", "globex");
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [url, opts] = replaceMock.mock.calls[0]!;
    expect(url).toContain("custNm=globex");
    expect(url).toMatch(/^\/sales\/customers\?/);
    expect(opts).toEqual({ scroll: false });
  });

  it("setValue with empty string removes the param from URL", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "" } }),
    );
    act(() => {
      result.current.setValue("custNm", "");
    });
    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).not.toContain("custNm=");
  });

  it("reset writes defaults back to URL", () => {
    const { result } = renderHook(() =>
      useUrlFilters({ defaults: { custNm: "", page: "1" } }),
    );
    act(() => {
      result.current.reset();
    });
    const url = replaceMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("page=1");
    expect(url).not.toContain("custNm=");
  });
});
```

- [ ] **Step 2: FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run lib/hooks/useUrlFilters.test.ts
```

- [ ] **Step 3: 구현**

`apps/web/lib/hooks/useUrlFilters.ts`:

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type UseUrlFiltersOptions<T extends Record<string, string>> = {
  defaults: T;
};

export type UseUrlFiltersResult<T extends Record<string, string>> = {
  values: T;
  setValue: <K extends keyof T>(key: K, value: T[K]) => void;
  reset: () => void;
};

export function useUrlFilters<T extends Record<string, string>>(
  options: UseUrlFiltersOptions<T>,
): UseUrlFiltersResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const out = { ...options.defaults };
    for (const key of Object.keys(options.defaults) as (keyof T)[]) {
      const v = searchParams.get(String(key));
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [searchParams, options.defaults]);

  const writeUrl = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(next) as (keyof T)[]) {
        const v = next[key];
        if (v === "" || v == null) params.delete(String(key));
        else params.set(String(key), String(v));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setValue = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      writeUrl({ ...values, [key]: value });
    },
    [values, writeUrl],
  );

  const reset = useCallback(() => {
    writeUrl(options.defaults);
  }, [options.defaults, writeUrl]);

  return { values, setValue, reset };
}
```

- [ ] **Step 4: PASS**

Expected: 5 passed

- [ ] **Step 5: commit**

```bash
git add apps/web/lib/hooks/useUrlFilters.ts apps/web/lib/hooks/useUrlFilters.test.ts
git commit -m "$(cat <<'EOF'
feat(hooks): add useUrlFilters for URL-persisted search state

Mirrors legacy '\${map.searchXxx}' JSP filter persistence. Search form
values are bidirectionally synced with URL searchParams; empty values
are removed from URL (clean URLs). router.replace with scroll:false to
avoid jump. Used by P2-A across all 5 sales grids.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DataGridToolbar wrapper

**Goal:** 5 sales grid 공통 toolbar wrapper — `onExport` slot으로 Excel export 버튼. **DataGrid 본체 미수정** — wrapper로 격리해 P1.5(`groupHeaders` 추가)와 충돌 회피. 사용자 노출 문구는 props passthrough로 baseline은 i18n 미적용.

**Files:**
- Create: `apps/web/components/grid/DataGridToolbar.tsx`
- Test: `apps/web/components/grid/DataGridToolbar.test.tsx`

- [ ] **Step 1: failing test**

`apps/web/components/grid/DataGridToolbar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataGridToolbar } from "./DataGridToolbar";

describe("DataGridToolbar", () => {
  it("renders children inside toolbar", () => {
    render(
      <DataGridToolbar>
        <button>Insert</button>
      </DataGridToolbar>,
    );
    expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
  });

  it("renders export button when onExport provided and calls handler", () => {
    const onExport = vi.fn();
    render(<DataGridToolbar onExport={onExport} exportLabel="엑셀 다운로드" />);
    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("does not render export button when onExport omitted", () => {
    render(<DataGridToolbar exportLabel="엑셀" />);
    expect(screen.queryByRole("button", { name: "엑셀" })).toBeNull();
  });

  it("disables export button when isExporting=true", () => {
    render(
      <DataGridToolbar
        onExport={vi.fn()}
        exportLabel="엑셀"
        isExporting
      />,
    );
    expect(screen.getByRole("button", { name: "엑셀" })).toBeDisabled();
  });

  it("uses default exportLabel='Export' when not provided", () => {
    render(<DataGridToolbar onExport={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/DataGridToolbar.test.tsx
```

- [ ] **Step 3: 구현**

`apps/web/components/grid/DataGridToolbar.tsx`:

```tsx
"use client";

import { type ReactNode } from "react";

export type DataGridToolbarProps = {
  children?: ReactNode;
  onExport?: () => void | Promise<void>;
  exportLabel?: string;
  isExporting?: boolean;
};

export function DataGridToolbar({
  children,
  onExport,
  exportLabel = "Export",
  isExporting = false,
}: DataGridToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">{children}</div>
      {onExport ? (
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={isExporting}
          className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {exportLabel}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: PASS**

Expected: 5 passed

- [ ] **Step 5: commit**

```bash
git add apps/web/components/grid/DataGridToolbar.tsx apps/web/components/grid/DataGridToolbar.test.tsx
git commit -m "$(cat <<'EOF'
feat(grid): add DataGridToolbar wrapper with onExport slot

Provides Excel export button as wrapper around DataGrid (DataGrid body
unchanged to avoid conflict with P1.5 groupHeaders prop). All user-
visible labels are passthrough props (no i18n in baseline). P2-A wires
exportLabel to t('Sales.Common.Excel.label') etc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CodeGroupPopupLauncher

**Goal:** 코드 그룹(B10025 회사 popup 등) 선택 popup 런처. legacy `OnPopupClick` + `setColProperty popup` 동등. shadcn-style Dialog는 미설치이므로 native `<dialog>` 대체로 inline modal 구현.

**Files:**
- Create: `apps/web/components/grid/CodeGroupPopupLauncher.tsx`
- Test: `apps/web/components/grid/CodeGroupPopupLauncher.test.tsx`

- [ ] **Step 1: failing test**

`apps/web/components/grid/CodeGroupPopupLauncher.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeGroupPopupLauncher } from "./CodeGroupPopupLauncher";

const items = [
  { code: "C001", label: "ACME Corp" },
  { code: "C002", label: "Globex" },
];

describe("CodeGroupPopupLauncher", () => {
  it("renders trigger button with label", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "회사 선택" }),
    ).toBeInTheDocument();
  });

  it("opens popup and lists items on trigger click", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사 선택" }));
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("calls onSelect with item and closes popup", () => {
    const onSelect = vi.fn();
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사 선택" }));
    fireEvent.click(screen.getByText("Globex"));
    expect(onSelect).toHaveBeenCalledWith({ code: "C002", label: "Globex" });
    expect(screen.queryByText("ACME Corp")).toBeNull();
  });

  it("filters items when searchable=true", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사"
        items={items}
        onSelect={vi.fn()}
        searchable
        searchPlaceholder="검색"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), {
      target: { value: "Glo" },
    });
    expect(screen.queryByText("ACME Corp")).toBeNull();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("renders empty state when no items match filter", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사"
        items={items}
        onSelect={vi.fn()}
        searchable
        searchPlaceholder="검색"
        emptyLabel="결과 없음"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), {
      target: { value: "ZZZ" },
    });
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: FAIL**

```bash
pnpm --filter @jarvis/web exec vitest run components/grid/CodeGroupPopupLauncher.test.tsx
```

- [ ] **Step 3: 구현**

`apps/web/components/grid/CodeGroupPopupLauncher.tsx`:

```tsx
"use client";

import { useState } from "react";

export type CodeGroupItem = {
  code: string;
  label: string;
};

export type CodeGroupPopupLauncherProps = {
  triggerLabel: string;
  items: readonly CodeGroupItem[];
  onSelect: (item: CodeGroupItem) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

export function CodeGroupPopupLauncher({
  triggerLabel,
  items,
  onSelect,
  searchable = false,
  searchPlaceholder = "Search",
  emptyLabel = "No results",
}: CodeGroupPopupLauncherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered =
    searchable && query
      ? items.filter(
          (it) =>
            it.label.toLowerCase().includes(query.toLowerCase()) ||
            it.code.toLowerCase().includes(query.toLowerCase()),
        )
      : items;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
        >
          <div
            className="max-h-[60vh] w-80 overflow-auto rounded bg-white p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {searchable ? (
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
              />
            ) : null}
            <ul className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-slate-500">
                  {emptyLabel}
                </li>
              ) : (
                filtered.map((it) => (
                  <li key={it.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(it);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">
                        {it.label}
                      </span>
                      <span className="ml-2 text-slate-500">{it.code}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: PASS**

Expected: 5 passed

- [ ] **Step 5: commit**

```bash
git add apps/web/components/grid/CodeGroupPopupLauncher.tsx apps/web/components/grid/CodeGroupPopupLauncher.test.tsx
git commit -m "$(cat <<'EOF'
feat(grid): add CodeGroupPopupLauncher for code-group selection

Mirrors legacy OnPopupClick + B10025-style code group popup. Optional
search filter (case-insensitive on both label and code). All visible
labels are props (i18n in caller). Click outside to dismiss. P2-A
wires this to admin/infra/licenses company selection, etc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: jarvis-architecture skill — ibsheet 이벤트 → React 매핑 섹션

**Goal:** 영구 도메인 지식. P2-A · P2 본진 · 후속 영업 작업자가 빠르게 ibsheet → React 매핑을 찾을 수 있도록 skill에 섹션 + 변경 이력 추가.

**Files:**
- Modify: `.claude/skills/jarvis-architecture/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: skill에 섹션 append**

`.claude/skills/jarvis-architecture/SKILL.md` 끝에 다음을 추가:

```markdown

## ibsheet 이벤트 → React 매핑 (영업관리 포팅 가이드)

레거시 `apps/web/app/(app)/sales/**` 기반은 `.local/영업관리모듈/jsp_biz/` ibsheet JSP. React 포팅 시 매핑 표:

| ibsheet 이벤트/함수 | React 동등 패턴 | baseline |
|---|---|---|
| `sheet1_OnSearchEnd` | server action `result.then(setRows)` | server action |
| `sheet1_OnSaveEnd` | mutate → revalidatePath | server action |
| `sheet1_OnClick` | `<tr onClick>` | DataGrid built-in |
| `sheet1_OnDblClick` | `<tr onDoubleClick={() => router.push(...)}` | wrapper (P2 본진) |
| `sheet1_OnPopupClick` | `<CodeGroupPopupLauncher>` | `apps/web/components/grid/CodeGroupPopupLauncher.tsx` |
| `sheet1_OnAfterClick` | useEffect on row select | hook |
| `sheet1.DoSearch()` | server action 호출 | server action |
| `sheet1.DoSave()` | server action `saveXxx({ creates, updates, deletes })` | server action |
| `sheet1.Down2Excel()` | server action + `<DataGridToolbar onExport>` | `apps/web/components/grid/DataGridToolbar.tsx` |
| `makeHiddenSkipCol(sheet)` | `makeHiddenSkipCol(cols)` 순수 함수 | `apps/web/components/grid/utils/makeHiddenSkipCol.ts` |
| `dupChk(sheet, "k1\|k2\|k3")` | `findDuplicateKeys(rows, ["k1","k2","k3"])` | `apps/web/lib/utils/validateDuplicateKeys.ts` |
| `${map.searchXxx}` (filter persistence) | `useUrlFilters({ defaults })` | `apps/web/lib/hooks/useUrlFilters.ts` |
| `setSheetAutocompleteEmp()` | `<EmployeePicker>` (P2-A 시점 신설) | (TBD) |
| `IBS_SaveName(form, sheet)` | server action 직접 (Zod schema가 shape 강제) | — |
| Hidden:0/1 컬럼 정책 | `hidden: true` GridColumn 옵션 | DataGrid built-in |

### 참고 레거시 소스 (메모리 reference)
- 위치: `.local/영업관리모듈/jsp_biz/biz/{activity,contract,contrect}/**/*.jsp` (60 JSP)
- P1 5화면 ↔ 레거시 매핑: 메모리 `reference_sales_p1_mapping.md`
- Hidden:0|1 SoT 정책: 메모리 `feedback_legacy_ibsheet_hidden_policy.md`

### baseline 적용 시점
- **P2-A 세션** (별도 worktree): 5 sales 화면(customers, customer-contacts, product-cost-mapping, mail-persons, admin/infra/licenses)에 baseline 적용
- **P2 본진 세션** (별도 worktree): 사이드바 4탭 + master-detail edit pages에서 `useUrlFilters` 활용
- **P2 plan 신규 라우트** (sales-opportunities/activities/dashboard): baseline 활용 권장 (P2 worktree main rebase 후 import 가능)
```

- [ ] **Step 2: CLAUDE.md 변경 이력에 1줄 추가**

`CLAUDE.md`의 변경 이력 표에 마지막 행 추가:

```
| 2026-05-01 | ibsheet 행동 패리티 baseline 5종 신설 + jarvis-architecture skill에 매핑 섹션 추가 | `apps/web/components/grid/{utils/makeHiddenSkipCol,DataGridToolbar,CodeGroupPopupLauncher}`, `apps/web/lib/{hooks/useUrlFilters,utils/validateDuplicateKeys}`, `.claude/skills/jarvis-architecture/SKILL.md` | P1.5(컬럼 fix) + P2(신규 라우트)와 평행 진행되는 행동 layer 인프라. 5 GridContainer + DataGrid 본체 미수정으로 충돌 회피. P2-A 세션이 5 화면에 적용. |
```

- [ ] **Step 3: commit**

```bash
git add .claude/skills/jarvis-architecture/SKILL.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(skill): add ibsheet event -> React mapping table to jarvis-architecture

Permanent domain reference for sales mgmt porting. Maps 14 ibsheet
events/functions to React equivalents and links to 5 baseline files.
Used by P2-A and P2 본진 worktrees. CLAUDE.md history updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 검증 게이트 + plan commit + PR

**Goal:** 4 검증 게이트 일괄 실행 → plan doc commit → PR 생성.

- [ ] **Step 1: type-check**

```bash
pnpm --filter @jarvis/web type-check
```
Expected: 0 errors

- [ ] **Step 2: lint**

```bash
pnpm --filter @jarvis/web lint
```
Expected: 0 errors

- [ ] **Step 3: full vitest scope (5 test files)**

```bash
pnpm --filter @jarvis/web exec vitest run \
  components/grid/utils/makeHiddenSkipCol.test \
  components/grid/DataGridToolbar.test \
  components/grid/CodeGroupPopupLauncher.test \
  lib/hooks/useUrlFilters.test \
  lib/utils/validateDuplicateKeys.test
```
Expected: 24 tests passed (4+5+5+5+5)

- [ ] **Step 4: audit:rsc**

```bash
pnpm audit:rsc
```
Expected: PASS — 신규 client 컴포넌트 3개(`DataGridToolbar`, `CodeGroupPopupLauncher`, `useUrlFilters`) 모두 `"use client"` 선언, server 환경 import 안 됨.

- [ ] **Step 5: plan doc commit**

```bash
git add docs/superpowers/plans/2026-05-01-sales-ibsheet-baseline.md
git commit -m "$(cat <<'EOF'
docs(plans): add sales ibsheet baseline plan (disposable)

7-task plan covering 5 baseline utilities/components + skill doc.
Removed after PR merge per memory rule (plans are disposable).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: branch verify + push + PR**

```bash
cd C:/Users/sp20171217yw/Desktop/Devdev/jarvis/.claude/worktrees/festive-faraday-d0c615
git rev-parse --abbrev-ref HEAD
# Expected: claude/festive-faraday-d0c615

git push -u origin claude/festive-faraday-d0c615
gh pr create --title "feat(sales): ibsheet behavior parity baseline (5 utilities/components)" --body "$(cat <<'EOF'
## Summary
- 5 신규 파일: `makeHiddenSkipCol`, `validateDuplicateKeys`, `useUrlFilters`, `DataGridToolbar`, `CodeGroupPopupLauncher` — 영업관리 ibsheet 행동 패리티 인프라
- DataGrid 본체 + 5 GridContainer 모두 미수정 (P1.5/P2 worktree와 충돌 회피)
- jarvis-architecture skill에 영구 매핑 섹션 추가 (14 항목)

## Dependency
- 없음 (가장 빠르게 머지 가능)

## Related
- P1.5 (eager-ritchie-9f4a82): 컬럼/도메인/스키마 fix
- P2 (bold-noether-742a91): 신규 3 라우트(영업기회/활동/dashboard)
- P2-A (별도 worktree): 위 3개 모두 머지 후 5 화면에 baseline 적용

## Test plan
- [x] 5 vitest unit test (24 tests) 통과
- [x] type-check / lint 통과
- [x] audit:rsc 통과
- [ ] 머지 후 P2-A 세션이 5 화면에 적용 (별도 PR)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage (사용자 합의 산출물 매핑)
- makeHiddenSkipCol → Task 1 ✓
- validateDuplicateKeys → Task 2 ✓
- useUrlFilters → Task 3 ✓
- DataGridToolbar → Task 4 ✓
- CodeGroupPopupLauncher → Task 5 ✓
- jarvis-architecture skill 매핑 섹션 → Task 6 ✓
- 검증 + plan commit + PR → Task 7 ✓

### Placeholder scan
- 모든 step 실제 코드/명령 포함 ✓
- "TODO/TBD/적절한 처리" 등 금지 패턴 없음 ✓

### Type consistency
- `ExportableColumn` (Task 1) — generic 형태로 export, 외부 호출자가 확장 가능
- `findDuplicateKeys` (Task 2) — 함수명 일관, 다른 task에서 재인용 시 이 이름 사용
- `useUrlFilters` (Task 3) — `values` / `setValue` / `reset` 인터페이스 일관
- `DataGridToolbarProps` (Task 4) — 4 prop(`children`/`onExport`/`exportLabel`/`isExporting`) 일관, test가 모두 검증
- `CodeGroupItem` / `CodeGroupPopupLauncherProps` (Task 5) — 일관, `emptyLabel` 추가됨

---

## Execution Handoff

Plan 작성 완료. **subagent-driven-development**(권장)로 SDD 진입.
