import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("GET /api/weather", () => {
  it("returns ok with mock snapshot", async () => {
    const res = await GET(new Request("http://x/api/weather?region=seoul"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.data.region).toBe("seoul");
    expect(body.data.source).toBe("mock");
  });
});
