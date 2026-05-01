// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeePicker } from "./EmployeePicker";

const searchEmployees = vi.fn();

vi.mock("@/lib/queries/employee-search", () => ({
  searchEmployees: (q: string) => searchEmployees(q),
}));

describe("EmployeePicker", () => {
  afterEach(() => {
    cleanup();
    searchEmployees.mockReset();
  });

  it("renders input with placeholder", () => {
    render(<EmployeePicker value="" onSelect={vi.fn()} placeholder="사번/이름/이메일" />);
    expect(screen.getByPlaceholderText("사번/이름/이메일")).toBeInTheDocument();
  });

  it("queries server on type after debounce", async () => {
    searchEmployees.mockResolvedValue([{ employeeId: "S001", name: "홍길동", email: "hong@example.com" }]);
    render(<EmployeePicker value="" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "홍길" } });
    await waitFor(() => expect(searchEmployees).toHaveBeenCalledWith("홍길"), { timeout: 1000 });
    expect(await screen.findByText("홍길동")).toBeInTheDocument();
  });

  it("calls onSelect with employee on suggestion click", async () => {
    searchEmployees.mockResolvedValue([{ employeeId: "S001", name: "홍길동", email: "hong@example.com" }]);
    const onSelect = vi.fn();
    render(<EmployeePicker value="" onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "홍길" } });
    fireEvent.click(await screen.findByText("홍길동", {}, { timeout: 1000 }));
    expect(onSelect).toHaveBeenCalledWith({ employeeId: "S001", name: "홍길동", email: "hong@example.com" });
  });

  it("does not query when value < 2 chars", async () => {
    render(<EmployeePicker value="" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ㄱ" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(searchEmployees).not.toHaveBeenCalled();
  });
});
