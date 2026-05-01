/**
 * apps/web/components/grid/utils/excelExport.ts
 *
 * SheetJS(xlsx) 기반 그리드 Excel 내보내기 유틸리티.
 *
 * - `makeHiddenSkipCol`을 통해 hidden 컬럼을 제외한 뒤,
 *   `aoa_to_sheet` → `book_new` → `writeFile` 순서로 .xlsx 다운로드를 트리거한다.
 * - `xlsx`는 lazy-import로 로드해 초기 번들에 들어가지 않는다.
 * - 브라우저 전용(`XLSX.writeFile`이 `window`에 의존). SSR/Node에서 호출 시 throw.
 *
 * 컨슈머는 `<DataGridToolbar onExport={...}>` 슬롯에 `() => exportToExcel({ ... })`
 * 를 그대로 넘기면 된다. 컬럼 정의는 `ExportableColumn`(=`makeHiddenSkipCol`의
 * 입력 계약)을 따르며, 도메인 그리드의 `ColumnDef<T>`는 호출부에서
 * `{ key, header: t(label), hidden? }` 모양으로 매핑해서 넘긴다.
 */

import {
  makeHiddenSkipCol,
  type ExportableColumn,
} from "./makeHiddenSkipCol";

/**
 * 셀 값으로 사용 가능한 원시 타입.
 * `XLSX.utils.aoa_to_sheet`가 받아들이는 스칼라.
 */
export type ExcelCellValue = string | number | boolean | null;

export type ExcelCellFormatter<
  TRow,
  TCol extends ExportableColumn = ExportableColumn,
> = (row: TRow, col: TCol) => ExcelCellValue;

export type ExcelExportOptions<
  TRow = Record<string, unknown>,
  TCol extends ExportableColumn = ExportableColumn,
> = {
  /** 확장자 제외 파일명 (자동으로 `.xlsx` 부착) */
  filename: string;
  /** 시트 이름 (기본: "Sheet1"). Excel 제한으로 31자 + 금지문자 처리됨. */
  sheetName?: string;
  /** 컬럼 목록. hidden=true 인 컬럼은 `makeHiddenSkipCol` 로 제외된다. */
  columns: readonly TCol[];
  /** 행 데이터 */
  rows: readonly TRow[];
  /**
   * 셀 표시값 변환기. 기본은 `String(row[col.key] ?? "")`.
   * boolean → "사용/사용안함" 같은 도메인 매핑은 컨슈머 책임.
   */
  cellFormatter?: ExcelCellFormatter<TRow, TCol>;
};

/**
 * Excel 시트명 sanitize.
 * - 31자 제한
 * - 금지 문자(`: \ / ? * [ ]`) → `_`
 */
function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet1";
}

/**
 * 기본 셀 포매터: `row[col.key]` 를 그대로 노출.
 * `null`/`undefined`는 빈 문자열로, 그 외는 원시값(string/number/boolean) 그대로.
 */
function defaultCellFormatter<TRow, TCol extends ExportableColumn>(
  row: TRow,
  col: TCol,
): ExcelCellValue {
  const v = (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  return String(v);
}

/**
 * Browser에서 .xlsx 파일 다운로드를 트리거한다.
 *
 * @example
 *   await exportToExcel({
 *     filename: `companies-${new Date().toISOString().slice(0,10)}`,
 *     sheetName: "회사 마스터",
 *     columns: gridCols.map(c => ({ key: c.key, header: t(`columns.${c.label}`) })),
 *     rows: filteredRows,
 *     cellFormatter: (row, col) => col.key === "isActive"
 *       ? row[col.key] ? "사용" : "사용안함"
 *       : (row[col.key] ?? null),
 *   });
 */
export async function exportToExcel<
  TRow = Record<string, unknown>,
  TCol extends ExportableColumn = ExportableColumn,
>(opts: ExcelExportOptions<TRow, TCol>): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error(
      "exportToExcel must be called from the browser (window is undefined).",
    );
  }

  const visibleCols = makeHiddenSkipCol(opts.columns);
  const formatter: ExcelCellFormatter<TRow, TCol> =
    opts.cellFormatter ?? defaultCellFormatter;

  const header = visibleCols.map((c) => c.header);
  const body = opts.rows.map((row) =>
    visibleCols.map((col) => formatter(row, col)),
  );
  const aoa: ExcelCellValue[][] = [header, ...body];

  // Lazy-import: xlsx는 큰 라이브러리라 초기 번들에 두지 않는다.
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    sheet,
    sanitizeSheetName(opts.sheetName ?? "Sheet1"),
  );

  const filename = opts.filename.endsWith(".xlsx")
    ? opts.filename
    : `${opts.filename}.xlsx`;
  XLSX.writeFile(book, filename);
}
