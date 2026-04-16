import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDashboardDataMock,
  getSessionMock,
  headersMock,
  redirectMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getSessionMock: vi.fn(),
  getDashboardDataMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  })
}));

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@/lib/queries/dashboard", () => ({
  getDashboardData: getDashboardDataMock
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all widget headings for an authenticated session", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      name: "Kim",
      roles: ["employee"],
      permissions: ["knowledge:read"]
    });
    getDashboardDataMock.mockResolvedValue({
      quickLinks: [],
      recentActivity: [],
      myTasks: [],
      projectStats: { total: 0, byStatus: {} },
      stalePages: [],
      searchTrends: [],
      attendanceSummary: {
        totalDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0
      }
    });

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("대시보드");
    expect(html).toContain("빠른 링크");
    expect(html).toContain("최근 활동");
    expect(html).toContain("내 작업");
    expect(html).toContain("프로젝트 현황");
    expect(html).toContain("만료된 페이지");
    expect(html).toContain("검색 트렌드");
    expect(html).toContain("이번 달 출퇴근");
    expect(getDashboardDataMock).toHaveBeenCalledWith(
      "ws-1",
      "user-1",
      ["employee"],
      ["knowledge:read"]
    );
  });

  it("redirects to login when the session header is missing", async () => {
    headersMock.mockResolvedValue(new Headers());

    await expect(DashboardPage()).rejects.toThrowError("redirect:/login");
  });
});
