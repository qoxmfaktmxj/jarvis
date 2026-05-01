// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DataGrid } from "../DataGrid";
import type { ColumnDef, GridSaveResult, GroupHeader } from "../types";

afterEach(() => cleanup());

type Row = { id: string; a: string; b: string; c: string; d: string };

const baseColumns: ColumnDef<Row>[] = [
  { key: "a", label: "A", type: "text", editable: true },
  { key: "b", label: "B", type: "text", editable: true },
  { key: "c", label: "C", type: "text", editable: true },
  { key: "d", label: "D", type: "text", editable: true },
];

const noopSave = async (): Promise<GridSaveResult> => ({ ok: true });

function renderGrid(props: { groupHeaders?: GroupHeader[] }) {
  const rows: Row[] = [{ id: "1", a: "1", b: "2", c: "3", d: "4" }];
  return render(
    <DataGrid<Row>
      rows={rows}
      total={rows.length}
      columns={baseColumns}
      filters={[]}
      page={1}
      limit={50}
      makeBlankRow={() => ({ id: "blank", a: "", b: "", c: "", d: "" })}
      onPageChange={vi.fn()}
      onFilterChange={vi.fn()}
      onSave={noopSave}
      groupHeaders={props.groupHeaders}
    />,
  );
}

describe("DataGrid — groupHeaders prop", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("renders group header row with labels and correct colSpans when sums match", () => {
    renderGrid({
      groupHeaders: [
        { label: "기본 정보", span: 2 },
        { label: "추가 정보", span: 2 },
      ],
    });
    const groupRow = screen.getByTestId("group-header-row");
    expect(groupRow).toBeInTheDocument();
    const groupCells = groupRow.querySelectorAll("th[colspan='2']");
    // Two group headers each colSpan=2 (the leading colSpan=2 placeholder is also colspan=2,
    // so we check label presence rather than rely solely on selector count).
    expect(groupCells.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("기본 정보")).toBeInTheDocument();
    expect(screen.getByText("추가 정보")).toBeInTheDocument();
  });

  it("applies the optional className to a group cell", () => {
    renderGrid({
      groupHeaders: [
        { label: "기본 정보", span: 2, className: "bg-emerald-100" },
        { label: "추가 정보", span: 2 },
      ],
    });
    const cell = screen.getByText("기본 정보");
    expect(cell.className).toContain("bg-emerald-100");
  });

  it("logs a dev warning when span sum does not equal columns.length", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderGrid({
      // sum=3 vs columns.length=4 → mismatch
      groupHeaders: [
        { label: "잘못된 그룹", span: 1 },
        { label: "또 다른 그룹", span: 2 },
      ],
    });
    const found = warnSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("groupHeaders span sum"),
    );
    expect(found).toBe(true);
  });

  it("does NOT log a warning when sums match", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderGrid({
      groupHeaders: [
        { label: "그룹1", span: 2 },
        { label: "그룹2", span: 2 },
      ],
    });
    const found = warnSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("groupHeaders span sum"),
    );
    expect(found).toBe(false);
  });

  it("is optional — without groupHeaders no group row is rendered", () => {
    renderGrid({});
    expect(screen.queryByTestId("group-header-row")).toBeNull();
    // Column headers still render
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("renders group row above the column header row inside the same thead", () => {
    const { container } = renderGrid({
      groupHeaders: [
        { label: "G1", span: 2 },
        { label: "G2", span: 2 },
      ],
    });
    const thead = container.querySelector("thead");
    expect(thead).not.toBeNull();
    const rows = thead!.querySelectorAll("tr");
    // First row = group header, second row = column header
    expect(rows[0]?.getAttribute("data-testid")).toBe("group-header-row");
    expect(rows[1]?.textContent).toContain("No");
    expect(rows[1]?.textContent).toContain("A");
  });
});
