import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  headersMock,
  redirectMock,
  getSessionMock,
  hasPermissionMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn()
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

vi.mock("@/components/project/ProjectForm", () => ({
  ProjectForm: ({ mode }: { mode: string }) => `<form>${mode}</form>`
}));

import NewProjectPage from "./page";

describe("NewProjectPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1",
      roles: ["MANAGER"],
      permissions: ["project:create"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("renders the create project form", async () => {
    const html = renderToStaticMarkup(await NewProjectPage());

    expect(html).toContain("Create Project");
    expect(html).toContain("&lt;form&gt;create&lt;/form&gt;");
  });

  it("redirects to projects when create permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    await expect(NewProjectPage()).rejects.toThrowError("redirect:/projects");
  });
});
