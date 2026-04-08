import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/api-auth", () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: {
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["VIEWER"],
      permissions: ["knowledge:read"]
    }
  })
}));

import { POST } from "./route";

describe("/api/knowledge/preview", () => {
  it("returns escaped raw content instead of server-compiling untrusted MDX", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/knowledge/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          mdxContent: "# Hello\n<script>alert('xss')</script>"
        })
      })
    );

    const data = (await response.json()) as { html: string };

    expect(response.status).toBe(200);
    expect(data.html).toContain("&lt;script&gt;alert('xss')&lt;/script&gt;");
    expect(data.html).not.toContain("[object Object]");
  });
});
