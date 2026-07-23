import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WikiIndexShell } from "./WikiIndexShell";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      previous: "이전",
      next: "다음",
      pageStatus: "{page} / {totalPages} 페이지",
      panelLoading: "문서를 불러오는 중…",
      panelError: "문서를 불러오지 못했습니다.",
      panelClose: "패널 닫기",
      pageNav: "페이지 이동",
      pageNumber: "{page}페이지로 이동",
      panelLabel: "문서 미리보기",
    })[key] ?? key,
}));

const rows = [{
  id: "wiki-1",
  title: "근로계약",
  path: "manual/contract.md",
  href: "/wiki/manual/contract",
  snippet: "근로계약 관련 안내",
}];

function installMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe("WikiIndexShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    installMatchMedia(true);
    vi.stubGlobal("fetch", vi.fn());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderShell(): Promise<HTMLAnchorElement> {
    await act(async () => {
      root.render(<WikiIndexShell rows={rows} total={1} page={1} totalPages={1} />);
    });
    return container.querySelector('a[href="/wiki/manual/contract"]') as HTMLAnchorElement;
  }

  it("opens a split panel for an ordinary desktop click", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      page: { title: "근로계약", path: "manual/contract.md", body: "# 본문" },
    }))));
    const link = await renderShell();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith("/api/wiki/page?path=manual%2Fcontract.md");
    expect(container.querySelector("aside")).toHaveTextContent("근로계약");
    expect(container.querySelector("aside")).toHaveTextContent("본문");
  });

  it("shows title-only rows and direct page links", async () => {
    await renderShell();

    expect(container).not.toHaveTextContent("근로계약 관련 안내");
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent("1");
  });

  it("closes an open split panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      page: { title: "근로계약", path: "manual/contract.md", body: "본문" },
    }))));
    const link = await renderShell();
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    await act(async () => (container.querySelector('button[aria-label="패널 닫기"]') as HTMLButtonElement).click());

    expect(container.querySelector("aside")).toBeNull();
  });

  it("does not prevent modifier or middle clicks", async () => {
    const link = await renderShell();

    for (const event of [
      new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true, detail: 1 }),
      new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true, detail: 1 }),
      new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true, detail: 1 }),
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 1, detail: 1 }),
    ]) {
      let preventedByPanel = true;
      container.addEventListener("click", (clickEvent) => {
        preventedByPanel = clickEvent.defaultPrevented;
        clickEvent.preventDefault();
      }, { once: true });
      await act(async () => link.dispatchEvent(event));
      expect(preventedByPanel).toBe(false);
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("keeps keyboard activation as a full-page link on desktop", async () => {
    const link = await renderShell();
    let preventedByPanel = true;
    container.addEventListener("click", (event) => {
      preventedByPanel = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });

    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 })));

    expect(preventedByPanel).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("keeps mobile pointer clicks as full-page links", async () => {
    installMatchMedia(false);
    const link = await renderShell();
    let preventedByPanel = true;
    container.addEventListener("click", (event) => {
      preventedByPanel = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });

    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));

    expect(preventedByPanel).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("shows an alert when the panel request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const link = await renderShell();

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')).toHaveTextContent("문서를 불러오지 못했습니다.");
  });
});
