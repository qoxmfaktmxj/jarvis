"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesActivity, salesOpportunity, salesPlanPerf } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  AdminPerfInput,
  MarketingByActivityInput,
  MarketingByProductInput,
  SaleTrendInput,
  ProfitTrendInput,
  PlanPerfChartInput,
  DashboardSalesTrendInput,
  DashboardSucProbInput,
  DashboardOpIncomeInput,
  DashboardBAInput,
} from "@jarvis/shared/validation/sales-charts";

async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

async function resolveSalesContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" as const };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" as const };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false as const, error: "Forbidden" as const };
  }
  return { ok: true as const, workspaceId: session.workspaceId };
}

export async function getMarketingByActivity(raw: unknown) {
  const input = MarketingByActivityInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const a = salesActivity;
  const rows = await db
    .select({
      activityTypeCode: a.actTypeCode,
      count: count(),
      // sum_amt is NULL because activity has no amount column; report only count
    })
    .from(a)
    .where(
      and(
        eq(a.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${a.actYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(a.actTypeCode)
    .orderBy(a.actTypeCode);

  return {
    ok: true as const,
    rows: rows.map((r) => ({
      activityTypeCode: r.activityTypeCode ?? null,
      activityTypeName: null as string | null, // joined in page via codeItem lookup
      count: Number(r.count) || 0,
    })),
  };
}

export async function getMarketingByProduct(raw: unknown) {
  const input = MarketingByProductInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const o = salesOpportunity;
  const rows = await db
    .select({
      productTypeCode: o.productTypeCode,
      totalAmt: sql<string>`COALESCE(SUM(${o.contExpecAmt}), 0)::text`,
    })
    .from(o)
    .where(
      and(
        eq(o.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${o.contExpecYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(o.productTypeCode)
    .orderBy(o.productTypeCode);

  return {
    ok: true as const,
    rows: rows.map((r) => ({
      productTypeCode: r.productTypeCode ?? null,
      productTypeName: null as string | null,
      totalAmt: Number(r.totalAmt) || 0,
    })),
  };
}

export async function getAdminPerf(raw: unknown) {
  const input = AdminPerfInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const p = salesPlanPerf;
  const yearStr = String(input.year);
  const orgFilter = input.orgCd ? sql`AND ${p.orgCd} = ${input.orgCd}` : sql``;

  // Invariant: ym is always exactly 6 chars (varchar(6) + Zod regex /^\d{6}$/).
  // Year view emits SUBSTRING(ym, 5, 2) → "01".."12"; quarter view emits Q1..Q4.
  const rawRows = await db.execute<{
    period: string; gubun_cd: string; total: string;
  }>(sql`
    SELECT
      ${input.view === "year"
        ? sql`SUBSTRING(${p.ym}, 5, 2)`
        : sql`'Q' || ((CAST(SUBSTRING(${p.ym}, 5, 2) AS INT) - 1) / 3 + 1)`} AS period,
      ${p.gubunCd} AS gubun_cd,
      COALESCE(SUM(${p.amt}), 0)::text AS total
    FROM ${p}
    WHERE ${p.workspaceId} = ${ctx.workspaceId}
      AND SUBSTRING(${p.ym}, 1, 4) = ${yearStr}
      AND ${p.trendGbCd} = ${input.metric}
      ${orgFilter}
    GROUP BY period, ${p.gubunCd}
    ORDER BY period
  `);

  // Pivot gubun → columns. Period order: Jan-Dec or Q1-Q4.
  const periods = input.view === "year"
    ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
    : ["Q1", "Q2", "Q3", "Q4"];

  const acc = new Map<string, { period: string; plan: number; actual: number; forecast: number }>();
  for (const p2 of periods) {
    acc.set(p2, { period: p2, plan: 0, actual: 0, forecast: 0 });
  }
  for (const r of rawRows.rows) {
    const row = acc.get(r.period);
    if (!row) continue;
    const v = Number(r.total) || 0;
    if (r.gubun_cd === "PLAN") row.plan = v;
    else if (r.gubun_cd === "ACTUAL") row.actual = v;
    else if (r.gubun_cd === "FORECAST") row.forecast = v;
  }

  return { ok: true as const, rows: Array.from(acc.values()) };
}

// ---------------------------------------------------------------------------
// Task 7: Trend aggregation helper + actions
// ---------------------------------------------------------------------------

interface TrendRow { ym: string; plan: number; actual: number; forecast: number }

async function aggregateMonthlyByGubun(
  workspaceId: string,
  years: number[],
  metric: "SALES" | "GROSS_PROFIT" | "OP_INCOME",
  orgCd: string | undefined,
): Promise<TrendRow[]> {
  const p = salesPlanPerf;
  const orgFilter = orgCd ? sql`AND ${p.orgCd} = ${orgCd}` : sql``;
  const yearList = sql.join(years.map((y) => sql`${String(y)}`), sql`, `);

  const result = await db.execute<{ ym: string; gubun_cd: string; total: string }>(sql`
    SELECT ${p.ym} AS ym, ${p.gubunCd} AS gubun_cd, COALESCE(SUM(${p.amt}), 0)::text AS total
    FROM ${p}
    WHERE ${p.workspaceId} = ${workspaceId}
      AND SUBSTRING(${p.ym}, 1, 4) IN (${yearList})
      AND ${p.trendGbCd} = ${metric}
      ${orgFilter}
    GROUP BY ${p.ym}, ${p.gubunCd}
    ORDER BY ${p.ym}
  `);

  const acc = new Map<string, TrendRow>();
  // Pre-fill all months in requested years for stable x-axis
  for (const y of years) {
    for (let m = 1; m <= 12; m += 1) {
      const ym = `${y}${String(m).padStart(2, "0")}`;
      acc.set(ym, { ym, plan: 0, actual: 0, forecast: 0 });
    }
  }
  for (const r of result.rows) {
    const row = acc.get(r.ym);
    if (!row) continue;
    const v = Number(r.total) || 0;
    if (r.gubun_cd === "PLAN") row.plan = v;
    else if (r.gubun_cd === "ACTUAL") row.actual = v;
    else if (r.gubun_cd === "FORECAST") row.forecast = v;
  }
  return Array.from(acc.values()).sort((a, b) => a.ym.localeCompare(b.ym));
}

export async function getSaleTrend(raw: unknown) {
  const input = SaleTrendInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const rows = await aggregateMonthlyByGubun(ctx.workspaceId, input.years, "SALES", input.orgCd);
  return { ok: true as const, rows };
}

export async function getProfitTrend(raw: unknown) {
  const input = ProfitTrendInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const rows = await aggregateMonthlyByGubun(ctx.workspaceId, input.years, "OP_INCOME", input.orgCd);
  return { ok: true as const, rows };
}

export async function getPlanPerfChart(raw: unknown) {
  const input = PlanPerfChartInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  // Default metric for the planPerf chart is SALES; gubun pivot is the point.
  const rows = await aggregateMonthlyByGubun(ctx.workspaceId, [input.year], "SALES", input.orgCd);
  return { ok: true as const, rows };
}

// ---------------------------------------------------------------------------
// Task 8: Dashboard aggregation actions (5 functions)
// ---------------------------------------------------------------------------

export async function getDashboardSalesTrend(raw: unknown) {
  const input = DashboardSalesTrendInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const rows = await aggregateMonthlyByGubun(ctx.workspaceId, input.years, "SALES", undefined);
  return { ok: true as const, rows };
}

export async function getDashboardOpIncome(raw: unknown) {
  const input = DashboardOpIncomeInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const p = salesPlanPerf;
  const yearStr = String(input.year);
  const result = await db.execute<{ ym: string; total: string }>(sql`
    SELECT ${p.ym} AS ym, COALESCE(SUM(${p.amt}), 0)::text AS total
    FROM ${p}
    WHERE ${p.workspaceId} = ${ctx.workspaceId}
      AND SUBSTRING(${p.ym}, 1, 4) = ${yearStr}
      AND ${p.trendGbCd} = 'OP_INCOME'
      AND ${p.gubunCd} = 'ACTUAL'
    GROUP BY ${p.ym}
    ORDER BY ${p.ym}
  `);

  const acc = new Map<string, { ym: string; opIncome: number }>();
  for (let m = 1; m <= 12; m += 1) {
    const ym = `${input.year}${String(m).padStart(2, "0")}`;
    acc.set(ym, { ym, opIncome: 0 });
  }
  for (const r of result.rows) {
    const row = acc.get(r.ym);
    if (row) row.opIncome = Number(r.total) || 0;
  }
  return { ok: true as const, rows: Array.from(acc.values()) };
}

export async function getDashboardBA(raw: unknown) {
  const input = DashboardBAInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const p = salesPlanPerf;
  const result = await db.execute<{ org_nm: string; gubun_cd: string; total: string }>(sql`
    SELECT ${p.orgNm} AS org_nm, ${p.gubunCd} AS gubun_cd, COALESCE(SUM(${p.amt}), 0)::text AS total
    FROM ${p}
    WHERE ${p.workspaceId} = ${ctx.workspaceId}
      AND ${p.ym} = ${input.ym}
      AND ${p.trendGbCd} = 'SALES'
      AND ${p.gubunCd} IN ('PLAN', 'ACTUAL')
    GROUP BY ${p.orgNm}, ${p.gubunCd}
    ORDER BY ${p.orgNm}
  `);

  const acc = new Map<string, { orgNm: string; plan: number; actual: number }>();
  for (const r of result.rows) {
    const row = acc.get(r.org_nm) ?? { orgNm: r.org_nm, plan: 0, actual: 0 };
    const v = Number(r.total) || 0;
    if (r.gubun_cd === "PLAN") row.plan = v;
    else if (r.gubun_cd === "ACTUAL") row.actual = v;
    acc.set(r.org_nm, row);
  }
  return { ok: true as const, rows: Array.from(acc.values()) };
}

// SucProb buckets opportunity contImplPer (numeric 0-100) into B10026 grades.
export async function getDashboardSucProb(raw: unknown) {
  const input = DashboardSucProbInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const o = salesOpportunity;
  const result = await db.execute<{ grade_code: string | null; cnt: string; total_amt: string }>(sql`
    SELECT
      CASE
        WHEN ${o.contImplPer} >= 90 THEN 'A'
        WHEN ${o.contImplPer} >= 70 THEN 'B'
        WHEN ${o.contImplPer} >= 50 THEN 'C'
        WHEN ${o.contImplPer} IS NOT NULL THEN 'D'
        ELSE NULL
      END AS grade_code,
      COUNT(*)::text AS cnt,
      COALESCE(SUM(${o.contExpecAmt}), 0)::text AS total_amt
    FROM ${o}
    WHERE ${o.workspaceId} = ${ctx.workspaceId}
      AND SUBSTRING(${o.contExpecYmd}, 1, 6) = ${input.ym}
    GROUP BY grade_code
    ORDER BY grade_code NULLS LAST
  `);

  return {
    ok: true as const,
    rows: result.rows.map((r) => ({
      gradeCode: r.grade_code,
      count: Number(r.cnt) || 0,
      totalAmt: Number(r.total_amt) || 0,
    })),
  };
}

// SucProbHap collapses A/B → HIGH, C → MED, D → LOW (B10027).
export async function getDashboardSucProbHap(raw: unknown) {
  const input = DashboardSucProbInput.parse(raw);
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const o = salesOpportunity;
  const result = await db.execute<{ grade_code: string | null; cnt: string; total_amt: string }>(sql`
    SELECT
      CASE
        WHEN ${o.contImplPer} >= 70 THEN 'HIGH'
        WHEN ${o.contImplPer} >= 50 THEN 'MED'
        WHEN ${o.contImplPer} IS NOT NULL THEN 'LOW'
        ELSE NULL
      END AS grade_code,
      COUNT(*)::text AS cnt,
      COALESCE(SUM(${o.contExpecAmt}), 0)::text AS total_amt
    FROM ${o}
    WHERE ${o.workspaceId} = ${ctx.workspaceId}
      AND SUBSTRING(${o.contExpecYmd}, 1, 6) = ${input.ym}
    GROUP BY grade_code
    ORDER BY grade_code NULLS LAST
  `);

  return {
    ok: true as const,
    rows: result.rows.map((r) => ({
      gradeCode: r.grade_code,
      count: Number(r.cnt) || 0,
      totalAmt: Number(r.total_amt) || 0,
    })),
  };
}
