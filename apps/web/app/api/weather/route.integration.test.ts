import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/api/weather caching", () => {
  it("second call within TTL returns identical fetchedAt", async () => {
    const res1 = await GET(new Request("http://x/api/weather?region=seoul"));
    const body1 = await res1.json();
    const res2 = await GET(new Request("http://x/api/weather?region=seoul"));
    const body2 = await res2.json();
    expect(body1.data.fetchedAt).toBe(body2.data.fetchedAt);
  });
});
