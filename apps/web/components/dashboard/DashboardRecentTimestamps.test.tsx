import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardRecentConversations } from "./DashboardRecentConversations";
import { DashboardRecentEvidence } from "./DashboardRecentEvidence";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

vi.mock("@/lib/server/wiki-page-loader", () => ({
  wikiPathToRoute: (path: string) => `/wiki/${path.replace(/\.md$/, "")}`,
}));

describe("dashboard recent timestamps", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders recent conversation timestamps in KST", async () => {
    await act(async () => root.render(
      <DashboardRecentConversations
        rows={[{ id: "conversation-1", title: "최근 대화", updatedAt: new Date("2026-07-22T06:01:02.999Z") }]}
        title="최근 대화"
        emptyLabel="없음"
      />,
    ));

    expect(container.textContent).toContain("2026-07-22 15:01:02");
  });

  it("renders recent evidence timestamps in KST", async () => {
    await act(async () => root.render(
      <DashboardRecentEvidence
        rows={[{
          id: "evidence-1",
          title: "최근 근거",
          slug: "recent-evidence",
          path: "manual/recent-evidence.md",
          zone: "manual",
          pageType: "guide",
          snippet: "",
          stale: false,
          updatedAt: new Date("2026-07-22T06:01:02.999Z"),
          typeLabel: "가이드",
        }]}
        title="최근 근거"
        emptyLabel="없음"
      />,
    ));

    expect(container.textContent).toContain("2026-07-22 15:01:02");
  });
});
