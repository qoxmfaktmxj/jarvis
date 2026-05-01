// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeGroupPopupLauncher } from "./CodeGroupPopupLauncher";

afterEach(() => cleanup());

const items = [
  { code: "C001", label: "ACME Corp" },
  { code: "C002", label: "Globex" },
];

describe("CodeGroupPopupLauncher", () => {
  it("renders trigger button with label", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "회사 선택" }),
    ).toBeInTheDocument();
  });

  it("opens popup and lists items on trigger click", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사 선택" }));
    expect(screen.getByText("ACME Corp")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("calls onSelect with item and closes popup", () => {
    const onSelect = vi.fn();
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사 선택"
        items={items}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사 선택" }));
    fireEvent.click(screen.getByText("Globex"));
    expect(onSelect).toHaveBeenCalledWith({ code: "C002", label: "Globex" });
    expect(screen.queryByText("ACME Corp")).toBeNull();
  });

  it("filters items when searchable=true", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사"
        items={items}
        onSelect={vi.fn()}
        searchable
        searchPlaceholder="검색"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), {
      target: { value: "Glo" },
    });
    expect(screen.queryByText("ACME Corp")).toBeNull();
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it("renders empty state when no items match filter", () => {
    render(
      <CodeGroupPopupLauncher
        triggerLabel="회사"
        items={items}
        onSelect={vi.fn()}
        searchable
        searchPlaceholder="검색"
        emptyLabel="결과 없음"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회사" }));
    fireEvent.change(screen.getByPlaceholderText("검색"), {
      target: { value: "ZZZ" },
    });
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
  });
});
