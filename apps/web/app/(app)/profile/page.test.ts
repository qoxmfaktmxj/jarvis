import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getQuickLinksMock,
  getSessionMock,
  headersMock,
  redirectMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getSessionMock: vi.fn(),
  getQuickLinksMock: vi.fn(),
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
  getQuickLinks: getQuickLinksMock
}));

import ProfilePage from "./page";

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profile information and quick menu editor", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      employeeId: "E-100",
      name: "Kim",
      email: "kim@example.com",
      roles: ["employee"]
    });
    getQuickLinksMock.mockResolvedValue([
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/dashboard",
        icon: null,
        sortOrder: 0
      }
    ]);

    const html = renderToStaticMarkup(await ProfilePage());

    expect(html).toContain("Profile");
    expect(html).toContain("User Information");
    expect(html).toContain("Quick Menu Order");
    expect(html).toContain("kim@example.com");
  });
});
