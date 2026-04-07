import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  cookiesMock,
  getSessionMock,
  headersMock,
  revalidatePathMock,
  updateMock
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  cookiesMock: vi.fn(),
  getSessionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  updateMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: cookiesMock
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    update: updateMock
  }
}));

vi.mock("@jarvis/db/schema", () => ({
  menuItem: {
    id: "menu.id",
    workspaceId: "menu.workspaceId",
    parentId: "menu.parentId",
    isVisible: "menu.isVisible",
    sortOrder: "menu.sortOrder",
    updatedAt: "menu.updatedAt"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
  isNull: vi.fn((value: unknown) => ({ value, op: "isNull" }))
}));

import { updateQuickMenuOrder } from "./profile";

function createUpdateChain() {
  const chain = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve())
  };

  return chain;
}

describe("updateQuickMenuOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when there is no session cookie or header", async () => {
    headersMock.mockResolvedValue(new Headers());
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined)
    });

    await expect(updateQuickMenuOrder(["a", "b"])).resolves.toEqual({
      success: false,
      error: "Unauthorized"
    });
  });

  it("updates menu sort order and revalidates related pages", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "session-1" }));
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined)
    });
    getSessionMock.mockResolvedValue({
      id: "session-1",
      workspaceId: "ws-1"
    });

    const chain = createUpdateChain();
    (updateMock as Mock).mockReturnValue(chain);

    await expect(updateQuickMenuOrder(["menu-2", "menu-1", "menu-1"])).resolves.toEqual({
      success: true
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(chain.set).toHaveBeenNthCalledWith(1, expect.objectContaining({ sortOrder: 0 }));
    expect(chain.set).toHaveBeenNthCalledWith(2, expect.objectContaining({ sortOrder: 1 }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
  });
});
