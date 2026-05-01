// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DataGrid } from "../DataGrid";
import type { ColumnDef, GridSaveResult } from "../types";

afterEach(() => cleanup());

type Row = { id: string; name: string; memo: string | null };

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
      makeBlankRow={() => ({ id: "blank", name: "", memo: null })}
      onPageChange={vi.fn()}
      onFilterChange={vi.fn()}
      onSave={noopSave}
    />,
  );
}

describe("DataGrid — textarea column", () => {
  it("renders multi-line textarea value preserving newlines (display mode)", () => {
    const rows: Row[] = [
      { id: "1", name: "Item", memo: "line1\nline2\nline3" },
    ];
    const cols: ColumnDef<Row>[] = [
      { key: "name", label: "이름", type: "text", editable: true },
      { key: "memo", label: "비고", type: "textarea", editable: true },
    ];
    renderGrid(rows, cols);
    // The display preview <span> renders the raw text (with newlines);
    // whitespace-pre-wrap class controls visual rendering.
    // Note: getByText collapses whitespace by default — disable normalizer to match newlines.
    const preview = screen.getByText("line1\nline2\nline3", { normalizer: (s) => s });
    expect(preview).toBeInTheDocument();
    expect(preview.className).toContain("whitespace-pre-wrap");
    expect(preview.className).toContain("line-clamp-3");
  });

  it("renders textarea readonly column without edit affordance (editable=false)", () => {
    const rows: Row[] = [{ id: "1", name: "Item", memo: "static memo" }];
    const cols: ColumnDef<Row>[] = [
      { key: "name", label: "이름", type: "text", editable: true },
      { key: "memo", label: "비고", type: "textarea", editable: false },
    ];
    renderGrid(rows, cols);
    expect(screen.getByText("static memo")).toBeInTheDocument();
    // Readonly path renders raw cell, no textarea/button toggle.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("enters edit mode on click — textarea becomes visible", () => {
    const rows: Row[] = [{ id: "1", name: "Item", memo: "hello" }];
    const cols: ColumnDef<Row>[] = [
      { key: "memo", label: "비고", type: "textarea", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("hello"));
    // textarea has implicit role="textbox" in jsdom
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("Ctrl+Enter commits the draft — display updates to new value", () => {
    const rows: Row[] = [{ id: "1", name: "Item", memo: "old" }];
    const cols: ColumnDef<Row>[] = [
      { key: "memo", label: "비고", type: "textarea", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("old"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "new\nmulti\nline" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    // After commit, edit mode exits and the new value is displayed.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText("new\nmulti\nline", { normalizer: (s) => s }),
    ).toBeInTheDocument();
  });

  it("Escape reverts the draft — original value is preserved", () => {
    const rows: Row[] = [{ id: "1", name: "Item", memo: "keep" }];
    const cols: ColumnDef<Row>[] = [
      { key: "memo", label: "비고", type: "textarea", editable: true },
    ];
    renderGrid(rows, cols);
    fireEvent.click(screen.getByText("keep"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "scratch" } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    // Escape exits edit mode without committing — original value remains.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("keep")).toBeInTheDocument();
    expect(screen.queryByText("scratch")).toBeNull();
  });
});
