"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesPlanPerf } from "@jarvis/db/schema";
import { AdminPerfInput } from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../../_lib/sales-context";

/**
 * chartAdminMgr: 관리자 실적 — 연/분기 단위 × 조직별 × PLAN/ACTUAL/FORECAST 시리즈.
 * 단년도 12개월 또는 4분기로 집계.
 */
type Bucket = string; // "01"~"12" or "Q1"~"Q4"
type Series = "PLAN" | "ACTUAL" | "FORECAST";

export async function getAdminPerf(
  raw: unknown,
): Promise<
  | {
      ok: true;
      buckets: Bucket[];
      rows: { orgCd: string; orgNm: string; series: Series; values: number[] }[];
    }
  | { ok: false; error: string }
> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = AdminPerfInput.parse(raw);

  const conditions = [
    eq(salesPlanPerf.workspaceId, ctx.workspaceId),
    eq(salesPlanPerf.trendGbCd, input.metric),
    sql`SUBSTRING(${salesPlanPerf.ym}, 1, 4) = ${String(input.year)}`,
  ];
  if (input.orgCd) conditions.push(eq(salesPlanPerf.orgCd, input.orgCd));

  const data = await db
    .select({
      ym: salesPlanPerf.ym,
      orgCd: salesPlanPerf.orgCd,
      orgNm: salesPlanPerf.orgNm,
      gubunCd: salesPlanPerf.gubunCd,
      amt: salesPlanPerf.amt,
    })
    .from(salesPlanPerf)
    .where(and(...conditions))
    .orderBy(salesPlanPerf.orgCd, salesPlanPerf.ym);

  const buckets: Bucket[] =
    input.view === "year"
      ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
      : ["Q1", "Q2", "Q3", "Q4"];

  // group by (orgCd, gubunCd) → bucket → sum
  const grouped = new Map<string, { orgCd: string; orgNm: string; series: Series; values: number[] }>();
  for (const row of data) {
    const month = row.ym.slice(4, 6);
    const idx =
      input.view === "year" ? Number(month) - 1 : Math.floor((Number(month) - 1) / 3);
    if (idx < 0 || idx >= buckets.length) continue;
    const series = row.gubunCd as Series;
    if (series !== "PLAN" && series !== "ACTUAL" && series !== "FORECAST") continue;
    const key = `${row.orgCd}|${series}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        orgCd: row.orgCd,
        orgNm: row.orgNm,
        series,
        values: new Array(buckets.length).fill(0) as number[],
      };
      grouped.set(key, entry);
    }
    entry.values[idx] = (entry.values[idx] ?? 0) + Number(row.amt);
  }

  return { ok: true, buckets, rows: Array.from(grouped.values()) };
}
