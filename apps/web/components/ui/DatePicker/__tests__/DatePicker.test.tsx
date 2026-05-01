// apps/web/components/ui/DatePicker/__tests__/DatePicker.test.tsx
// @vitest-environment jsdom
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "../DatePicker";
import { __resetHolidayCache } from "../useWorkspaceHolidays";

afterEach(cleanup);

beforeEach(() => {
  __resetHolidayCache();
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ holidays: [] }), { status: 200 }),
  );
});

describe("DatePicker", () => {
  it("opens popup when calendar icon is clicked", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-05-12" onChange={vi.fn()} />);
    expect(screen.queryByRole("grid")).toBeNull();
    await user.click(screen.getByLabelText("달력 열기"));
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("opens popup when ArrowDown pressed in input", async () => {
    const user = userEvent.setup();
    render(<DatePicker value="2026-05-12" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("commits selected date and closes popup", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value="2026-05-12" onChange={onChange} />);
    await user.click(screen.getByLabelText("달력 열기"));
    await user.click(screen.getByRole("gridcell", { name: /^2026-05-15/ }));
    expect(onChange).toHaveBeenCalledWith("2026-05-15");
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("commits typed date on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.keyboard("20260512");
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("2026-05-12");
  });

  it("closes popup on outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <DatePicker value="2026-05-12" onChange={vi.fn()} />
        <button>outside</button>
      </div>,
    );
    await user.click(screen.getByLabelText("달력 열기"));
    expect(screen.getByRole("grid")).toBeInTheDocument();
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("grid")).toBeNull();
  });
});
