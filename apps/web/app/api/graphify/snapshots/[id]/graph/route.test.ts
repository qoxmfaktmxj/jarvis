import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Mock requireApiSession before importing the route
vi.mock("@/lib/server/api-auth", () => ({
  requireApiSession: vi.fn(),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
}));

vi.mock("minio", () => ({
  Client: vi.fn(() => ({
    presignedGetObject: vi.fn(async () => "https://minio.local/presigned"),
  })),
}));

import { GET } from "./route";
import { requireApiSession } from "@/lib/server/api-auth";

function makeRequest() {
  return new NextRequest(
    "http://localhost/api/graphify/snapshots/abc/graph",
    { headers: { "x-session-id": "test-session" } },
  );
}

describe("GET /api/graphify/snapshots/[id]/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when caller lacks graph:read", async () => {
    vi.mocked(requireApiSession).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as ReturnType<typeof requireApiSession> extends Promise<infer T> ? T : never);

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(requireApiSession).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as ReturnType<typeof requireApiSession> extends Promise<infer T> ? T : never);

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(401);
  });
});
