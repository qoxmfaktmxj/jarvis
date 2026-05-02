"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesPlanPerf } from "@jarvis/db/schema";
import { PlanPerfChartInput } from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../../_lib/sales-context";

/**
 * chartPds/planPerfChart: 단년도 계획 vs 실적 vs 전망 비교 (월별).
 */
export async function getPlanPerfChart(
  raw: unknown,
): Promise<
  | {
      ok: true;
      months: string[];
      plan: number[];
      actual: number[];
      forecast: number[];
    }
  | { ok: false; error: string }
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = PlanPerfChartInput.parse(raw);

  const conditions = [
    eq(salesPlanPerf.workspaceId, ctx.workspaceId),
    eq(salesPlanPerf.trendGbCd, input.metric),
    sql`SUBSTRING(${salesPlanPerf.ym}, 1, 4) = ${String(input.year)}`,
  ];
  if (input.orgCd) conditions.push(eq(salesPlanPerf.orgCd, input.orgCd));

  const rows = await db
    .select({
      ym: salesPlanPerf.ym,
      gubunCd: salesPlanPerf.gubunCd,
      amt: sql<number>`COALESCE(SUM(${salesPlanPerf.amt}), 0)`,
    })
    .from(salesPlanPerf)
    .where(and(...conditions))
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
