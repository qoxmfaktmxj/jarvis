// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataGridToolbar } from "./DataGridToolbar";

describe("DataGridToolbar", () => {
  it("renders children inside toolbar", () => {
    render(
      <DataGridToolbar>
        <button>Insert</button>
      </DataGridToolbar>,
    );
    expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
  });

  it("renders export button when onExport provided and calls handler", () => {
    const onExport = vi.fn();
    render(<DataGridToolbar onExport={onExport} exportLabel="엑셀 다운로드" />);
    fireEvent.click(screen.getByRole("button", { name: "엑셀 다운로드" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("does not render export button when onExport omitted", () => {
    render(<DataGridToolbar exportLabel="엑셀" />);
    expect(screen.queryByRole("button", { name: "엑셀" })).toBeNull();
  });

  it("disables export button when isExporting=true", () => {
    render(
      <DataGridToolbar
        onExport={vi.fn()}
        exportLabel="엑셀"
        isExporting
      />,
    );
    expect(screen.getByRole("button", { name: "엑셀" })).toBeDisabled();
  });

  it("uses default exportLabel='Export' when not provided", () => {
    render(<DataGridToolbar onExport={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });
});
