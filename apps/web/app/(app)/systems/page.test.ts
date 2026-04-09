import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  getSessionMock,
  hasPermissionMock,
  listSystemsMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listSystemsMock: vi.fn()
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

vi.mock("@/lib/queries/systems", () => ({
  listSystems: listSystemsMock
}));

vi.mock("@/components/system/SystemCard", () => ({
  SystemCard: ({ system }: { system: { name: string } }) => `<article>${system.name}</article>`
}));

import SystemsPage from "./page";

describe("SystemsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      permissions: ["system:read", "system:create"]
    });
    hasPermissionMock.mockReturnValue(true);
    listSystemsMock.mockResolvedValue({
      data: [{ id: "sys-1", name: "Payroll" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
    });
  });

  it("renders the systems registry", async () => {
    const html = renderToStaticMarkup(await SystemsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("시스템");
    expect(html).toContain("Payroll");
    expect(html).toContain("시스템 등록");
  });

  it("redirects when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    await expect(SystemsPage({ searchParams: Promise.resolve({}) })).rejects.toThrowError(
      "redirect:/dashboard"
    );
  });
});
