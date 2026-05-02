"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesActivity, salesOpportunity } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  MarketingByActivityInput,
  MarketingByProductInput,
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
      totalAmt: sql<number>`COALESCE(SUM(${o.contExpecAmt}), 0)`,
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
