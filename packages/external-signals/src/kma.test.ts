import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeKmaBaseDateTime, fetchVilageFcst } from "./kma.js";

interface FcstItem {
  baseDate?: string;
  baseTime?: string;
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
  nx?: number;
  ny?: number;
}

function mockKmaResponse(
  items: FcstItem[],
  init: { resultCode?: string; ok?: boolean; status?: number } = {}
) {
  const body = {
    response: {
      header: {
        resultCode: init.resultCode ?? "00",
        resultMsg: "OK"
      },
      body: {
        items: { item: items }
      }
    }
  };
  return vi.fn(async () =>
    ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body
    }) as unknown as Response
  );
}

describe("computeKmaBaseDateTime", () => {
  // KMA publish hours (KST): 02 05 08 11 14 17 20 23 + 30min buffer.

  it.each<[string, string, string, string]>([
    ["UTC 05:00 = KST 14:00 → 11:00 발표", "2026-04-30T05:00:00Z", "20260430", "1100"],
    ["UTC 01:30 = KST 10:30 → 08:00 발표", "2026-04-30T01:30:00Z", "20260430", "0800"],
    ["UTC 17:25 = KST 02:25 → 전일 23:00 발표 (KST 02:30 buffer 미달)", "2026-04-30T17:25:00Z", "20260430", "2300"],
    ["UTC 17:35 = KST 02:35 → 02:00 발표 (buffer 통과)", "2026-04-30T17:35:00Z", "20260501", "0200"],
    ["UTC 14:35 = KST 23:35 → 23:00 발표 (당일)", "2026-04-30T14:35:00Z", "20260430", "2300"],
    ["UTC 15:00 = KST 00:00 (다음날) → 전일 23:00", "2026-04-29T15:00:00Z", "20260429", "2300"],
    ["UTC 23:30 = KST 08:30 → 08:00", "2026-04-29T23:30:00Z", "20260430", "0800"]
  ])("%s", (_name, isoNow, expectedDate, expectedTime) => {
    const result = computeKmaBaseDateTime(new Date(isoNow));
    expect(result).toEqual({ base_date: expectedDate, base_time: expectedTime });
  });
});

describe("fetchVilageFcst", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when api key is missing", async () => {
    const fetchSpy = vi.fn();
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "", fetch: fetchSpy }
    );
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls KMA endpoint with required params", async () => {
    const fetchMock = mockKmaResponse([
      { category: "TMP", fcstDate: "20260430", fcstTime: "1400", fcstValue: "18" },
      { category: "TMX", fcstDate: "20260430", fcstTime: "1500", fcstValue: "22.0" },
      { category: "TMN", fcstDate: "20260430", fcstTime: "0600", fcstValue: "10.0" },
      { category: "SKY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "1" },
      { category: "PTY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "0" }
    ]);
    const now = new Date("2026-04-30T05:00:00Z"); // KST 14:00
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "TESTKEY", fetch: fetchMock, now: () => now }
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe(
      "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
    );
    expect(u.searchParams.get("serviceKey")).toBe("TESTKEY");
    expect(u.searchParams.get("dataType")).toBe("JSON");
    expect(u.searchParams.get("nx")).toBe("60");
    expect(u.searchParams.get("ny")).toBe("125");
    expect(u.searchParams.get("base_date")).toBe("20260430");
    expect(u.searchParams.get("base_time")).toBe("1100");
    expect(u.searchParams.get("numOfRows")).toBeTruthy();

    expect(result).toEqual({
      temp: 18,
      hi: 22,
      lo: 10,
      sky: "맑음",
      pty: "없음",
      fetchedAt: now
    });
  });

  it("maps SKY/PTY codes to korean labels", async () => {
    const fetchMock = mockKmaResponse([
      { category: "TMP", fcstDate: "20260430", fcstTime: "1400", fcstValue: "5" },
      { category: "SKY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "4" },
      { category: "PTY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "3" }
    ]);
    const now = new Date("2026-04-30T05:00:00Z");
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => now }
    );
    expect(result?.sky).toBe("흐림");
    expect(result?.pty).toBe("눈");
  });

  it("falls back to TMP min/max when TMX/TMN missing", async () => {
    const fetchMock = mockKmaResponse([
      { category: "TMP", fcstDate: "20260430", fcstTime: "0600", fcstValue: "8" },
      { category: "TMP", fcstDate: "20260430", fcstTime: "1400", fcstValue: "20" },
      { category: "TMP", fcstDate: "20260430", fcstTime: "1800", fcstValue: "16" },
      { category: "SKY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "3" },
      { category: "PTY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "0" }
    ]);
    const now = new Date("2026-04-30T05:00:00Z"); // KST 14:00
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => now }
    );
    expect(result?.temp).toBe(20);
    expect(result?.hi).toBe(20);
    expect(result?.lo).toBe(8);
    expect(result?.sky).toBe("구름많음");
  });

  it("returns null when resultCode is not '00'", async () => {
    const fetchMock = mockKmaResponse([], { resultCode: "10" });
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => new Date("2026-04-30T05:00:00Z") }
    );
    expect(result).toBeNull();
  });

  it("returns null when http response is not ok", async () => {
    const fetchMock = mockKmaResponse([], { ok: false, status: 500 });
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => new Date("2026-04-30T05:00:00Z") }
    );
    expect(result).toBeNull();
  });

  it("returns null when no TMP item is found", async () => {
    const fetchMock = mockKmaResponse([
      { category: "SKY", fcstDate: "20260430", fcstTime: "1400", fcstValue: "1" }
    ]);
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => new Date("2026-04-30T05:00:00Z") }
    );
    expect(result).toBeNull();
  });

  it("picks TMP closest to now (within today)", async () => {
    const fetchMock = mockKmaResponse([
      { category: "TMP", fcstDate: "20260430", fcstTime: "1200", fcstValue: "16" },
      { category: "TMP", fcstDate: "20260430", fcstTime: "1500", fcstValue: "19" },
      { category: "TMP", fcstDate: "20260430", fcstTime: "1800", fcstValue: "17" },
      { category: "SKY", fcstDate: "20260430", fcstTime: "1500", fcstValue: "1" },
      { category: "PTY", fcstDate: "20260430", fcstTime: "1500", fcstValue: "0" }
    ]);
    const now = new Date("2026-04-30T06:00:00Z"); // KST 15:00
    const result = await fetchVilageFcst(
      { nx: 60, ny: 125 },
      { apiKey: "K", fetch: fetchMock, now: () => now }
    );
    expect(result?.temp).toBe(19);
  });
});
