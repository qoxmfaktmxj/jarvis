import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "00000000-0000-0000-0000-000000000001",
    workspaceId: "00000000-0000-0000-0000-000000000002",
    permissions: ["sales:all"],
    roles: [],
  }),
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: (k: string) => (k === "x-session-id" ? "test-session" : null) }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { listCloudPeopleBase, saveCloudPeopleBase } from "../actions";

describe("sales cloud people base permission guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(getSession).mockResolvedValue({
      userId: "00000000-0000-0000-0000-000000000001",
      workspaceId: "00000000-0000-0000-0000-000000000002",
      permissions: ["sales:all"],
      roles: [],
    } as never);
  });

  it("rejects list without SALES_ALL", async () => {
    vi.mocked(hasPermission).mockReturnValueOnce(false);
    const result = await listCloudPeopleBase({});
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden");
  });

  it("rejects save without a session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await saveCloudPeopleBase({});
    expect(result.ok).toBe(false);
    expect(result.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });
});

