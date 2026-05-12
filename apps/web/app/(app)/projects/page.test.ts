import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  requirePageSessionMock,
  hasPermissionMock,
  listProjectsForGridMock,
  listCompanyOptionsMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  requirePageSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listProjectsForGridMock: vi.fn(),
  listCompanyOptionsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock("@/lib/server/page-auth", () => ({
  requirePageSession: requirePageSessionMock,
}));

vi.mock("@/lib/queries/projects", () => ({
  listProjectsForGrid: listProjectsForGridMock,
}));

vi.mock("@/lib/queries/infra-license", () => ({
  listCompanyOptions: listCompanyOptionsMock,
}));

// ProjectsGridContainer is a client component pulling many runtime deps.
// Stub it so the server component test can render the page shell.
vi.mock("./_components/ProjectsGridContainer", () => ({
  ProjectsGridContainer: ({ initialTotal }: { initialTotal: number }) =>
    `<div data-testid="grid">total=${initialTotal}</div>`,
}));

import ProjectsPage from "./page";

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePageSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      permissions: ["project:read", "project:create"],
    });
    hasPermissionMock.mockReturnValue(true);
    listProjectsForGridMock.mockResolvedValue({
      rows: [
        {
          id: "proj-1",
          companyId: "co-1",
          companyName: "Acme",
          name: "Payroll",
          status: "active",
          ownerId: null,
          ownerName: null,
          description: null,
          prodConnectType: null,
          prodDomainUrl: null,
          devConnectType: null,
          devDomainUrl: null,
          updatedAt: "2026-05-12T00:00:00.000Z",
          createdAt: "2026-05-12T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    listCompanyOptionsMock.mockResolvedValue([
      { value: "co-1", label: "001 · Acme" },
    ]);
  });

  it("renders grid container with total from listProjectsForGrid", async () => {
    const html = renderToStaticMarkup(
      await ProjectsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("total=1");
    expect(listProjectsForGridMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", page: 1, limit: 20 }),
    );
  });

  it("forwards searchParams filters to listProjectsForGrid", async () => {
    await ProjectsPage({
      searchParams: Promise.resolve({
        page: "3",
        status: "deprecated",
        connectType: "VPN",
        q: " payroll ",
      }),
    });

    expect(listProjectsForGridMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        page: 3,
        limit: 20,
        status: "deprecated",
        connectType: "VPN",
        q: "payroll",
      }),
    );
  });

  it("redirects to /dashboard when PROJECT_READ is missing", async () => {
    requirePageSessionMock.mockImplementationOnce((_perm, fallback: string) => {
      throw new Error(`redirect:${fallback}`);
    });

    await expect(
      ProjectsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrowError("redirect:/dashboard");
  });
});
