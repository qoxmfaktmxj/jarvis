import type { FxAdapter, FxSnapshot } from "./types.js";

const MOCK_RATES = [
  { code: "USD", value: 1342, delta: 0.3, basis: "1" },
  { code: "EUR", value: 1458, delta: -0.1, basis: "1" },
  { code: "JPY", value: 892, delta: 0.5, basis: "100" }
] as const;

export class MockFxAdapter implements FxAdapter {
  async getSnapshot(): Promise<FxSnapshot> {
    return {
      rates: MOCK_RATES.map((r) => ({ ...r })),
      source: "mock",
      fetchedAt: new Date().toISOString()
    };
  }
}
