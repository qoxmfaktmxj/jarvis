import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  getSessionMock,
  hasPermissionMock,
  listProjectsMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listProjectsMock: vi.fn()
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

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  listProjects: listProjectsMock
}));

vi.mock("@/components/project/ProjectTable", () => ({
  ProjectTable: ({ total }: { total: number }) => `<div>table:${total}</div>`
}));

import ProjectsPage from "./page";

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      name: "Kim",
      roles: ["MANAGER"],
      permissions: ["project:read", "project:create"]
    });
    hasPermissionMock.mockReturnValue(true);
    listProjectsMock.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 4, totalPages: 1 }
    });
  });

  it("renders the projects heading and total count", async () => {
    const html = renderToStaticMarkup(
      await ProjectsPage({ searchParams: Promise.resolve({}) })
    );

    expect(html).toContain("프로젝트");
    expect(html).toContain("워크스페이스 프로젝트를 관리합니다");
    expect(html).toContain("새 프로젝트");
  });

  it("redirects to dashboard when the session lacks permission", async () => {
    hasPermissionMock.mockReturnValue(false);

    await expect(
      ProjectsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrowError("redirect:/dashboard");
  });
});
