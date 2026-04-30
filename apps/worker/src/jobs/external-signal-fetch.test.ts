import { describe, expect, it, vi } from "vitest";
import {
  computeFxChange,
  externalSignalFetchHandler,
  resolveWorkspaceWeatherRegion,
  type ExternalSignalDeps
} from "./external-signal-fetch.js";

describe("computeFxChange", () => {
  it("returns 0s when prev is null (first fetch)", () => {
    expect(
      computeFxChange(null, { USD: 0.001, EUR: 0.001, JPY: 0.1 })
    ).toEqual({ USD: 0, EUR: 0, JPY: 0 });
  });

  it("returns ratio (next - prev) / prev for each currency", () => {
    expect(
      computeFxChange(
        { USD: 0.001, EUR: 0.001, JPY: 0.1 },
        { USD: 0.0011, EUR: 0.001, JPY: 0.099 }
      )
    ).toEqual({
      USD: 0.1,
      EUR: 0,
      JPY: -0.01
    });
  });

  it("treats prev=0 as no prior data (returns 0)", () => {
    expect(
      computeFxChange(
        { USD: 0, EUR: 0.001, JPY: 0.1 },
        { USD: 0.001, EUR: 0.0011, JPY: 0.1 }
      )
    ).toEqual({ USD: 0, EUR: 0.1, JPY: 0 });
  });
});

describe("resolveWorkspaceWeatherRegion", () => {
  it("reads settings.defaults.weatherGrid", () => {
    expect(
      resolveWorkspaceWeatherRegion({
        defaults: { weatherGrid: { nx: 58, ny: 130, label: "강남구" } }
      })
    ).toEqual({ nx: 58, ny: 130, label: "강남구" });
  });

  it("returns null when missing", () => {
    expect(resolveWorkspaceWeatherRegion({})).toBeNull();
    expect(resolveWorkspaceWeatherRegion(null)).toBeNull();
    expect(resolveWorkspaceWeatherRegion({ defaults: {} })).toBeNull();
  });

  it("ignores invalid types", () => {
    expect(
      resolveWorkspaceWeatherRegion({
        defaults: { weatherGrid: { nx: "60", ny: 125 } }
      })
    ).toBeNull();
  });
});

function makeDeps(
  overrides: Partial<ExternalSignalDeps> = {}
): {
  deps: ExternalSignalDeps;
  upsertCalls: Array<{
    workspaceId: string;
    kind: "fx" | "weather";
    key: string;
    payload: unknown;
  }>;
  auditCalls: Array<{
    workspaceId: string;
    action: string;
    success: boolean;
    details: unknown;
    errorMessage?: string;
  }>;
} {
  const upsertCalls: Array<{
    workspaceId: string;
    kind: "fx" | "weather";
    key: string;
    payload: unknown;
  }> = [];
  const auditCalls: Array<{
    workspaceId: string;
    action: string;
    success: boolean;
    details: unknown;
    errorMessage?: string;
  }> = [];

  const deps: ExternalSignalDeps = {
    listWorkspaces: async () => [
      { id: "ws-1", settings: {} }
    ],
    getRegionLabel: async (_nx, _ny) => "서초구",
    getPreviousFxRates: async () => null,
    upsertSignal: async (input) => {
      upsertCalls.push(input);
    },
    writeAudit: async (input) => {
      auditCalls.push(input);
    },
    fetchKrwRates: async () => ({
      base: "KRW",
      rates: { USD: 0.001, EUR: 0.001, JPY: 0.1 },
      fetchedAt: new Date()
    }),
    fetchVilageFcst: async () => ({
      temp: 18,
      hi: 22,
      lo: 10,
      sky: "맑음",
      pty: "없음",
      fetchedAt: new Date()
    }),
    ...overrides
  };
  return { deps, upsertCalls, auditCalls };
}

describe("externalSignalFetchHandler", () => {
  it("processes all workspaces and reports counts on happy path", async () => {
    const { deps, upsertCalls, auditCalls } = makeDeps({
      listWorkspaces: async () => [
        { id: "ws-1", settings: {} },
        { id: "ws-2", settings: {} }
      ]
    });
    const result = await externalSignalFetchHandler([], deps);
    expect(result).toEqual({
      workspaces: 2,
      fxOk: 2,
      fxFail: 0,
      weatherOk: 2,
      weatherFail: 0
    });
    expect(upsertCalls).toHaveLength(4);
    expect(auditCalls.filter((a) => a.success)).toHaveLength(4);
  });

  it("upserts fx with computed change vs previous rates", async () => {
    const { deps, upsertCalls } = makeDeps({
      getPreviousFxRates: async () => ({ USD: 0.001, EUR: 0.001, JPY: 0.1 }),
      fetchKrwRates: async () => ({
        base: "KRW",
        rates: { USD: 0.0011, EUR: 0.001, JPY: 0.099 },
        fetchedAt: new Date()
      })
    });
    await externalSignalFetchHandler([], deps);
    const fxUpsert = upsertCalls.find((c) => c.kind === "fx");
    expect(fxUpsert).toBeDefined();
    expect(fxUpsert!.key).toBe("KRW");
    expect((fxUpsert!.payload as Record<string, unknown>).change).toEqual({
      USD: 0.1,
      EUR: 0,
      JPY: -0.01
    });
  });

  it("uses workspace-default region when settings has weatherGrid", async () => {
    const { deps, upsertCalls } = makeDeps({
      listWorkspaces: async () => [
        {
          id: "ws-1",
          settings: {
            defaults: {
              weatherGrid: { nx: 58, ny: 130, label: "강남구" }
            }
          }
        }
      ],
      getRegionLabel: async (nx, ny) =>
        nx === 58 && ny === 130 ? "강남구" : null
    });
    await externalSignalFetchHandler([], deps);
    const wUpsert = upsertCalls.find((c) => c.kind === "weather")!;
    expect(wUpsert.key).toBe("58,130");
    const payload = wUpsert.payload as Record<string, unknown>;
    expect(payload.regionLabel).toBe("강남구");
  });

  it("falls back to seocho when settings missing weatherGrid", async () => {
    const { deps, upsertCalls } = makeDeps({
      listWorkspaces: async () => [{ id: "ws-1", settings: {} }],
      getRegionLabel: async (nx, ny) =>
        nx === 60 && ny === 125 ? "서초구" : null
    });
    await externalSignalFetchHandler([], deps);
    const wUpsert = upsertCalls.find((c) => c.kind === "weather")!;
    expect(wUpsert.key).toBe("60,125");
  });

  it("records fx fail audit when adapter returns null", async () => {
    const { deps, auditCalls, upsertCalls } = makeDeps({
      fetchKrwRates: async () => null
    });
    const result = await externalSignalFetchHandler([], deps);
    expect(result.fxFail).toBe(1);
    expect(result.fxOk).toBe(0);
    expect(upsertCalls.find((c) => c.kind === "fx")).toBeUndefined();
    const fail = auditCalls.find(
      (a) => a.action === "external_signal.fetch.fail"
    );
    expect(fail).toBeDefined();
    expect(fail!.success).toBe(false);
  });

  it("records weather fail when adapter returns null", async () => {
    const { deps, auditCalls } = makeDeps({
      fetchVilageFcst: async () => null
    });
    const result = await externalSignalFetchHandler([], deps);
    expect(result.weatherFail).toBe(1);
    expect(result.weatherOk).toBe(0);
    expect(
      auditCalls.find(
        (a) =>
          a.action === "external_signal.fetch.fail" &&
          (a.details as Record<string, unknown>).kind === "weather"
      )
    ).toBeDefined();
  });

  it("isolates workspace failures (one ws crash does not stop others)", async () => {
    const { deps, upsertCalls, auditCalls } = makeDeps({
      listWorkspaces: async () => [
        { id: "ws-1", settings: {} },
        { id: "ws-2", settings: {} }
      ],
      fetchKrwRates: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({
          base: "KRW" as const,
          rates: { USD: 0.001, EUR: 0.001, JPY: 0.1 },
          fetchedAt: new Date()
        })
    });
    const result = await externalSignalFetchHandler([], deps);
    expect(result.workspaces).toBe(2);
    expect(result.fxOk).toBe(1);
    expect(result.fxFail).toBe(1);
    expect(upsertCalls.find((c) => c.workspaceId === "ws-2" && c.kind === "fx"))
      .toBeDefined();
    expect(
      auditCalls.find(
        (a) =>
          a.workspaceId === "ws-1" &&
          a.action === "external_signal.fetch.fail" &&
          a.errorMessage?.includes("boom")
      )
    ).toBeDefined();
  });

  it("returns zeros when no workspaces exist", async () => {
    const { deps } = makeDeps({ listWorkspaces: async () => [] });
    const result = await externalSignalFetchHandler([], deps);
    expect(result).toEqual({
      workspaces: 0,
      fxOk: 0,
      fxFail: 0,
      weatherOk: 0,
      weatherFail: 0
    });
  });

  it("uses fallback region label when getRegionLabel returns null", async () => {
    const { deps, upsertCalls } = makeDeps({
      getRegionLabel: async () => null
    });
    await externalSignalFetchHandler([], deps);
    const wUpsert = upsertCalls.find((c) => c.kind === "weather")!;
    const payload = wUpsert.payload as Record<string, unknown>;
    expect(typeof payload.regionLabel).toBe("string");
    expect(payload.regionLabel).toBeTruthy();
  });
});
