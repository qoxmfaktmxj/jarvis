/**
 * apps/web/components/grid/types.ts
 *
 * 공통 DataGrid 타입 정의.
 * 모든 그리드 도메인(companies, sales/*)이 이 타입을 사용한다.
 */
import type { ReactNode } from "react";

export type RowStatus = "clean" | "new" | "dirty" | "deleted";

export type ColumnDef<T> = {
  key: keyof T & string;
  label: string; // Display string. Callers resolve i18n via t(...) before constructing the ColumnDef.
  type: "text" | "textarea" | "select" | "date" | "boolean" | "numeric" | "readonly";
  width?: number;
  editable?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  render?: (row: T) => ReactNode; // type=readonly 커스텀 렌더링
  /**
   * For type="numeric": column stores integer (Zod `.int()`).
   *
   *  - true  → commits as `number` (e.g. legacySeq, personCnt, sortOrder).
   *  - false / undefined → commits as `string` (Drizzle `numeric()` SoT —
   *    preserves precision + trailing zeros for KRW/rate/decimal amounts).
   *
   * Ignored for non-numeric column types. (A5 audit P0-1 / P0-2, 2026-05-11.)
   */
  integer?: boolean;
  /**
   * 신규 행에서만 편집 가능. 기존(saved) 행에서는 readonly로 표시.
   *
   * 사용처: PK / 식별자 컬럼 — `code`, `employeeId` 등 한 번 INSERT 후 변경
   * 금지인 컬럼. legacy ibsheet `KeyField:1` 패턴 대체.
   *
   * 동작:
   *  - `r.state === "new"` → editable 셀로 렌더
   *  - 그 외 (`clean`/`dirty`/`deleted`) → readonly 셀로 렌더
   *
   * `editable: false`와 조합 시 항상 readonly (lockOnExisting 무시).
   * `readOnly` (그리드 전체 readonly) 적용 시도 readonly로 강제.
   */
  lockOnExisting?: boolean;
  /**
   * 도메인 전용 셀 렌더러 주입. cellEditable 분기 후 `col.type`보다 우선 적용.
   *
   * 사용처: IconPickerCell 같이 DataGrid 표준 타입에 없는 도메인 전용 편집 셀.
   * `editor`가 있으면 DataGrid는 type 기반 EditableXxxCell 대신 이 함수의
   * 반환값을 렌더한다.
   *
   * ctx.disabled는 그리드 readOnly 또는 lockOnExisting 적용 시 true.
   * ctx.commit: (next: unknown) => void
   */
  editor?: (ctx: {
    row: T;
    value: unknown;
    commit: (next: unknown) => void;
    disabled: boolean;
  }) => ReactNode;
};

/**
 * 그룹 헤더 셀 정의. column 헤더 위에 한 줄 더 렌더링되는 colspan 셀.
 * span 합계는 columns.length와 같아야 한다 (dev에서 console.warn).
 */
export type GroupHeader = {
  /** Korean label rendered as a colspanned cell above column headers */
  label: string;
  /** Number of columns this group spans (matches the order of `columns`) */
  span: number;
  /** Optional className for the group cell (e.g., bg-(--bg-page)) */
  className?: string;
};

export type FilterDef<T> = {
  key: keyof T & string;
  type: "text" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export type GridChanges<T> = {
  creates: T[];
  updates: { id: string; patch: Partial<T> }[];
  deletes: string[];
};

export type GridSaveResult = {
  ok: boolean;
  created?: string[];
  updated?: string[];
  deleted?: string[];
  errors?: { id?: string; message: string }[];
};
