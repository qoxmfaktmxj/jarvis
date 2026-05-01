import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportableColumn } from "./makeHiddenSkipCol";

// xlsx를 모듈 단위로 모킹 — writeFile은 실제 파일을 쓰지 않도록 차단.
const aoaToSheetSpy = vi.fn((aoa: unknown[][]) => ({ __aoa: aoa }));
const bookNewSpy = vi.fn(() => ({ SheetNames: [] as string[], Sheets: {} as Record<string, unknown> }));
const bookAppendSheetSpy = vi.fn(
  (book: { SheetNames: string[]; Sheets: Record<string, unknown> }, sheet: unknown, name: string) => {
    book.SheetNames.push(name);
    book.Sheets[name] = sheet;
  },
);
const writeFileSpy = vi.fn();

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: aoaToSheetSpy,
    book_new: bookNewSpy,
    book_append_sheet: bookAppendSheetSpy,
  },
  writeFile: writeFileSpy,
}));

// window 가드를 통과시키기 위해 jsdom 환경을 명시(파일 단위).
// vitest config가 jsdom을 기본으로 두지만, Node 환경에서 테스트가 도는 경우를 대비.
// @vitest-environment jsdom

import { exportToExcel } from "./excelExport";

type Row = {
  id: string;
  name: string;
  isActive: boolean;
  amount: number | null;
};

const rows: Row[] = [
  { id: "A1", name: "회사 A", isActive: true, amount: 1000 },
  { id: "B2", name: "회사 B", isActive: false, amount: null },
];

const cols: (ExportableColumn & { kind?: string })[] = [
  { key: "id", header: "코드", hidden: true }, // hidden → 제외
  { key: "name", header: "회사명" },
  { key: "isActive", header: "사용여부" },
  { key: "amount", header: "금액", hidden: false },
];

beforeEach(() => {
  aoaToSheetSpy.mockClear();
  bookNewSpy.mockClear();
  bookAppendSheetSpy.mockClear();
  writeFileSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportToExcel", () => {
  it("filters hidden columns via makeHiddenSkipCol (id 컬럼 제외)", async () => {
    await exportToExcel({
      filename: "companies",
      columns: cols,
      rows,
    });

    expect(aoaToSheetSpy).toHaveBeenCalledTimes(1);
    const aoa = aoaToSheetSpy.mock.calls[0]?.[0] as unknown[][];
    // header
    expect(aoa[0]).toEqual(["회사명", "사용여부", "금액"]);
    // 첫번째 데이터 행: id 칼럼 빠지고 boolean 그대로 통과
    expect(aoa[1]).toEqual(["회사 A", true, 1000]);
    // null → 빈 문자열
    expect(aoa[2]).toEqual(["회사 B", false, ""]);
  });

  it("applies cellFormatter to convert booleans to 사용/사용안함", async () => {
    await exportToExcel<Row, ExportableColumn>({
      filename: "companies-formatted",
      columns: cols,
      rows,
      cellFormatter: (row, col) => {
        const v = (row as unknown as Record<string, unknown>)[col.key];
        if (col.key === "isActive") return v ? "사용" : "사용안함";
        if (v === null || v === undefined) return "";
        return v as string | number | boolean;
      },
    });

    const aoa = aoaToSheetSpy.mock.calls[0]?.[0] as unknown[][];
    expect(aoa[1]).toEqual(["회사 A", "사용", 1000]);
    expect(aoa[2]).toEqual(["회사 B", "사용안함", ""]);
  });

  it("builds header row from column.header labels", async () => {
    await exportToExcel({
      filename: "headers",
      columns: [
        { key: "a", header: "에이" },
        { key: "b", header: "비" },
      ] satisfies ExportableColumn[],
      rows: [{ a: 1, b: 2 }],
    });

    const aoa = aoaToSheetSpy.mock.calls[0]?.[0] as unknown[][];
    expect(aoa[0]).toEqual(["에이", "비"]);
  });

  it("calls XLSX.writeFile with .xlsx extension and sanitized sheet name", async () => {
    await exportToExcel({
      filename: "companies",
      sheetName: "회사/마스터:[2026]", // 금지문자 포함
      columns: cols,
      rows,
    });

    expect(writeFileSpy).toHaveBeenCalledTimes(1);
    const [book, filename] = writeFileSpy.mock.calls[0] ?? [];
    expect(filename).toBe("companies.xlsx");

    expect(bookAppendSheetSpy).toHaveBeenCalledTimes(1);
    const sheetName = bookAppendSheetSpy.mock.calls[0]?.[2];
    // ":" "/" "[" "]" 모두 Excel 시트명 금지문자 → "_"
    expect(sheetName).toBe("회사_마스터__2026_");
    expect((book as { SheetNames: string[] }).SheetNames).toContain(sheetName);
  });

  it("does not double-append .xlsx when filename already has it", async () => {
    await exportToExcel({
      filename: "already.xlsx",
      columns: [{ key: "a", header: "A" }] satisfies ExportableColumn[],
      rows: [{ a: 1 }],
    });
    const [, filename] = writeFileSpy.mock.calls[0] ?? [];
    expect(filename).toBe("already.xlsx");
  });

  it("defaults sheet name to 'Sheet1' when not provided", async () => {
    await exportToExcel({
      filename: "default-sheet",
      columns: [{ key: "a", header: "A" }] satisfies ExportableColumn[],
      rows: [{ a: 1 }],
    });
    expect(bookAppendSheetSpy.mock.calls[0]?.[2]).toBe("Sheet1");
  });
});
