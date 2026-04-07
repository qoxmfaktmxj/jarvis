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
      roles: ["employee"]
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

    expect(html).toContain("Dashboard");
    expect(html).toContain("Quick Links");
    expect(html).toContain("Recent Activity");
    expect(html).toContain("My Tasks");
    expect(html).toContain("Project Stats");
    expect(html).toContain("Stale Pages");
    expect(html).toContain("Search Trends");
    expect(html).toContain("Attendance This Month");
  });

  it("redirects to login when the session header is missing", async () => {
    headersMock.mockResolvedValue(new Headers());

    await expect(DashboardPage()).rejects.toThrowError("redirect:/login");
  });
});
