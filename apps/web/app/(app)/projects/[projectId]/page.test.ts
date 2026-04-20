import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  notFoundMock,
  getSessionMock,
  hasPermissionMock,
  getSystemMock
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
  getSystemMock: vi.fn()
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

vi.mock("@/lib/queries/systems", () => ({
  getSystem: getSystemMock
}));

import SystemOverviewPage from "./page";

describe("SystemOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      permissions: ["system:read", "system:update"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("renders the system overview", async () => {
    getSystemMock.mockResolvedValue({
      id: "sys-1",
      name: "Payroll",
      status: "active",
      sensitivity: "INTERNAL",
      description: "Handles payroll",
      techStack: "Next.js, PostgreSQL",
      repositoryUrl: "https://github.com/acme/payroll",
      dashboardUrl: "https://grafana.example.com/payroll",
      createdAt: new Date("2026-04-07T09:00:00.000Z")
    });

    const html = renderToStaticMarkup(
      await SystemOverviewPage({ params: Promise.resolve({ systemId: "sys-1" }) })
    );

    expect(html).toContain("Handles payroll");
    expect(html).toContain("Next.js, PostgreSQL");
    expect(html).toContain("https://github.com/acme/payroll");
  });

  it("throws notFound when the system is missing", async () => {
    getSystemMock.mockResolvedValue(null);

    await expect(
      SystemOverviewPage({ params: Promise.resolve({ systemId: "sys-1" }) })
    ).rejects.toThrowError("notFound");
  });
});
