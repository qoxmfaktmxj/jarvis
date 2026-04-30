import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchKrwRates } from "./exchangerate.js";

function mockFetchOnce(
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  } as unknown as Response;
  return vi.fn(async () => response);
}

describe("fetchKrwRates", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null + warns when api key is missing", async () => {
    const fetchSpy = vi.fn();
    const result = await fetchKrwRates({ apiKey: "", fetch: fetchSpy });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null + warns when api key is undefined whitespace", async () => {
    const result = await fetchKrwRates({ apiKey: "   ", fetch: vi.fn() });
    expect(result).toBeNull();
  });

  it("calls v6.exchangerate-api.com with KRW base", async () => {
    const fetchMock = mockFetchOnce({
      result: "success",
      base_code: "KRW",
      conversion_rates: { USD: 0.00072, EUR: 0.00067, JPY: 0.108, GBP: 0.00057 }
    });
    const now = new Date("2026-04-30T05:00:00Z");
    const result = await fetchKrwRates({
      apiKey: "TESTKEY",
      fetch: fetchMock,
      now: () => now
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://v6.exchangerate-api.com/v6/TESTKEY/latest/KRW"
    );
    expect(result).toEqual({
      base: "KRW",
      rates: { USD: 0.00072, EUR: 0.00067, JPY: 0.108 },
      fetchedAt: now
    });
  });

  it("returns null when http response is not ok", async () => {
    const fetchMock = mockFetchOnce({}, { ok: false, status: 500 });
    const result = await fetchKrwRates({
      apiKey: "TESTKEY",
      fetch: fetchMock
    });
    expect(result).toBeNull();
  });

  it("returns null when api result is not 'success'", async () => {
    const fetchMock = mockFetchOnce({
      result: "error",
      "error-type": "invalid-key"
    });
    const result = await fetchKrwRates({
      apiKey: "TESTKEY",
      fetch: fetchMock
    });
    expect(result).toBeNull();
  });

  it("returns null when required currency is missing", async () => {
    const fetchMock = mockFetchOnce({
      result: "success",
      base_code: "KRW",
      conversion_rates: { USD: 0.00072 }
    });
    const result = await fetchKrwRates({
      apiKey: "TESTKEY",
      fetch: fetchMock
    });
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await fetchKrwRates({
      apiKey: "TESTKEY",
      fetch: fetchMock
    });
    expect(result).toBeNull();
  });

  it("falls back to process.env when apiKey is not provided", async () => {
    const fetchMock = mockFetchOnce({
      result: "success",
      base_code: "KRW",
      conversion_rates: { USD: 0.001, EUR: 0.001, JPY: 0.1 }
    });
    const original = process.env.EXCHANGERATE_API_KEY;
    process.env.EXCHANGERATE_API_KEY = "FROMENV";
    try {
      const result = await fetchKrwRates({ fetch: fetchMock });
      expect(result).not.toBeNull();
      const [url] = fetchMock.mock.calls[0]!;
      expect(url).toContain("/FROMENV/");
    } finally {
      if (original === undefined) {
        delete process.env.EXCHANGERATE_API_KEY;
      } else {
        process.env.EXCHANGERATE_API_KEY = original;
      }
    }
  });
});
