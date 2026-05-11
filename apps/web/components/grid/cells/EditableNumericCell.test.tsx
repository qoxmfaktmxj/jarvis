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

  // P0-1 (A5 audit 2026-05-11): decimal mode for Drizzle `numeric()` SoT.
  describe("decimal mode", () => {
    it("displays formatted decimal preserving trailing zeros", () => {
      render(
        <EditableNumericCell mode="decimal" value="1234567.890" onChange={vi.fn()} />,
      );
      expect(screen.getByText("1,234,567.890")).toBeInTheDocument();
    });

    it("accepts decimal input on Enter (commits raw string)", () => {
      const onChange = vi.fn();
      render(<EditableNumericCell mode="decimal" value="0" onChange={onChange} />);
      fireEvent.click(screen.getByText("0"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "1500.50" } });
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("1500.50");
    });

    it("preserves large-magnitude precision (no Number() float drift)", () => {
      const onChange = vi.fn();
      render(<EditableNumericCell mode="decimal" value="0" onChange={onChange} />);
      fireEvent.click(screen.getByText("0"));
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "12345678901234567.89" },
      });
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("12345678901234567.89");
    });

    it("rejects non-decimal input (no onChange)", () => {
      const onChange = vi.fn();
      render(<EditableNumericCell mode="decimal" value="5" onChange={onChange} />);
      fireEvent.click(screen.getByText("5"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "1.2.3" } });
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("accepts negative decimal", () => {
      const onChange = vi.fn();
      render(<EditableNumericCell mode="decimal" value="0" onChange={onChange} />);
      fireEvent.click(screen.getByText("0"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "-99.5" } });
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith("-99.5");
    });

    it("commits null when input cleared (decimal)", () => {
      const onChange = vi.fn();
      render(<EditableNumericCell mode="decimal" value="42.5" onChange={onChange} />);
      fireEvent.click(screen.getByText("42.5"));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });
});
