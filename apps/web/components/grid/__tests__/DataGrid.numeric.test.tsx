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

  // Drizzle `numeric()` columns are returned as STRING by default. Settlement
  // grids (purchases/tax-bills/month-exp-sga/plan-div-costs) store strings in
  // row state to match the Zod string-string contract. The grid must:
  //   1. coerce `string` → number for display so toLocaleString produces commas
  //   2. coerce `number` → string on commit so saveAction Zod parse stays valid
  // Without (2) the row state ends up with mixed string/number fields and
  // savePurchases({ updates }) fails Zod parse silently.
  it("string-typed numeric row (Drizzle numeric()) round-trips as string", async () => {
    type StringRow = { id: string; amt: string | null };
    const captured: { id: string; key: keyof StringRow; value: unknown }[] = [];
    const rows: StringRow[] = [{ id: "1", amt: "1234567" }];
    const cols: ColumnDef<StringRow>[] = [
      { key: "amt", label: "금액", type: "numeric", editable: true },
    ];
    let savedChanges: unknown = null;
    render(
      <DataGrid<StringRow>
        rows={rows}
        total={rows.length}
        columns={cols}
        filters={[]}
        page={1}
        limit={50}
        makeBlankRow={() => ({ id: "blank", amt: null })}
        onPageChange={vi.fn()}
        onFilterChange={vi.fn()}
        onGridRowsChange={(gr) => {
          captured.length = 0;
          for (const r of gr) captured.push({ id: r.data.id, key: "amt", value: r.data.amt });
        }}
        onSave={async (changes) => {
          savedChanges = changes;
          return { ok: true };
        }}
      />,
    );
    // Display formatted with commas (string → Number → toLocaleString)
    expect(screen.getByText("1,234,567")).toBeInTheDocument();

    // Edit and commit — row state must remain string for Zod compatibility.
    fireEvent.click(screen.getByText("1,234,567"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9000" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // After commit, the captured row state should store a STRING, not a Number.
    const last = captured.find((c) => c.id === "1");
    expect(last).toBeDefined();
    expect(typeof last!.value).toBe("string");
    expect(last!.value).toBe("9000");

    // Save propagates the string through batch (no number leakage)
    fireEvent.click(screen.getByRole("button", { name: /저장/ }));
    await new Promise((r) => setTimeout(r, 0));
    const updates = (savedChanges as { updates?: { patch: { amt?: unknown } }[] })?.updates ?? [];
    const first = updates[0];
    if (first) {
      expect(typeof first.patch.amt).toBe("string");
    }
  });

  it("clearing a numeric cell commits null (not empty string)", () => {
    type StringRow = { id: string; amt: string | null };
    const captured: unknown[] = [];
    const rows: StringRow[] = [{ id: "1", amt: "5000" }];
    const cols: ColumnDef<StringRow>[] = [
      { key: "amt", label: "금액", type: "numeric", editable: true },
    ];
    render(
      <DataGrid<StringRow>
        rows={rows}
        total={rows.length}
        columns={cols}
        filters={[]}
        page={1}
        limit={50}
        makeBlankRow={() => ({ id: "blank", amt: null })}
        onPageChange={vi.fn()}
        onFilterChange={vi.fn()}
        onGridRowsChange={(gr) => {
          captured.length = 0;
          for (const r of gr) captured.push(r.data.amt);
        }}
        onSave={noopSave}
      />,
    );
    fireEvent.click(screen.getByText("5,000"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(captured[0]).toBeNull();
  });
});
