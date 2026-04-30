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
  type: "text" | "select" | "date" | "boolean" | "readonly";
  width?: number;
  editable?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  render?: (row: T) => ReactNode; // type=readonly 커스텀 렌더링
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
