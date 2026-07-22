import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOwnedConversations: vi.fn(),
  listRecentWikiPages: vi.fn(),
  requirePagePermission: vi.fn(),
}));

vi.mock("@/components/dashboard/DashboardAskLauncher", () => ({
  DashboardAskLauncher: () => <section>무엇을 확인할까요?</section>,
}));
vi.mock("@/lib/server/conversation-repository", () => ({
  listOwnedConversations: mocks.listOwnedConversations,
}));
vi.mock("@/lib/server/wiki-page-loader", () => ({
  listRecentWikiPages: mocks.listRecentWikiPages,
  wikiPathToRoute: (path: string) => `/wiki/${path.replace(/\.md$/, "")}`,
}));
vi.mock("@/lib/server/page-auth", () => ({
  requirePagePermission: mocks.requirePagePermission,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => ({
    title: "HR 컴플라이언스 대시보드",
    description: "공식 근거를 기준일과 함께 탐색합니다.",
    recentConversationsTitle: "최근 질문",
    recentConversationsEmpty: "첫 질문을 시작해 보세요.",
    recentEvidenceTitle: "최근 근거",
    recentEvidenceEmpty: "게시된 근거가 없습니다.",
  })[key] ?? key,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.resetModules();
    mocks.listOwnedConversations.mockReset().mockResolvedValue([
      { id: "conversation-1", title: "식대 비과세", updatedAt: new Date("2026-07-22T00:00:00Z") },
    ]);
    mocks.listRecentWikiPages.mockReset().mockResolvedValue([
      {
        id: "wiki-1",
        title: "식대 비과세 한도",
        slug: "meal-allowance",
        path: "manual/notes/meal-allowance.md",
        zone: "manual",
        pageType: "guide",
        snippet: "식대 비과세 안내",
        stale: false,
        updatedAt: new Date("2026-07-22T00:00:00Z"),
      },
    ]);
    mocks.requirePagePermission.mockReset().mockResolvedValue({
      workspaceId: "workspace-1",
      userId: "user-1",
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the launcher with bounded recent conversation and evidence data", async () => {
    const { default: DashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("무엇을 확인할까요?");
    expect(html).toContain("최근 질문");
    expect(html).toContain("식대 비과세");
    expect(html).toContain("최근 근거");
    expect(html).toContain("식대 비과세 한도");
    expect(mocks.listOwnedConversations).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      limit: 5,
    });
    expect(mocks.listRecentWikiPages).toHaveBeenCalledWith({ workspaceId: "workspace-1", limit: 5 });
  });
});
