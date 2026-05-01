// apps/web/components/ui/DatePicker/__tests__/CalendarPopup.test.tsx
// @vitest-environment jsdom
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarPopup } from "../CalendarPopup";
import { __resetHolidayCache } from "../useWorkspaceHolidays";

afterEach(cleanup);

beforeEach(() => {
  __resetHolidayCache();
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ holidays: [{ date: "2026-05-05", name: "어린이날", note: null }] }),
      { status: 200 },
    ),
  );
});

describe("CalendarPopup", () => {
  it("renders weekday headers in Korean", () => {
    render(<CalendarPopup value="2026-05-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("월")).toBeInTheDocument();
    expect(screen.getByText("토")).toBeInTheDocument();
  });

  it("highlights weekend with red/blue color classes", () => {
    render(<CalendarPopup value="2026-05-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    const sun = screen.getByRole("gridcell", { name: /^2026-05-03/ });
    const sat = screen.getByRole("gridcell", { name: /^2026-05-02/ });
    expect(sun.className).toMatch(/text-rose-600/);
    expect(sat.className).toMatch(/text-blue-600/);
  });

  it("renders holiday with red color and dot", async () => {
    render(<CalendarPopup value="2026-05-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    const cell = await screen.findByRole("gridcell", { name: /^2026-05-05.*어린이날/ });
    expect(cell.className).toMatch(/text-rose-600/);
    expect(cell.querySelector("[data-holiday-dot]")).toBeTruthy();
  });

  it("calls onSelect with ISO when a cell is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CalendarPopup value="2026-05-12" onSelect={onSelect} onClose={vi.fn()} />);
    await user.click(screen.getByRole("gridcell", { name: /^2026-05-15/ }));
    expect(onSelect).toHaveBeenCalledWith("2026-05-15");
  });

  it("ArrowRight moves focus to next day, Enter selects", async () => {
    const onSelect = vi.fn();
    render(<CalendarPopup value="2026-05-12" onSelect={onSelect} onClose={vi.fn()} />);
    const grid = screen.getByRole("grid");
    grid.focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("2026-05-13");
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<CalendarPopup value="2026-05-12" onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("Saturday holiday gets text-rose-600, not text-blue-600", async () => {
    // 2026-05-02 is a Saturday; override the mock to make it a holiday
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ holidays: [{ date: "2026-05-02", name: "대체공휴일", note: null }] }),
        { status: 200 },
      ),
    );
    render(<CalendarPopup value="2026-05-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    const cell = await screen.findByRole("gridcell", { name: /^2026-05-02.*대체공휴일/ });
    expect(cell.className).toMatch(/text-rose-600/);
    expect(cell.className).not.toMatch(/text-blue-600/);
  });
});
