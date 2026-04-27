import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("GET /api/fx", () => {
  it("returns USD/EUR/JPY", async () => {
    const res = await GET(new Request("http://x/api/fx"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.data.rates.map((r: { code: string }) => r.code)).toEqual(["USD","EUR","JPY"]);
  });
});
