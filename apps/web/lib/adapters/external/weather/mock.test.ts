import { describe, expect, it } from "vitest";
import { MockWeatherAdapter } from "./mock.js";

describe("MockWeatherAdapter", () => {
  it("returns seoul snapshot with source=mock and valid shape", async () => {
    const a = new MockWeatherAdapter();
    const snap = await a.getSnapshot("seoul");
    expect(snap.source).toBe("mock");
    expect(snap.region).toBe("seoul");
    expect(snap.regionLabel).toBe("서울");
    expect(snap.condition).toBe("맑음");
    expect(snap.tempC).toBe(18);
    expect(snap.hiC).toBe(22);
    expect(snap.loC).toBe(12);
    expect(snap.particulate).toBe("좋음");
    expect(new Date(snap.fetchedAt).getTime()).not.toBeNaN();
  });
  it("defaults unknown region to seoul", async () => {
    const a = new MockWeatherAdapter();
    const snap = await a.getSnapshot("atlantis");
    expect(snap.region).toBe("seoul");
    expect(snap.regionLabel).toBe("서울");
  });
});
