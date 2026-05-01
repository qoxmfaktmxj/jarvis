// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditableNumericCell } from "./EditableNumericCell";

afterEach(() => cleanup());

describe("EditableNumericCell", () => {
  it("displays formatted number with commas", () => {
    render(<EditableNumericCell value={1234567} onChange={vi.fn()} />);
    expect(screen.getByText("1,234,567")).toBeInTheDocument();
  });

  it("shows empty when value is null", () => {
    render(<EditableNumericCell value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/\d/)).toBeNull();
  });

  it("enters edit mode on click", () => {
    render(<EditableNumericCell value={100} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("100"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("commits raw integer on Enter", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={0} onChange={onChange} />);
    fireEvent.click(screen.getByText("0"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "5000" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it("commits null when input cleared", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={42} onChange={onChange} />);
    fireEvent.click(screen.getByText("42"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("rejects non-numeric input (no onChange call)", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={0} onChange={onChange} />);
    fireEvent.click(screen.getByText("0"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reverts on Escape (no onChange call)", () => {
    const onChange = vi.fn();
    render(<EditableNumericCell value={100} onChange={onChange} />);
    fireEvent.click(screen.getByText("100"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "999" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not enter edit mode when readOnly", () => {
    render(<EditableNumericCell value={100} onChange={vi.fn()} readOnly />);
    fireEvent.click(screen.getByText("100"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
