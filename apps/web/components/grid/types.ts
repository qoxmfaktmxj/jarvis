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
  label: string; // i18n key suffix (tNamespace + ".columns." + label)
  type: "text" | "textarea" | "select" | "date" | "boolean" | "numeric" | "readonly";
  width?: number;
  editable?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  render?: (row: T) => ReactNode; // type=readonly 커스텀 렌더링
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
  /** Optional className for the group cell (e.g., bg-slate-100) */
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
