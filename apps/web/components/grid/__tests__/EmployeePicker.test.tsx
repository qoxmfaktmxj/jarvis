// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

afterEach(() => cleanup());
import { EmployeePicker } from "../EmployeePicker";

const mockSearch = vi.fn(async (q: string) => {
  if (q === "ho") return [{ sabun: "S001", name: "홍길동", email: "hong@x.com" }];
  return [];
});

describe("EmployeePicker", () => {
  beforeEach(() => mockSearch.mockClear());

  it("does not query for <2 chars", async () => {
    render(<EmployeePicker value="" onSelect={() => {}} search={mockSearch} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "h" } });
    await new Promise((r) => setTimeout(r, 300));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("debounces and calls search after 250ms with >=2 chars", async () => {
    render(<EmployeePicker value="" onSelect={() => {}} search={mockSearch} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ho" } });
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("ho", 10), { timeout: 500 });
  });

  it("shows results in a listbox after query resolves", async () => {
    render(<EmployeePicker value="" onSelect={() => {}} search={mockSearch} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ho" } });
    expect(await screen.findByText("홍길동")).toBeInTheDocument();
    expect(screen.getByText("S001")).toBeInTheDocument();
  });

  it("calls onSelect with full record on Enter", async () => {
    const onSelect = vi.fn();
    render(<EmployeePicker value="" onSelect={onSelect} search={mockSearch} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ho" } });
    await screen.findByText("홍길동");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ sabun: "S001", name: "홍길동", email: "hong@x.com" });
  });

  it("closes the listbox on Escape without selecting", async () => {
    const onSelect = vi.fn();
    render(<EmployeePicker value="" onSelect={onSelect} search={mockSearch} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ho" } });
    await screen.findByText("홍길동");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByText("홍길동")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
