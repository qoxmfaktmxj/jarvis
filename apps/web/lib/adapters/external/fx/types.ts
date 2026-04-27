export type FxCurrency = "USD" | "EUR" | "JPY";

export type FxRate = {
  code: FxCurrency;
  value: number;
  delta: number;
  basis: "1" | "100";
};

export type FxSnapshot = {
  rates: FxRate[];
  source: "mock" | "exim";
  fetchedAt: string;
};

export interface FxAdapter {
  getSnapshot(): Promise<FxSnapshot>;
}
