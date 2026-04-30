import { describe, expect, it } from "vitest";
import {
  buildFxSignal,
  buildWeatherSignal,
  isStale,
  resolveWeatherRegion,
  STALE_THRESHOLD_MS,
  type WeatherRegion
} from "./dashboard-signals.js";

const now = new Date("2026-04-30T05:00:00Z");

describe("resolveWeatherRegion", () => {
  it("uses user.preferences.weatherGrid when valid", () => {
    const region = resolveWeatherRegion(
      { weatherGrid: { nx: 55, ny: 127, label: "광화문" } },
      { defaults: { weatherGrid: { nx: 60, ny: 125, label: "서초구" } } }
    );
    expect(region).toEqual({ nx: 55, ny: 127, label: "광화문" });
  });

  it("falls back to workspace default when user pref missing", () => {
    const region = resolveWeatherRegion(
      {},
      { defaults: { weatherGrid: { nx: 58, ny: 130, label: "강남구" } } }
    );
    expect(region).toEqual({ nx: 58, ny: 130, label: "강남구" });
  });

  it("falls back to seocho when both missing", () => {
    const region = resolveWeatherRegion({}, {});
    expect(region).toEqual({ nx: 60, ny: 125, label: "서초구" });
  });

  it("ignores invalid user pref shape", () => {
    const region = resolveWeatherRegion(
      { weatherGrid: { nx: "abc", ny: 125 } },
      {}
    );
    expect(region).toEqual({ nx: 60, ny: 125, label: "서초구" });
  });

  it("accepts user pref without label and provides default label", () => {
    const region = resolveWeatherRegion({ weatherGrid: { nx: 55, ny: 127 } }, {});
    expect(region.nx).toBe(55);
    expect(region.ny).toBe(127);
    expect(region.label).toBeTruthy();
  });

  it("treats null preferences/settings as empty", () => {
    const region = resolveWeatherRegion(null, null);
    expect(region.nx).toBe(60);
    expect(region.ny).toBe(125);
  });
});

describe("isStale", () => {
  it("is false within 90 minutes", () => {
    const fetched = new Date(now.getTime() - 30 * 60_000);
    expect(isStale(fetched, now)).toBe(false);
  });

  it("is true over 90 minutes", () => {
    const fetched = new Date(now.getTime() - 91 * 60_000);
    expect(isStale(fetched, now)).toBe(true);
  });

  it("STALE_THRESHOLD_MS is 90 minutes", () => {
    expect(STALE_THRESHOLD_MS).toBe(90 * 60 * 1000);
  });
});

describe("buildFxSignal", () => {
  it("returns null for null row", () => {
    expect(buildFxSignal(null, now)).toBeNull();
  });

  it("normalizes a valid row", () => {
    const fetched = new Date(now.getTime() - 10 * 60_000);
    const sig = buildFxSignal(
      {
        payload: {
          base: "KRW",
          rates: { USD: 0.00072, EUR: 0.00067, JPY: 0.108 },
          change: { USD: 0.001, EUR: -0.002, JPY: 0.0 }
        },
        fetchedAt: fetched
      },
      now
    );
    expect(sig).toEqual({
      base: "KRW",
      rates: { USD: 0.00072, EUR: 0.00067, JPY: 0.108 },
      change: { USD: 0.001, EUR: -0.002, JPY: 0.0 },
      fetchedAt: fetched,
      stale: false
    });
  });

  it("flags stale when fetchedAt > 90min ago", () => {
    const fetched = new Date(now.getTime() - 120 * 60_000);
    const sig = buildFxSignal(
      {
        payload: {
          base: "KRW",
          rates: { USD: 0.001, EUR: 0.001, JPY: 0.1 },
          change: { USD: 0, EUR: 0, JPY: 0 }
        },
        fetchedAt: fetched
      },
      now
    );
    expect(sig?.stale).toBe(true);
  });

  it("returns null for malformed payload", () => {
    expect(
      buildFxSignal(
        {
          payload: { rates: {} },
          fetchedAt: now
        },
        now
      )
    ).toBeNull();
  });

  it("defaults change to 0 when missing (first fetch)", () => {
    const sig = buildFxSignal(
      {
        payload: {
          base: "KRW",
          rates: { USD: 0.001, EUR: 0.001, JPY: 0.1 }
        },
        fetchedAt: now
      },
      now
    );
    expect(sig?.change).toEqual({ USD: 0, EUR: 0, JPY: 0 });
  });
});

describe("buildWeatherSignal", () => {
  const region: WeatherRegion = { nx: 60, ny: 125, label: "서초구" };

  it("returns null for null row", () => {
    expect(buildWeatherSignal(null, region, now)).toBeNull();
  });

  it("normalizes a valid row", () => {
    const fetched = new Date(now.getTime() - 10 * 60_000);
    const sig = buildWeatherSignal(
      {
        payload: {
          temp: 18,
          hi: 22,
          lo: 10,
          sky: "맑음",
          pty: "없음"
        },
        fetchedAt: fetched
      },
      region,
      now
    );
    expect(sig).toEqual({
      region: { nx: 60, ny: 125, label: "서초구" },
      temp: 18,
      hi: 22,
      lo: 10,
      sky: "맑음",
      pty: "없음",
      fetchedAt: fetched,
      stale: false
    });
  });

  it("includes dust when present", () => {
    const sig = buildWeatherSignal(
      {
        payload: {
          temp: 18,
          hi: 22,
          lo: 10,
          sky: "맑음",
          pty: "없음",
          dust: "보통"
        },
        fetchedAt: now
      },
      region,
      now
    );
    expect(sig?.dust).toBe("보통");
  });

  it("prefers region label from caller over payload regionLabel", () => {
    const sig = buildWeatherSignal(
      {
        payload: {
          temp: 18,
          hi: 22,
          lo: 10,
          sky: "맑음",
          pty: "없음",
          regionLabel: "OLD"
        },
        fetchedAt: now
      },
      region,
      now
    );
    expect(sig?.region.label).toBe("서초구");
  });

  it("returns null for malformed payload", () => {
    expect(
      buildWeatherSignal(
        { payload: { temp: "not a number" }, fetchedAt: now },
        region,
        now
      )
    ).toBeNull();
  });

  it("flags stale when fetchedAt > 90min", () => {
    const fetched = new Date(now.getTime() - 120 * 60_000);
    const sig = buildWeatherSignal(
      {
        payload: { temp: 18, hi: 22, lo: 10, sky: "맑음", pty: "없음" },
        fetchedAt: fetched
      },
      region,
      now
    );
    expect(sig?.stale).toBe(true);
  });
});
