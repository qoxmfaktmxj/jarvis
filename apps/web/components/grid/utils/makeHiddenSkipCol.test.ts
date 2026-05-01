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
