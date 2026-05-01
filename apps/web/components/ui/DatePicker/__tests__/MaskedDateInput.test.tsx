// @vitest-environment jsdom
// apps/web/components/ui/DatePicker/__tests__/MaskedDateInput.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaskedDateInput } from "../MaskedDateInput";

afterEach(() => cleanup());

describe("MaskedDateInput", () => {
  it("auto-inserts dash after 4-digit year", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("2026");
    expect(input.value).toBe("2026-");
  });

  it("auto-inserts dash after 2-digit month", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("202605");
    expect(input.value).toBe("2026-05-");
  });

  it("rejects month > 12", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("202613");
    // first '1' accepted (could be 10/11/12), second '3' rejected
    expect(input.value).toBe("2026-1");
  });

  it("rejects day > 31", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("2026053");
    // accepted (could be 30/31)
    await user.keyboard("2");
    // rejected (32)
    expect(input.value).toBe("2026-05-3");
  });

  it("commits null on partial input at blur", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("2026-05");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("commits ISO string on full input at blur", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("20260512");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("2026-05-12");
  });

  it("restores prior value on Escape", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value="2026-05-12" onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.keyboard("{Backspace}{Backspace}");
    await user.keyboard("{Escape}");
    expect(input.value).toBe("2026-05-12");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("recognizes pasted yyyy-mm-dd", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.paste("2026-05-12");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("2026-05-12");
  });

  it("recognizes pasted 8-digit yyyymmdd", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.paste("20260512");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("2026-05-12");
  });

  it("paste of invalid month produces clean partial", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<MaskedDateInput value={null} onCommit={onCommit} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await user.click(input);
    await user.paste("20260001");
    expect(input.value).toBe("2026-0");
  });
});
