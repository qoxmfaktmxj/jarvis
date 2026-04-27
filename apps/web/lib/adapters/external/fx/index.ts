import type { FxAdapter } from "./types.js";
import { MockFxAdapter } from "./mock.js";

export type { FxAdapter, FxSnapshot, FxRate, FxCurrency } from "./types.js";

export function getFxAdapter(): FxAdapter {
  return new MockFxAdapter();
}
