import { describe, it, expect } from "vitest";
import {
  excelDateToISO,
  parseRequestSheet,
  parseMonthHeatmap,
} from "../migrate-add-dev-from-xls.js";

describe("migrate-add-dev-from-xls", () => {
  it("excelDateToISO converts 45689 to 2025-02-01", () => {
    expect(excelDateToISO(45689)).toBe("2025-02-01");
  });

  it("excelDateToISO extracts YYYY-MM from date via slice", () => {
    expect(excelDateToISO(45689).slice(0, 7)).toBe("2025-02");
  });

  it("parseRequestSheet skips 2 header rows and returns normalized objects", () => {
    const rows = [
      ['No', '요청회사', '요청년월', '요청순번', '진행상태', '파트', '요청자', '요청내용', '', '', '유상여부', '', '계산서', '계약시작', '계약종료', '', '', '예상공수', '실제공수', '비고'],
      [],
      [1, '솔브레인', 45689, 28, '협의중', 'Saas', '', '디엔에프 법인추가 2차', '', '', 'Y', '', 'N', 45689, 45717, '', '', 3.5, 4.0, '메모'],
    ];
    const parsed = parseRequestSheet(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].requestCompany).toBe('솔브레인');
    expect(parsed[0].status).toBe('협의중');
    expect(parsed[0].isPaid).toBe(true);
    expect(parsed[0].invoiceIssued).toBe(false);
    expect(parsed[0].requestYearMonth).toBe('2025-02');
    expect(parsed[0].requestSequence).toBe(28);
    expect(parsed[0].estimatedEffort).toBe('3.5');
  });

  it("parseRequestSheet filters out rows with no company", () => {
    const rows = [
      ['headers'], [],
      [1, '', 45689, 1, '협의중'],
      [2, '솔브레인', 45689, 2, '진행중'],
    ];
    const parsed = parseRequestSheet(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].requestCompany).toBe('솔브레인');
  });

  it("parseMonthHeatmap extracts non-zero monthly cells tagged with yearMonth", () => {
    const rows = [
      ['headers'], [],
      // 10 cols padding, then 12 month cells (Jan..Dec)
      [null, null, null, null, null, null, null, null, null, null, 0, 2.5, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const map = parseMonthHeatmap(rows, 10, 2025);
    expect(map.size).toBe(1);
    const cells = map.get(0)!;
    // Non-zero at col offset 1 (Feb) and 3 (Apr)
    expect(cells).toHaveLength(2);
    expect(cells[0].yearMonth).toBe('2025-02');
    expect(cells[0].value).toBe(2.5);
    expect(cells[1].yearMonth).toBe('2025-04');
    expect(cells[1].value).toBe(3);
  });
});
