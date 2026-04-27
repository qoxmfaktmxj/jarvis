import { describe, expect, it } from "vitest";
import { MockFxAdapter } from "./mock.js";

describe("MockFxAdapter", () => {
  it("returns USD/EUR/JPY snapshot with source=mock", async () => {
    const a = new MockFxAdapter();
    const snap = await a.getSnapshot();
    expect(snap.source).toBe("mock");
    const codes = snap.rates.map((r) => r.code);
    expect(codes).toEqual(["USD", "EUR", "JPY"]);
    const jpy = snap.rates.find((r) => r.code === "JPY")!;
    expect(jpy.basis).toBe("100");
    const usd = snap.rates.find((r) => r.code === "USD")!;
    expect(usd.basis).toBe("1");
    expect(usd.value).toBe(1342);
    expect(new Date(snap.fetchedAt).getTime()).not.toBeNaN();
  });
});
