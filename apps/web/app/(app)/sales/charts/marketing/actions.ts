"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { salesActivity, salesOpportunity } from "@jarvis/db/schema";
import {
  MarketingByActivityInput,
  MarketingByProductInput,
} from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../../_lib/sales-context";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

export async function getMarketingByActivity(
  raw: unknown,
): Promise<Ok<{ rows: { activityTypeCode: string | null; count: number }[] }> | Err> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = MarketingByActivityInput.parse(raw);

  const rows = await db
    .select({
      activityTypeCode: salesActivity.actTypeCode,
      count: count(),
    })
    .from(salesActivity)
    .where(
      and(
        eq(salesActivity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesActivity.actYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(salesActivity.actTypeCode)
    .orderBy(salesActivity.actTypeCode);

  return {
    ok: true,
    rows: rows.map((r) => ({
      activityTypeCode: r.activityTypeCode ?? null,
      count: Number(r.count) || 0,
    })),
  };
}

export async function getMarketingByProduct(
  raw: unknown,
): Promise<Ok<{ rows: { productTypeCode: string | null; totalAmt: number }[] }> | Err> {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const input = MarketingByProductInput.parse(raw);

  const rows = await db
    .select({
      productTypeCode: salesOpportunity.productTypeCode,
      totalAmt: sql<number>`COALESCE(SUM(${salesOpportunity.contExpecAmt}), 0)`,
    })
    .from(salesOpportunity)
    .where(
      and(
        eq(salesOpportunity.workspaceId, ctx.workspaceId),
        sql`SUBSTRING(${salesOpportunity.contExpecYmd}, 1, 6) = ${input.ym}`,
      ),
    )
    .groupBy(salesOpportunity.productTypeCode)
    .orderBy(salesOpportunity.productTypeCode);

  return {
    ok: true,
    rows: rows.map((r) => ({
      productTypeCode: r.productTypeCode ?? null,
      totalAmt: Number(r.totalAmt) || 0,
    })),
  };
}
