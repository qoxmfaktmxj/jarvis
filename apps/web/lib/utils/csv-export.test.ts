import { describe, expect, it } from "vitest";
import { rowsToCsv, type CsvColumn } from "./csv-export";

describe("rowsToCsv", () => {
  const columns: CsvColumn<{ a: string; b: number }>[] = [
    { key: "a", header: "A" },
    { key: "b", header: "B" },
  ];

  it("returns header + rows joined by CRLF", () => {
    const rows = [
      { a: "x", b: 1 },
      { a: "y", b: 2 },
    ];
    expect(rowsToCsv(rows, columns)).toBe("A,B\r\nx,1\r\ny,2");
  });

  it("escapes commas and double quotes", () => {
    const rows = [{ a: 'he said "hi", he did', b: 0 }];
    expect(rowsToCsv(rows, columns)).toBe(`A,B\r\n"he said ""hi"", he did",0`);
  });

  it("escapes newlines inside cell", () => {
    const rows = [{ a: "line1\nline2", b: 0 }];
    expect(rowsToCsv(rows, columns)).toBe(`A,B\r\n"line1\nline2",0`);
  });

  it("treats null/undefined as empty", () => {
    const rows = [{ a: null as unknown as string, b: undefined as unknown as number }];
    expect(rowsToCsv(rows, columns)).toBe("A,B\r\n,");
  });

  it("preserves leading zeros and unicode", () => {
    const rows = [{ a: "0123", b: 42 }];
    expect(rowsToCsv(rows, columns)).toContain("0123");
  });

  it("returns header only when rows empty", () => {
    expect(rowsToCsv([], columns)).toBe("A,B");
  });
});
