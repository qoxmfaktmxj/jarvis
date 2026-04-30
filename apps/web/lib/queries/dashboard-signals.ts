/**
 * dashboard-signals.ts — RSC 진입점에서 환율·날씨 시그널을 조회.
 *
 * Phase-Dashboard (2026-04-30) 인스턴스 분할 작업:
 *  - Instance 1: schema + interface stub (commit 8f89279)
 *  - Instance 2 (이 파일): 본문 구현
 *  - 카드 UI: 별도 instance
 *
 * 데이터 흐름: worker가 `external_signal` 테이블에 cron 으로 fetch+upsert →
 * 본 RSC query 가 read-only로 select. cache age > 90min 이면 stale=true.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { externalSignal, user, workspace } from "@jarvis/db/schema";

export interface FxSignal {
  base: "KRW";
  rates: { USD: number; EUR: number; JPY: number };
  change: { USD: number; EUR: number; JPY: number };
  fetchedAt: Date;
  stale: boolean;
}

export type SkyLabel = "맑음" | "구름많음" | "흐림";
export type PtyLabel = "없음" | "비" | "눈" | "비/눈" | "소나기";
export type DustLabel = "좋음" | "보통" | "나쁨" | "매우나쁨";

export interface WeatherRegion {
  nx: number;
  ny: number;
  label: string;
}

export interface WeatherSignal {
  region: WeatherRegion;
  temp: number;
  hi: number;
  lo: number;
  sky: SkyLabel;
  pty: PtyLabel;
  dust?: DustLabel;
  fetchedAt: Date;
  stale: boolean;
}

export interface DashboardSignals {
  fx: FxSignal | null;
  weather: WeatherSignal | null;
}

/** 90분 이상 된 데이터는 stale 표시 — UI에서 "데이터 갱신 중" 등 표시 가능. */
export const STALE_THRESHOLD_MS = 90 * 60 * 1000;

/** 워크스페이스 default 격자 (Phase 0 seed 기준): 서울 서초구. */
const SEOCHO_FALLBACK: WeatherRegion = { nx: 60, ny: 125, label: "서초구" };

const SKY_VALUES: SkyLabel[] = ["맑음", "구름많음", "흐림"];
const PTY_VALUES: PtyLabel[] = ["없음", "비", "눈", "비/눈", "소나기"];
const DUST_VALUES: DustLabel[] = ["좋음", "보통", "나쁨", "매우나쁨"];

interface SignalRow {
  payload: unknown;
  fetchedAt: Date;
}

export function isStale(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > STALE_THRESHOLD_MS;
}

export function resolveWeatherRegion(
  preferences: unknown,
  workspaceSettings: unknown
): WeatherRegion {
  const fromUser = readGrid(preferences);
  if (fromUser) return fromUser;
  const fromWs = readGrid(
    isObject(workspaceSettings) ? workspaceSettings.defaults : null
  );
  if (fromWs) return fromWs;
  return SEOCHO_FALLBACK;
}

function readGrid(source: unknown): WeatherRegion | null {
  if (!isObject(source)) return null;
  const grid = source.weatherGrid;
  if (!isObject(grid)) return null;
  const nx = grid.nx;
  const ny = grid.ny;
  if (typeof nx !== "number" || typeof ny !== "number") return null;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const label =
    typeof grid.label === "string" && grid.label.trim()
      ? grid.label
      : `격자 ${nx},${ny}`;
  return { nx, ny, label };
}

export function buildFxSignal(
  row: SignalRow | null,
  now: Date
): FxSignal | null {
  if (!row) return null;
  const payload = row.payload;
  if (!isObject(payload)) return null;
  if (payload.base !== "KRW") return null;

  const rates = parseRateTriple(payload.rates);
  if (!rates) return null;

  const change =
    parseRateTriple(payload.change) ?? { USD: 0, EUR: 0, JPY: 0 };

  return {
    base: "KRW",
    rates,
    change,
    fetchedAt: row.fetchedAt,
    stale: isStale(row.fetchedAt, now)
  };
}

function parseRateTriple(
  v: unknown
): { USD: number; EUR: number; JPY: number } | null {
  if (!isObject(v)) return null;
  const usd = v.USD;
  const eur = v.EUR;
  const jpy = v.JPY;
  if (typeof usd !== "number" || !Number.isFinite(usd)) return null;
  if (typeof eur !== "number" || !Number.isFinite(eur)) return null;
  if (typeof jpy !== "number" || !Number.isFinite(jpy)) return null;
  return { USD: usd, EUR: eur, JPY: jpy };
}

export function buildWeatherSignal(
  row: SignalRow | null,
  region: WeatherRegion,
  now: Date
): WeatherSignal | null {
  if (!row) return null;
  const payload = row.payload;
  if (!isObject(payload)) return null;

  const temp = numericField(payload.temp);
  const hi = numericField(payload.hi);
  const lo = numericField(payload.lo);
  if (temp === null || hi === null || lo === null) return null;

  const sky = enumField(payload.sky, SKY_VALUES);
  const pty = enumField(payload.pty, PTY_VALUES);
  if (!sky || !pty) return null;

  const dust = enumField(payload.dust, DUST_VALUES) ?? undefined;

  return {
    region,
    temp,
    hi,
    lo,
    sky,
    pty,
    ...(dust ? { dust } : {}),
    fetchedAt: row.fetchedAt,
    stale: isStale(row.fetchedAt, now)
  };
}

function numericField(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function enumField<T extends string>(v: unknown, allowed: T[]): T | null {
  return typeof v === "string" && (allowed as string[]).includes(v)
    ? (v as T)
    : null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function getDailySignals(
  workspaceId: string,
  userId: string,
  now: Date = new Date(),
  database: typeof db = db
): Promise<DashboardSignals> {
  const [userRow] = await database
    .select({ preferences: user.preferences })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.workspaceId, workspaceId)))
    .limit(1);

  const [wsRow] = await database
    .select({ settings: workspace.settings })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  const region = resolveWeatherRegion(
    userRow?.preferences,
    wsRow?.settings
  );

  const [fxRow] = await database
    .select({
      payload: externalSignal.payload,
      fetchedAt: externalSignal.fetchedAt
    })
    .from(externalSignal)
    .where(
      and(
        eq(externalSignal.workspaceId, workspaceId),
        eq(externalSignal.kind, "fx"),
        eq(externalSignal.key, "KRW")
      )
    )
    .orderBy(desc(externalSignal.fetchedAt))
    .limit(1);

  const weatherKey = `${region.nx},${region.ny}`;
  const [weatherRow] = await database
    .select({
      payload: externalSignal.payload,
      fetchedAt: externalSignal.fetchedAt
    })
    .from(externalSignal)
    .where(
      and(
        eq(externalSignal.workspaceId, workspaceId),
        eq(externalSignal.kind, "weather"),
        eq(externalSignal.key, weatherKey)
      )
    )
    .orderBy(desc(externalSignal.fetchedAt))
    .limit(1);

  return {
    fx: buildFxSignal(fxRow ?? null, now),
    weather: buildWeatherSignal(weatherRow ?? null, region, now)
  };
}
