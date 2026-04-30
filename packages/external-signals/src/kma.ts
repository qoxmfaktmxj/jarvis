/**
 * 기상청 단기예보(getVilageFcst) 어댑터.
 *
 * - 발표 시각(KST): 02 05 08 11 14 17 20 23 (8회/일). 발표 후 ~10분 시점부터
 *   API 데이터 사용 가능 → 30분 buffer로 직전 발표 시각 선택.
 * - 격자좌표(nx, ny)는 region_grid 테이블에서 조회 (Phase 0 seed).
 * - resultCode '00'만 정상. 기타 코드는 graceful null 반환.
 */

import type {
  PtyLabel,
  SkyLabel,
  WeatherAdapterResult
} from "./types.js";

const ENDPOINT =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

const PUBLISH_HOURS_KST = [2, 5, 8, 11, 14, 17, 20, 23] as const;
const BUFFER_MIN = 30;
const NUM_OF_ROWS = 300;

const SKY_MAP: Record<string, SkyLabel> = {
  "1": "맑음",
  "3": "구름많음",
  "4": "흐림"
};
const PTY_MAP: Record<string, PtyLabel> = {
  "0": "없음",
  "1": "비",
  "2": "비/눈",
  "3": "눈",
  "4": "소나기"
};

interface FetchVilageFcstDeps {
  fetch?: typeof fetch;
  apiKey?: string;
  now?: () => Date;
}

interface VilageFcstResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: VilageFcstItem[] };
    };
  };
}

interface VilageFcstItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

/**
 * KST 기준 직전 발표 시각을 (base_date, base_time) 형식으로 계산.
 * 30분 buffer를 두어 발표 직후의 빈 응답을 피한다.
 */
export function computeKmaBaseDateTime(now: Date): {
  base_date: string;
  base_time: string;
} {
  const effectiveKstMs =
    now.getTime() + 9 * 60 * 60 * 1000 - BUFFER_MIN * 60 * 1000;
  const eff = new Date(effectiveKstMs);
  const y = eff.getUTCFullYear();
  const m = eff.getUTCMonth();
  const d = eff.getUTCDate();
  const h = eff.getUTCHours();

  let baseHour: number | null = null;
  for (const ph of PUBLISH_HOURS_KST) {
    if (ph <= h) baseHour = ph;
  }

  let dateY = y;
  let dateM = m;
  let dateD = d;

  if (baseHour === null) {
    const yest = new Date(Date.UTC(y, m, d) - 24 * 60 * 60 * 1000);
    dateY = yest.getUTCFullYear();
    dateM = yest.getUTCMonth();
    dateD = yest.getUTCDate();
    baseHour = 23;
  }

  const base_date = `${dateY}${pad2(dateM + 1)}${pad2(dateD)}`;
  const base_time = `${pad2(baseHour)}00`;
  return { base_date, base_time };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export async function fetchVilageFcst(
  region: { nx: number; ny: number },
  deps: FetchVilageFcstDeps = {}
): Promise<WeatherAdapterResult | null> {
  const apiKey = (deps.apiKey ?? process.env.KMA_SERVICE_KEY ?? "").trim();
  if (!apiKey) {
    console.warn(
      "[external-signals/kma] KMA_SERVICE_KEY is not set — skipping fetch"
    );
    return null;
  }

  const fetchFn = deps.fetch ?? globalThis.fetch;
  const now = (deps.now ?? (() => new Date()))();
  const { base_date, base_time } = computeKmaBaseDateTime(now);

  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(NUM_OF_ROWS));
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", base_date);
  url.searchParams.set("base_time", base_time);
  url.searchParams.set("nx", String(region.nx));
  url.searchParams.set("ny", String(region.ny));

  let payload: VilageFcstResponse;
  try {
    const response = await fetchFn(url.toString());
    if (!response.ok) {
      console.warn(`[external-signals/kma] HTTP ${response.status}`);
      return null;
    }
    payload = (await response.json()) as VilageFcstResponse;
  } catch (err) {
    console.warn(
      "[external-signals/kma] fetch failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }

  const resultCode = payload.response?.header?.resultCode;
  if (resultCode !== "00") {
    console.warn(
      `[external-signals/kma] non-success resultCode: ${resultCode ?? "unknown"}`
    );
    return null;
  }

  const items = payload.response?.body?.items?.item ?? [];
  return parseItems(items, now);
}

/**
 * KMA fcst items에서 현재 KST 기준 가장 가까운 슬롯의 TMP/SKY/PTY +
 * 오늘의 TMX/TMN을 추출. TMX/TMN 누락 시 TMP slots min/max로 fallback.
 */
function parseItems(
  items: VilageFcstItem[],
  now: Date
): WeatherAdapterResult | null {
  const todayKst = kstYyyymmdd(now);
  const nowMinutesKst = kstMinutesOfDay(now);

  const todayTmp = items.filter(
    (it) => it.category === "TMP" && it.fcstDate === todayKst
  );
  if (todayTmp.length === 0) {
    console.warn("[external-signals/kma] no TMP items for today");
    return null;
  }

  // 현재 시각에 가장 가까운 TMP slot 선택
  let nearest: VilageFcstItem = todayTmp[0]!;
  let nearestDelta = Math.abs(
    fcstTimeToMinutes(nearest.fcstTime) - nowMinutesKst
  );
  for (const it of todayTmp) {
    const delta = Math.abs(fcstTimeToMinutes(it.fcstTime) - nowMinutesKst);
    if (delta < nearestDelta) {
      nearest = it;
      nearestDelta = delta;
    }
  }
  const temp = parseNumeric(nearest.fcstValue);
  if (temp === null) return null;

  const tmx = items.find(
    (it) => it.category === "TMX" && it.fcstDate === todayKst
  );
  const tmn = items.find(
    (it) => it.category === "TMN" && it.fcstDate === todayKst
  );
  const tmpValues = todayTmp
    .map((it) => parseNumeric(it.fcstValue))
    .filter((v): v is number => v !== null);

  const hi =
    parseNumeric(tmx?.fcstValue ?? "") ??
    (tmpValues.length > 0 ? Math.max(...tmpValues) : temp);
  const lo =
    parseNumeric(tmn?.fcstValue ?? "") ??
    (tmpValues.length > 0 ? Math.min(...tmpValues) : temp);

  // SKY/PTY: 같은 시각의 슬롯 우선, 없으면 가까운 시각
  const sky = pickClosestCode(items, "SKY", todayKst, nowMinutesKst, SKY_MAP, "맑음");
  const pty = pickClosestCode(items, "PTY", todayKst, nowMinutesKst, PTY_MAP, "없음");

  return {
    temp,
    hi,
    lo,
    sky,
    pty,
    fetchedAt: now
  };
}

function pickClosestCode<T extends string>(
  items: VilageFcstItem[],
  category: string,
  date: string,
  nowMinutes: number,
  map: Record<string, T>,
  fallback: T
): T {
  const matches = items.filter(
    (it) => it.category === category && it.fcstDate === date
  );
  if (matches.length === 0) return fallback;
  let best: VilageFcstItem = matches[0]!;
  let bestDelta = Math.abs(fcstTimeToMinutes(best.fcstTime) - nowMinutes);
  for (const it of matches) {
    const delta = Math.abs(fcstTimeToMinutes(it.fcstTime) - nowMinutes);
    if (delta < bestDelta) {
      best = it;
      bestDelta = delta;
    }
  }
  return map[best.fcstValue] ?? fallback;
}

function kstYyyymmdd(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${pad2(kst.getUTCMonth() + 1)}${pad2(kst.getUTCDate())}`;
}

function kstMinutesOfDay(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function fcstTimeToMinutes(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  return h * 60 + m;
}

function parseNumeric(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
