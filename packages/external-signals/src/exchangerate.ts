/**
 * exchangerate-api.com 어댑터.
 *
 * KRW base로 환율을 조회해 USD/EUR/JPY 정규화 결과를 반환한다.
 * 무료 tier 1500 calls/mo (worker cron이 16 calls/day × ~4 workspaces = 1920/mo
 * 근접 — 단일 워크스페이스 환경에서만 안전. 다중 워크스페이스는 향후 단일 캐시 공유 권장).
 *
 * Stateless: change(직전 대비 변화율)는 worker가 DB 직전 row와 비교해 계산.
 */

import type { FxAdapterResult } from "./types.js";

interface ExchangeRateResponse {
  result?: string;
  base_code?: string;
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
}

interface FetchKrwRatesDeps {
  /** 의존성 주입(테스트용). 미설정 시 global fetch 사용. */
  fetch?: typeof fetch;
  /** 미설정 시 `process.env.EXCHANGERATE_API_KEY` 사용. 빈 문자열/공백이면 graceful degrade. */
  apiKey?: string;
  /** 측정 시각 주입(테스트용). */
  now?: () => Date;
}

const ENDPOINT = "https://v6.exchangerate-api.com/v6";
const REQUIRED = ["USD", "EUR", "JPY"] as const;

export async function fetchKrwRates(
  deps: FetchKrwRatesDeps = {}
): Promise<FxAdapterResult | null> {
  const apiKey = (deps.apiKey ?? process.env.EXCHANGERATE_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn(
      "[external-signals/exchangerate] EXCHANGERATE_API_KEY is not set — skipping fetch"
    );
    return null;
  }

  const fetchFn = deps.fetch ?? globalThis.fetch;
  const url = `${ENDPOINT}/${apiKey}/latest/KRW`;

  let payload: ExchangeRateResponse;
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      console.warn(
        `[external-signals/exchangerate] HTTP ${response.status} from ${ENDPOINT}`
      );
      return null;
    }
    payload = (await response.json()) as ExchangeRateResponse;
  } catch (err) {
    console.warn(
      "[external-signals/exchangerate] fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }

  if (payload.result !== "success" || !payload.conversion_rates) {
    console.warn(
      `[external-signals/exchangerate] non-success result: ${payload.result ?? "unknown"} (${payload["error-type"] ?? ""})`
    );
    return null;
  }

  const rates: Partial<Record<(typeof REQUIRED)[number], number>> = {};
  for (const code of REQUIRED) {
    const value = payload.conversion_rates[code];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      console.warn(
        `[external-signals/exchangerate] missing/invalid ${code} rate`
      );
      return null;
    }
    rates[code] = value;
  }

  return {
    base: "KRW",
    rates: { USD: rates.USD!, EUR: rates.EUR!, JPY: rates.JPY! },
    fetchedAt: (deps.now ?? (() => new Date()))()
  };
}
