import type { FxAdapter } from "./types";
import { MockFxAdapter } from "./mock";

export type { FxAdapter, FxSnapshot, FxRate, FxCurrency } from "./types";

export function getFxAdapter(): FxAdapter {
  return new MockFxAdapter();
}
