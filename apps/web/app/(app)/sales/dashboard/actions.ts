"use server";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesActivity, salesOpportunity, salesPlanPerf } from "@jarvis/db/schema";
import {
  DashboardBAInput,
  DashboardOpIncomeInput,
  DashboardSalesTrendInput,
  DashboardSucProbInput,
} from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../_lib/sales-context";

type Err = { ok: false; error: string };

/** 영업본부 대시보드 sub-chart 1: 다년도 월별 매출 실적 추이. */
export async function getDashboardSalesTrend(
  raw: unknown,
): Promise<
  | { ok: true; months: string[]; series: { year: number; values: number[] }[] }
  | Err
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = DashboardSalesTrendInput.parse(raw);

  const yearStrings = input.years.map(String);
  const rows = await db
    .select({
      ym: salesPlanPerf.ym,
      amt: sql<number>`COALESCE(SUM(${salesPlanPerf.amt}), 0)`,
    })
    .from(salesPlanPerf)
    .where(
      and(
        eq(salesPlanPerf.workspaceId, ctx.workspaceId),
        eq(salesPlanPerf.trendGbCd, "SALES"),
        eq(salesPlanPerf.gubunCd, "ACTUAL"),
        inArray(sql`SUBSTRING(${salesPlanPerf.ym}, 1, 4)`, yearStrings),
      ),
    )
    .groupBy(salesPlanPerf.ym)
    .orderBy(salesPlanPerf.ym);

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const seriesMap = new Map<number, number[]>();
  for (const yr of input.years) seriesMap.set(yr, new Array(12).fill(0) as number[]);
  for (const r of rows) {
    const yr = Number(r.ym.slice(0, 4));
    const idx = Number(r.ym.slice(4, 6)) - 1;
    const arr = seriesMap.get(yr);
    if (!arr || idx < 0 || idx >= 12) continue;
    arr[idx] = Number(r.amt);
  }
  return {
    ok: true,
    months,
    series: input.years.map((yr) => ({ year: yr, values: seriesMap.get(yr) ?? [] })),
  };
}

/** sub-chart 2: 영업기회 단계 분포 (기준월). */
export async function getDashboardSucProb(
  raw: unknown,
): Promise<
  | { ok: true; rows: { bizStepCode: string | null; count: number; totalAmt: number }[] }
  | Err
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = DashboardSucProbInput.parse(raw);

  const rows = await db
    .select({
      bizStepCode: salesOpportunity.bizStepCode,
      count: count(),
      totalAmt: sql<number>`COALESCE(SUM(${salesOpportunity.contExpecAmt}), 0)`,
    })
    .from(salesOpportunity)
    .where(
      and(
        eq(salesOpportunity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesOpportunity.contExpecYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(salesOpportunity.bizStepCode)
    .orderBy(salesOpportunity.bizStepCode);

  return {
    ok: true,
    rows: rows.map((r) => ({
      bizStepCode: r.bizStepCode ?? null,
      count: Number(r.count) || 0,
      totalAmt: Number(r.totalAmt) || 0,
    })),
  };
}

/** sub-chart 3: 단년도 영업이익 PLAN/ACTUAL/FORECAST 월별 비교. */
export async function getDashboardOpIncome(
  raw: unknown,
): Promise<
  | { ok: true; months: string[]; plan: number[]; actual: number[]; forecast: number[] }
  | Err
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = DashboardOpIncomeInput.parse(raw);

  const rows = await db
    .select({
      ym: salesPlanPerf.ym,
      gubunCd: salesPlanPerf.gubunCd,
      amt: sql<number>`COALESCE(SUM(${salesPlanPerf.amt}), 0)`,
    })
    .from(salesPlanPerf)
    .where(
      and(
        eq(salesPlanPerf.workspaceId, ctx.workspaceId),
        eq(salesPlanPerf.trendGbCd, "OP_INCOME"),
        sql`SUBSTRING(${salesPlanPerf.ym}, 1, 4) = ${String(input.year)}`,
      ),
    )
    .groupBy(salesPlanPerf.ym, salesPlanPerf.gubunCd)
    .orderBy(salesPlanPerf.ym);

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const plan = new Array(12).fill(0) as number[];
  const actual = new Array(12).fill(0) as number[];
  const forecast = new Array(12).fill(0) as number[];
  for (const r of rows) {
    const idx = Number(r.ym.slice(4, 6)) - 1;
    if (idx < 0 || idx >= 12) continue;
    const target =
      r.gubunCd === "PLAN" ? plan : r.gubunCd === "ACTUAL" ? actual : r.gubunCd === "FORECAST" ? forecast : null;
    if (!target) continue;
    target[idx] = Number(r.amt);
  }
  return { ok: true, months, plan, actual, forecast };
}

/** sub-chart 4: 영업활동 vs 영업기회 (Business Activity) 기준월 분포. */
export async function getDashboardBA(
  raw: unknown,
): Promise<
  | {
      ok: true;
      activityCount: number;
      opportunityCount: number;
      opportunityAmt: number;
      byOrg: { orgNm: string | null; activityCount: number; opportunityCount: number }[];
    }
  | Err
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = DashboardBAInput.parse(raw);

  const [actTotal] = await db
    .select({ c: count() })
    .from(salesActivity)
    .where(
      and(
        eq(salesActivity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesActivity.actYmd}, 1, 6) = ${input.ym}`,
      ),
    );

  const [oppTotal] = await db
    .select({
      c: count(),
      amt: sql<number>`COALESCE(SUM(${salesOpportunity.contExpecAmt}), 0)`,
    })
    .from(salesOpportunity)
    .where(
      and(
        eq(salesOpportunity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesOpportunity.contExpecYmd}, 1, 6) = ${input.ym}`,
      ),
    );

  const orgOppRows = await db
    .select({
      orgNm: salesOpportunity.orgNm,
      c: count(),
    })
    .from(salesOpportunity)
    .where(
      and(
        eq(salesOpportunity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesOpportunity.contExpecYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(salesOpportunity.orgNm);

  // Activity counts per org via opportunityId → opportunity.orgNm join.
  const orgActRows = await db
    .select({
      orgNm: salesOpportunity.orgNm,
      c: count(),
    })
    .from(salesActivity)
    .innerJoin(salesOpportunity, eq(salesActivity.opportunityId, salesOpportunity.id))
    .where(
      and(
        eq(salesActivity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesActivity.actYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(salesOpportunity.orgNm);

  const actByOrg = new Map<string | null, number>();
  for (const r of orgActRows) actByOrg.set(r.orgNm ?? null, Number(r.c) || 0);

  return {
    ok: true,
    activityCount: Number(actTotal?.c ?? 0),
    opportunityCount: Number(oppTotal?.c ?? 0),
    opportunityAmt: Number(oppTotal?.amt ?? 0),
    byOrg: orgOppRows.map((r) => ({
      orgNm: r.orgNm ?? null,
      activityCount: actByOrg.get(r.orgNm ?? null) ?? 0,
      opportunityCount: Number(r.c) || 0,
    })),
  };
}
