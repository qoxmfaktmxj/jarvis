/**
 * external-signal-fetch — 환율(FX) + 날씨(Weather) cron 잡.
 *
 * 스케줄(KST): 07-19시 매시 + 21·00·03시. 즉 하루 16회.
 * 모든 워크스페이스 iterate하며 워크스페이스당 FX 1회 + Weather 1회 fetch → upsert.
 *
 * 의존성 주입(`ExternalSignalDeps`)으로 DB·외부 API를 추상화 — unit test가
 * 실제 인프라 없이 핸들러 흐름을 검증할 수 있다. 기본 deps는 `defaultDeps()`가
 * Drizzle + 어댑터로 채운다.
 */

import type PgBoss from "pg-boss";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  externalSignal,
  regionGrid,
  workspace
} from "@jarvis/db/schema";
import {
  fetchKrwRates as adapterFetchKrwRates,
  fetchVilageFcst as adapterFetchVilageFcst,
  type FxAdapterResult,
  type FxRates,
  type WeatherAdapterResult
} from "@jarvis/external-signals";

const CACHE_TTL_MS = 90 * 60 * 1000; // RSC stale 임계와 동일.
const DEFAULT_REGION = { nx: 60, ny: 125, label: "서초구" } as const;

export interface UpsertSignalInput {
  workspaceId: string;
  kind: "fx" | "weather";
  key: string;
  payload: unknown;
  fetchedAt: Date;
  expiresAt: Date;
}

export interface AuditInput {
  workspaceId: string;
  action: string;
  success: boolean;
  details: Record<string, unknown>;
  errorMessage?: string;
}

export interface ExternalSignalDeps {
  listWorkspaces(): Promise<{ id: string; settings: unknown }[]>;
  getRegionLabel(nx: number, ny: number): Promise<string | null>;
  getPreviousFxRates(workspaceId: string): Promise<FxRates | null>;
  upsertSignal(input: UpsertSignalInput): Promise<void>;
  writeAudit(input: AuditInput): Promise<void>;
  fetchKrwRates(): Promise<FxAdapterResult | null>;
  fetchVilageFcst(region: {
    nx: number;
    ny: number;
  }): Promise<WeatherAdapterResult | null>;
}

export interface ExternalSignalResult {
  workspaces: number;
  fxOk: number;
  fxFail: number;
  weatherOk: number;
  weatherFail: number;
}

export function computeFxChange(
  prev: FxRates | null,
  next: FxRates
): { USD: number; EUR: number; JPY: number } {
  return {
    USD: ratio(prev?.USD, next.USD),
    EUR: ratio(prev?.EUR, next.EUR),
    JPY: ratio(prev?.JPY, next.JPY)
  };
}

function ratio(prev: number | undefined, next: number): number {
  if (typeof prev !== "number" || prev === 0 || !Number.isFinite(prev)) {
    return 0;
  }
  return roundTo((next - prev) / prev, 6);
}

function roundTo(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

export function resolveWorkspaceWeatherRegion(
  settings: unknown
): { nx: number; ny: number; label?: string } | null {
  if (!isObject(settings)) return null;
  const defaults = settings.defaults;
  if (!isObject(defaults)) return null;
  const grid = defaults.weatherGrid;
  if (!isObject(grid)) return null;
  if (typeof grid.nx !== "number" || typeof grid.ny !== "number") return null;
  if (!Number.isFinite(grid.nx) || !Number.isFinite(grid.ny)) return null;
  return {
    nx: grid.nx,
    ny: grid.ny,
    label:
      typeof grid.label === "string" && grid.label.trim()
        ? grid.label
        : undefined
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function externalSignalFetchHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
  deps: ExternalSignalDeps = defaultDeps(),
  now: Date = new Date()
): Promise<ExternalSignalResult> {
  const workspaces = await deps.listWorkspaces();
  let fxOk = 0;
  let fxFail = 0;
  let weatherOk = 0;
  let weatherFail = 0;

  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

  for (const ws of workspaces) {
    // FX
    try {
      const result = await deps.fetchKrwRates();
      if (!result) {
        await deps.writeAudit({
          workspaceId: ws.id,
          action: "external_signal.fetch.fail",
          success: false,
          details: { kind: "fx", reason: "adapter_returned_null" },
          errorMessage: "fx adapter returned null"
        });
        fxFail++;
      } else {
        const prev = await deps.getPreviousFxRates(ws.id);
        const change = computeFxChange(prev, result.rates);
        await deps.upsertSignal({
          workspaceId: ws.id,
          kind: "fx",
          key: "KRW",
          payload: { base: "KRW", rates: result.rates, change },
          fetchedAt: result.fetchedAt,
          expiresAt
        });
        await deps.writeAudit({
          workspaceId: ws.id,
          action: "external_signal.fetch.success",
          success: true,
          details: { kind: "fx" }
        });
        fxOk++;
      }
    } catch (err) {
      await deps.writeAudit({
        workspaceId: ws.id,
        action: "external_signal.fetch.fail",
        success: false,
        details: { kind: "fx" },
        errorMessage: errMsg(err)
      });
      fxFail++;
    }

    // Weather
    try {
      const wsRegion = resolveWorkspaceWeatherRegion(ws.settings);
      const region = wsRegion ?? DEFAULT_REGION;
      const labelFromDb = await deps.getRegionLabel(region.nx, region.ny);
      const label =
        ("label" in region && region.label) ||
        labelFromDb ||
        `격자 ${region.nx},${region.ny}`;
      const result = await deps.fetchVilageFcst({ nx: region.nx, ny: region.ny });
      if (!result) {
        await deps.writeAudit({
          workspaceId: ws.id,
          action: "external_signal.fetch.fail",
          success: false,
          details: { kind: "weather", nx: region.nx, ny: region.ny },
          errorMessage: "weather adapter returned null"
        });
        weatherFail++;
      } else {
        await deps.upsertSignal({
          workspaceId: ws.id,
          kind: "weather",
          key: `${region.nx},${region.ny}`,
          payload: {
            temp: result.temp,
            hi: result.hi,
            lo: result.lo,
            sky: result.sky,
            pty: result.pty,
            regionLabel: label
          },
          fetchedAt: result.fetchedAt,
          expiresAt
        });
        await deps.writeAudit({
          workspaceId: ws.id,
          action: "external_signal.fetch.success",
          success: true,
          details: { kind: "weather", nx: region.nx, ny: region.ny }
        });
        weatherOk++;
      }
    } catch (err) {
      await deps.writeAudit({
        workspaceId: ws.id,
        action: "external_signal.fetch.fail",
        success: false,
        details: { kind: "weather" },
        errorMessage: errMsg(err)
      });
      weatherFail++;
    }
  }

  return {
    workspaces: workspaces.length,
    fxOk,
    fxFail,
    weatherOk,
    weatherFail
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 기본 의존성: 실제 Drizzle DB + 외부 어댑터. 핸들러 인자 미주입 시 사용. */
export function defaultDeps(): ExternalSignalDeps {
  return {
    listWorkspaces: async () => {
      const rows = await db
        .select({ id: workspace.id, settings: workspace.settings })
        .from(workspace);
      return rows.map((r) => ({ id: r.id, settings: r.settings }));
    },
    getRegionLabel: async (nx, ny) => {
      const [row] = await db
        .select({
          sido: regionGrid.sido,
          sigungu: regionGrid.sigungu,
          dong: regionGrid.dong
        })
        .from(regionGrid)
        .where(and(eq(regionGrid.nx, nx), eq(regionGrid.ny, ny)))
        .limit(1);
      if (!row) return null;
      return row.dong
        ? `${row.sigungu} ${row.dong}`
        : row.sigungu || row.sido;
    },
    getPreviousFxRates: async (workspaceId) => {
      const [row] = await db
        .select({ payload: externalSignal.payload })
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
      if (!row) return null;
      const payload = row.payload as { rates?: FxRates };
      return payload?.rates ?? null;
    },
    upsertSignal: async (input) => {
      await db
        .insert(externalSignal)
        .values({
          workspaceId: input.workspaceId,
          kind: input.kind,
          key: input.key,
          payload: input.payload as Record<string, unknown>,
          fetchedAt: input.fetchedAt,
          expiresAt: input.expiresAt
        })
        .onConflictDoUpdate({
          target: [
            externalSignal.workspaceId,
            externalSignal.kind,
            externalSignal.key
          ],
          set: {
            payload: input.payload as Record<string, unknown>,
            fetchedAt: input.fetchedAt,
            expiresAt: input.expiresAt
          }
        });
    },
    writeAudit: async (input) => {
      await db.insert(auditLog).values({
        workspaceId: input.workspaceId,
        action: input.action,
        resourceType: "external_signal",
        details: input.details,
        success: input.success,
        errorMessage: input.errorMessage
      });
    },
    fetchKrwRates: () => adapterFetchKrwRates(),
    fetchVilageFcst: (region) => adapterFetchVilageFcst(region)
  };
}

export const EXTERNAL_SIGNAL_FETCH_QUEUE = "external-signal-fetch";

/**
 * KST 기준 하루 16회: 07-19시 매시(낮) + 21·00·03시(야간).
 * UTC 환산: 22,23,0-10(낮) + 12,15,18(야간) → 단일 표현식으로 병합.
 *
 * NOTE: pg-boss schedule() 은 큐 이름(name)을 PK로 사용하므로
 * 같은 큐에 schedule()을 두 번 호출하면 두 번째가 첫 번째를 덮어쓴다.
 * 두 개의 cron 시간대를 한 표현식에 담아 단일 호출로 등록해야 한다.
 */
export const EXTERNAL_SIGNAL_FETCH_CRON = "0 22,23,0-10,12,15,18 * * *";
