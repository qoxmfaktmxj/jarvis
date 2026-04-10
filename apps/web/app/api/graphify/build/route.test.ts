import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

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

vi.mock("pg-boss", () => {
  const sendMock = vi.fn(async () => "job-id");
  const startMock = vi.fn(async () => undefined);
  return {
    default: vi.fn(() => ({ send: sendMock, start: startMock })),
  };
});

import { POST } from "./route";
import { requireApiSession } from "@/lib/server/api-auth";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/graphify/build", {
    method: "POST",
    headers: {
      "x-session-id": "test-session",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/graphify/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for a caller with graph:read but no graph:build (VIEWER)", async () => {
    vi.mocked(requireApiSession).mockResolvedValue({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as ReturnType<typeof requireApiSession> extends Promise<infer T>
      ? T
      : never);

    const res = await POST(
      makeRequest({ rawSourceId: "00000000-0000-0000-0000-000000000001" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(requireApiSession).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as ReturnType<typeof requireApiSession> extends Promise<infer T>
      ? T
      : never);

    const res = await POST(
      makeRequest({ rawSourceId: "00000000-0000-0000-0000-000000000001" }),
    );
    expect(res.status).toBe(401);
  });
});
