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
  ProjectTable: ({ data }: { data: { name: string }[] }) =>
    `<table>${data.map((r) => `<tr>${r.name}</tr>`).join("")}</table>`
}));

import ProjectsPage from "./page";

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      permissions: ["project:read", "project:create"]
    });
    hasPermissionMock.mockReturnValue(true);
    listProjectsMock.mockResolvedValue({
      data: [{ id: "proj-1", name: "Payroll" }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 }
    });
  });

  it("renders the projects registry", async () => {
    const html = renderToStaticMarkup(await ProjectsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Payroll");
  });

  it("redirects when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    await expect(ProjectsPage({ searchParams: Promise.resolve({}) })).rejects.toThrowError(
      "redirect:/dashboard"
    );
  });
});
