// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditableTextAreaCell } from "./EditableTextAreaCell";

afterEach(() => cleanup());

describe("EditableTextAreaCell", () => {
  it("displays multi-line value with newlines preserved (whitespace-pre-wrap)", () => {
    const { container } = render(
      <EditableTextAreaCell value={"line1\nline2\nline3"} onCommit={vi.fn()} />,
    );
    const span = container.querySelector("span.whitespace-pre-wrap");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("line1\nline2\nline3");
    expect(span?.className).toContain("line-clamp-3");
  });

  it("enters edit mode on click and shows textarea", () => {
    render(<EditableTextAreaCell value="hello" onCommit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox");
    expect(ta.tagName).toBe("TEXTAREA");
  });

  it("Enter inserts newline (does NOT commit)", () => {
    const onCommit = vi.fn();
    render(<EditableTextAreaCell value="" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "a" } });
    // plain Enter — should NOT trigger commit (default behavior allows newline)
    fireEvent.keyDown(ta, { key: "Enter" });
    fireEvent.change(ta, { target: { value: "a\nb" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(ta.value).toBe("a\nb");
  });

  it("Ctrl+Enter commits the draft", () => {
    const onCommit = vi.fn();
    render(<EditableTextAreaCell value="" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "first\nsecond" } });
    fireEvent.keyDown(ta, { key: "Enter", ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith("first\nsecond");
  });

  it("blur commits draft when changed", () => {
    const onCommit = vi.fn();
    render(<EditableTextAreaCell value="old" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "new value" } });
    fireEvent.blur(ta);
    expect(onCommit).toHaveBeenCalledWith("new value");
  });

  it("blur does NOT commit when draft equals value (no-op short-circuit)", () => {
    const onCommit = vi.fn();
    render(<EditableTextAreaCell value="same" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox");
    // Don't change anything — draft already equals value
    fireEvent.blur(ta);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Escape reverts and exits edit mode", () => {
    const onCommit = vi.fn();
    render(<EditableTextAreaCell value="original" onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button"));
    const ta = screen.getByRole("textbox");
    fireEvent.change(ta, { target: { value: "edited" } });
    fireEvent.keyDown(ta, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    // back to display mode — button visible with original value
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("original")).toBeInTheDocument();
  });

  it("shows placeholder when value is null in display mode", () => {
    render(
      <EditableTextAreaCell value={null} placeholder="비고 입력" onCommit={vi.fn()} />,
    );
    expect(screen.getByText("비고 입력")).toBeInTheDocument();
  });
});
