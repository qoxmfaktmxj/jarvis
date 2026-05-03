import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures spies are available in vi.mock factory (hoisting boundary).
const { whereSpy, limitMock } = vi.hoisted(() => ({
  whereSpy: vi.fn().mockReturnThis(),
  limitMock: vi.fn(),
}));

// Mock db — shape matches company table columns selected in searchCompanies
vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: whereSpy,
    limit: limitMock,
  },
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({
    userId: "u1",
    workspaceId: "w1",
    permissions: ["sales:all"],
    roles: [],
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({ get: () => "test-session" }),
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

import { searchCompanies } from "../companies.js";

describe("searchCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return one result; per-test can override with mockResolvedValueOnce.
    limitMock.mockResolvedValue([
      { id: "c1", code: "COMP001", name: "테스트 회사" },
    ]);
  });

  it("throws Unauthorized when no session", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce(null);
    await expect(searchCompanies({ q: "테스트", limit: 10 })).rejects.toThrow(/Unauthorized/);
  });

  it("throws Forbidden when session lacks all required permissions", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-no-perm",
      workspaceId: "w1",
      permissions: [],
      roles: [],
    } as never);
    await expect(searchCompanies({ q: "테스트", limit: 10 })).rejects.toThrow(/Forbidden/);
  });

  it("returns hits for name partial match (ilike %q%)", async () => {
    limitMock.mockResolvedValueOnce([
      { id: "c2", code: "ALPHA01", name: "알파 시스템즈" },
    ]);
    const hits = await searchCompanies({ q: "알파", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "c2", code: "ALPHA01", name: "알파 시스템즈" });
    // WHERE called once proves predicates are applied
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("returns hits for code prefix match (ilike q%)", async () => {
    limitMock.mockResolvedValueOnce([
      { id: "c3", code: "BETA99", name: "베타 코퍼레이션" },
    ]);
    const hits = await searchCompanies({ q: "BE", limit: 10 });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "c3", code: "BETA99", name: "베타 코퍼레이션" });
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("workspace isolation — WHERE called once with composed and(...) arg", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-ws2",
      workspaceId: "ws-other",
      permissions: ["sales:all"],
      roles: [],
    } as never);
    limitMock.mockResolvedValueOnce([]);

    const hits = await searchCompanies({ q: "찾기", limit: 5 });

    // WHERE must be called exactly once with a single composed SQL node
    // (workspace eq + or ilike) — proves cross-workspace rows cannot slip through.
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy.mock.calls[0]).toHaveLength(1);
    expect(hits).toHaveLength(0);
  });

  it("rejects empty query (Zod min(2))", async () => {
    await expect(searchCompanies({ q: "", limit: 10 })).rejects.toThrow();
  });

  it("rejects q with length < 2", async () => {
    await expect(searchCompanies({ q: "a", limit: 10 })).rejects.toThrow();
  });

  it("rejects whitespace-only query (trims to empty, fails min(2))", async () => {
    await expect(searchCompanies({ q: "   ", limit: 10 })).rejects.toThrow();
  });

  it("allows access with ADDITIONAL_DEV_READ permission", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-dev-read",
      workspaceId: "w1",
      permissions: ["additional-dev:read"],
      roles: [],
    } as never);
    limitMock.mockResolvedValueOnce([{ id: "c4", code: "DEV001", name: "개발사" }]);
    const hits = await searchCompanies({ q: "개발", limit: 10 });
    expect(hits).toHaveLength(1);
  });

  it("allows access with ADDITIONAL_DEV_UPDATE permission", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-dev-upd",
      workspaceId: "w1",
      permissions: ["additional-dev:update"],
      roles: [],
    } as never);
    limitMock.mockResolvedValueOnce([{ id: "c5", code: "UPD001", name: "수정회사" }]);
    const hits = await searchCompanies({ q: "수정", limit: 10 });
    expect(hits).toHaveLength(1);
  });

  it("allows access with ADDITIONAL_DEV_CREATE permission", async () => {
    const sess = await import("@jarvis/auth/session");
    vi.mocked(sess.getSession).mockResolvedValueOnce({
      userId: "u-dev-cre",
      workspaceId: "w1",
      permissions: ["additional-dev:create"],
      roles: [],
    } as never);
    limitMock.mockResolvedValueOnce([{ id: "c6", code: "CRE001", name: "생성회사" }]);
    const hits = await searchCompanies({ q: "생성", limit: 10 });
    expect(hits).toHaveLength(1);
  });
});
