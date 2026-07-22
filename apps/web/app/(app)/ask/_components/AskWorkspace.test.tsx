import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerCard } from "@/components/ai/AnswerCard";
import { AskWorkspace } from "./AskWorkspace";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    panelLabel: "Wiki panel",
    panelLoading: "문서를 불러오는 중…",
    panelError: "문서를 불러오지 못했습니다.",
    panelClose: "패널 닫기",
  })[key] ?? key,
}));

const source = {
  kind: "wiki" as const,
  label: "vacation-policy",
  title: "휴가 정책",
  wikiPath: "manual/vacation-policy.md",
  canonicalUrl: "https://law.go.kr/official",
};

function installMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe("AskWorkspace", () => {
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

  async function renderWorkspace() {
    await act(async () => {
      root.render(
        <AskWorkspace sidebar={<aside>대화</aside>}>
          <AnswerCard text="확인은 [[vacation-policy]]에서 가능합니다." sources={[source]} />
        </AskWorkspace>,
      );
    });
  }

  it("opens an inline Wiki citation in the desktop split panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      page: { title: "휴가 정책", path: "manual/vacation-policy.md", body: "# 연차" },
    }))));
    await renderWorkspace();
    const link = container.querySelector('a[href="/wiki/manual/vacation-policy"]') as HTMLAnchorElement;

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith("/api/wiki/page?path=manual%2Fvacation-policy.md");
    expect(container.querySelector("aside[aria-label='Wiki panel']")).toHaveTextContent("휴가 정책");
    expect(container.querySelector("aside[aria-label='Wiki panel']")).toHaveTextContent("연차");
  });

  it("opens a Wiki source card even when it also has a canonical URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      page: { title: "휴가 정책", path: "manual/vacation-policy.md", body: "본문" },
    }))));
    await renderWorkspace();
    const links = container.querySelectorAll('a[href="/wiki/manual/vacation-policy"]');
    const sourceLink = links.item(1) as HTMLAnchorElement;

    await act(async () => {
      sourceLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith("/api/wiki/page?path=manual%2Fvacation-policy.md");
  });

  it("closes the split panel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      page: { title: "휴가 정책", path: "manual/vacation-policy.md", body: "본문" },
    }))));
    await renderWorkspace();
    const link = container.querySelector('a[href="/wiki/manual/vacation-policy"]') as HTMLAnchorElement;
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    await act(async () => (container.querySelector('button[aria-label="패널 닫기"]') as HTMLButtonElement).click());

    expect(container.querySelector("aside[aria-label='Wiki panel']")).toBeNull();
  });

  it("keeps modifier clicks as full-page links", async () => {
    await renderWorkspace();
    const link = container.querySelector('a[href="/wiki/manual/vacation-policy"]') as HTMLAnchorElement;
    let preventedByPanel = true;
    container.addEventListener("click", (event) => {
      preventedByPanel = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });

    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true, detail: 1 })));

    expect(preventedByPanel).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps mobile clicks as full-page links", async () => {
    installMatchMedia(false);
    await renderWorkspace();
    const link = container.querySelector('a[href="/wiki/manual/vacation-policy"]') as HTMLAnchorElement;
    let preventedByPanel = true;
    container.addEventListener("click", (event) => {
      preventedByPanel = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });

    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 })));

    expect(preventedByPanel).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a panel error when the page fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    await renderWorkspace();
    const link = container.querySelector('a[href="/wiki/manual/vacation-policy"]') as HTMLAnchorElement;

    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')).toHaveTextContent("문서를 불러오지 못했습니다.");
  });
});
