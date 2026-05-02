"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesPlanPerf } from "@jarvis/db/schema";
import { TrendInput } from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../../_lib/sales-context";

/**
 * chartPds/saleTrendChart + profitTrendChart: 다년도 월별 추이 (탭 공유).
 * 항상 ACTUAL 만 집계 (실적 추이).
 */
export async function getTrend(
  raw: unknown,
): Promise<
  | {
      ok: true;
      months: string[];
      series: { year: number; values: number[] }[];
    }
  | { ok: false; error: string }
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = TrendInput.parse(raw);

  const yearStrings = input.years.map(String);
  const conditions = [
    eq(salesPlanPerf.workspaceId, ctx.workspaceId),
    eq(salesPlanPerf.trendGbCd, input.metric),
    eq(salesPlanPerf.gubunCd, "ACTUAL"),
    inArray(sql`SUBSTRING(${salesPlanPerf.ym}, 1, 4)`, yearStrings),
  ];
  if (input.orgCd) conditions.push(eq(salesPlanPerf.orgCd, input.orgCd));

  const rows = await db
    .select({
      ym: salesPlanPerf.ym,
      amt: sql<number>`COALESCE(SUM(${salesPlanPerf.amt}), 0)`,
    })
    .from(salesPlanPerf)
    .where(and(...conditions))
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
