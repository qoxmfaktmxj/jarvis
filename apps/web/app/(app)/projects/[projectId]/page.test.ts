import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  notFoundMock,
  getSessionMock,
  hasPermissionMock,
  getProjectDetailMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("notFound");
  }),
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  getProjectDetailMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  getProjectDetail: getProjectDetailMock
}));

import ProjectOverviewPage from "./page";

describe("ProjectOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      roles: ["MANAGER"],
      permissions: ["project:read"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("renders the project summary", async () => {
    getProjectDetailMock.mockResolvedValue({
      id: "project-1",
      code: "P-001",
      name: "One",
      status: "active",
      description: "Project description",
      taskCount: 2,
      staffCount: 1,
      inquiryCount: 3
    });

    const html = renderToStaticMarkup(
      await ProjectOverviewPage({
        params: Promise.resolve({ projectId: "project-1" })
      })
    );

    expect(html).toContain("Project description");
    expect(html).toContain("P-001");
    expect(html).toContain("Tasks");
    expect(html).toContain("Inquiries");
  });

  it("throws notFound when the project does not exist", async () => {
    getProjectDetailMock.mockResolvedValue(null);

    await expect(
      ProjectOverviewPage({
        params: Promise.resolve({ projectId: "project-1" })
      })
    ).rejects.toThrowError("notFound");
  });
});
