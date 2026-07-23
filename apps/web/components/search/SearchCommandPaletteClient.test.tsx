import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchCommandPaletteClient } from "./SearchCommandPaletteClient";

const labels = {
  dialogLabel: "전체 검색",
  inputLabel: "전체 검색어",
  placeholder: "문서와 근거를 검색하세요",
  empty: "검색 결과가 없습니다.",
  loading: "검색 중…",
  results: "검색 결과",
  close: "검색 닫기",
  shortcut: "Ctrl K",
  keyboardHint: "↑↓ 이동 · Enter 열기 · Esc 닫기",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SearchCommandPaletteClient", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, rows: [] }))));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens with Ctrl+K and searches while the user types", async () => {
    await act(async () => root.render(<SearchCommandPaletteClient labels={labels} />));

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "k" })));

    const input = container.querySelector('input[aria-label="전체 검색어"]') as HTMLInputElement;
    expect(container.querySelector('[role="dialog"]')).toBeInTheDocument();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "식대");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    expect(fetch).toHaveBeenCalledWith("/api/search?q=%EC%8B%9D%EB%8C%80&limit=8", expect.any(Object));
  });
});
