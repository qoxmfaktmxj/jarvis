// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DataGrid } from "../DataGrid";
import type { ColumnDef, GridSaveResult } from "../types";

afterEach(() => cleanup());

type Row = { id: string; name: string; price: number | null };

const noopSave = async (): Promise<GridSaveResult> => ({ ok: true });

function renderGrid(rows: Row[], cols: ColumnDef<Row>[]) {
  return render(
    <DataGrid<Row>
      rows={rows}
      total={rows.length}
      columns={cols}
      filters={[]}
      page={1}
      limit={50}
      makeBlankRow={() => ({ id: "blank", name: "", price: null })}
      onPageChange={vi.fn()}
      onFilterChange={vi.fn()}
      onSave={noopSave}
    />,
  );
}

describe("DataGrid — numeric column", () => {
  it("renders numeric value formatted with ko-KR locale (commas)", () => {
    const rows: Row[] = [{ id: "1", name: "Widget", price: 1234567 }];
    const cols: ColumnDef<Row>[] = [
      { key: "name", label: "이름", type: "text", editable: true },
      { key: "price", label: "단가", type: "numeric", editable: true },
    ];
    renderGrid(rows, cols);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("renders numeric readonly column with formatted value (no edit affordance)", () => {
    const rows: Row[] = [{ id: "1", name: "Widget", price: 9999 }];
    const cols: ColumnDef<Row>[] = [
      { key: "name", label: "이름", type: "text", editable: true },
      // editable=false → readonly path
      { key: "price", label: "단가", type: "numeric", editable: false },
    ];
    renderGrid(rows, cols);
    expect(screen.getByText("9,999")).toBeInTheDocument();
    // Readonly path doesn't render an input on click
    fireEvent.click(screen.getByText("9,999"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("enters edit mode on click for editable numeric cell", () => {
    const rows: Row[] = [{ id: "1", name: "Widget", price: 100 }];
    const cols: ColumnDef<Row>[] = [
      { key: "price", label: "단가", type: "numeric", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("100"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("rejects non-numeric input — value remains unchanged after invalid commit", () => {
    const rows: Row[] = [{ id: "1", name: "Widget", price: 100 }];
    const cols: ColumnDef<Row>[] = [
      { key: "price", label: "단가", type: "numeric", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("100"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // After invalid commit the cell exits edit mode but keeps original 100.
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits a valid integer — display updates to formatted number", () => {
    const rows: Row[] = [{ id: "1", name: "Widget", price: 0 }];
    const cols: ColumnDef<Row>[] = [
      { key: "price", label: "단가", type: "numeric", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("0"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "5000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("5,000")).toBeInTheDocument();
  });
});
