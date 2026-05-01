import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/server/api-auth", () => ({
  requireApiSession: vi.fn(async () => ({
    response: null,
    session: { workspaceId: "ws-1", userId: "u-1" },
  })),
}));

vi.mock("@/lib/queries/holidays", () => ({
  listHolidays: vi.fn(async () => [
    { id: "h1", date: "2026-05-05", name: "어린이날", note: null, workspaceId: "ws-1", createdAt: new Date(), updatedAt: new Date() },
  ]),
}));

describe("GET /api/holidays/range", () => {
  it("returns holidays within range", async () => {
    const req = new NextRequest("http://localhost/api/holidays/range?from=2026-05-01&to=2026-05-31");
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.holidays).toHaveLength(1);
    expect(json.holidays[0]).toMatchObject({ date: "2026-05-05", name: "어린이날", note: null });
  });

  it("rejects from > to", async () => {
    const req = new NextRequest("http://localhost/api/holidays/range?from=2026-05-31&to=2026-05-01");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("rejects range > 92 days", async () => {
    const req = new NextRequest("http://localhost/api/holidays/range?from=2026-01-01&to=2026-12-31");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
