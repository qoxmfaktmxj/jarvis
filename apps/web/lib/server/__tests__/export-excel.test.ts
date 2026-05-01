import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { exportToExcel } from "../export-excel";
import type { ColumnDef } from "@/components/grid/types";

type Row = { id: string; name: string; secret?: string };

const columns: ColumnDef<Row>[] = [
  { key: "id", label: "ID", type: "readonly" },
  { key: "name", label: "Name", type: "text" },
];

describe("exportToExcel", () => {
  it("returns a Buffer that XLSX can parse", async () => {
    const buf = await exportToExcel<Row>({
      rows: [{ id: "1", name: "alice" }],
      columns,
      sheetName: "test",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toContain("test");
  });

  it("respects column order in header row", async () => {
    const buf = await exportToExcel<Row>({
      rows: [{ id: "1", name: "alice" }],
      columns,
      sheetName: "Sheet1",
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sheet = wb.Sheets["Sheet1"]!;
    expect(sheet["A1"].v).toBe("ID");
    expect(sheet["B1"].v).toBe("Name");
    expect(sheet["A2"].v).toBe("1");
    expect(sheet["B2"].v).toBe("alice");
  });

  it("excludes columns not in `columns` arg (used as Hidden filter)", async () => {
    const buf = await exportToExcel<Row>({
      rows: [{ id: "1", name: "alice", secret: "leaked" }],
      columns,
      sheetName: "Sheet1",
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sheet = wb.Sheets["Sheet1"]!;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    expect(csv).not.toContain("leaked");
  });

  it("handles empty rows", async () => {
    const buf = await exportToExcel<Row>({ rows: [], columns, sheetName: "s" });
    const wb = XLSX.read(buf, { type: "buffer" });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sheet = wb.Sheets["s"]!;
    expect(sheet["A1"].v).toBe("ID");
    expect(sheet["A2"]).toBeUndefined();
  });

  it("serializes null/undefined cells as empty strings", async () => {
    const buf = await exportToExcel<{ id: string; name: string | null }>({
      rows: [{ id: "1", name: null }],
      columns: [
        { key: "id", label: "ID", type: "readonly" },
        { key: "name", label: "Name", type: "text" },
      ],
      sheetName: "s",
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const sheet = wb.Sheets["s"]!;
    expect(sheet["B2"]?.v ?? "").toBe("");
  });
});
