import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  notFoundMock,
  getSessionMock,
  hasPermissionMock,
  getProjectMock
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
  getProjectMock: vi.fn()
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
  getProject: getProjectMock
}));

import ProjectOverviewPage from "./page";

describe("ProjectOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      permissions: ["project:read", "project:update"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("renders the project overview", async () => {
    getProjectMock.mockResolvedValue({
      id: "proj-1",
      name: "Payroll",
      status: "active",
      sensitivity: "INTERNAL",
      description: "Handles payroll",
      prodDomainUrl: "https://payroll.example.com",
      devDomainUrl: null,
      createdAt: new Date("2026-04-07T09:00:00.000Z")
    });

    const html = renderToStaticMarkup(
      await ProjectOverviewPage({ params: Promise.resolve({ projectId: "proj-1" }) })
    );

    expect(html).toContain("Handles payroll");
    expect(html).toContain("https://payroll.example.com");
  });

  it("throws notFound when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    await expect(
      ProjectOverviewPage({ params: Promise.resolve({ projectId: "proj-1" }) })
    ).rejects.toThrowError("notFound");
  });
});
