"use server";
import { cookies, headers } from "next/headers";
import { and, count, eq, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { salesOpportunity } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

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

export async function getOpportunityDashboard() {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return { ok: false as const, error: ctx.error };
  }

  const o = salesOpportunity;
  const ws = ctx.workspaceId;

  const [kpisRow, byStep, monthlyNew] = await Promise.all([
    db
      .select({
        total: count(),
        inProgressAmt: sql<number>`COALESCE(SUM(CASE WHEN ${o.bizStepCode} NOT IN ('05','06') THEN COALESCE(${o.contExpecAmt}, 0) ELSE 0 END), 0)`,
        monthNew: sql<number>`COUNT(*) FILTER (WHERE ${o.insDate} >= DATE_TRUNC('month', NOW()))`,
        focus: sql<number>`COUNT(*) FILTER (WHERE ${o.focusMgrYn} = true)`,
      })
      .from(o)
      .where(eq(o.workspaceId, ws)),

    db
      .select({
        stepCode: o.bizStepCode,
        cnt: count(),
      })
      .from(o)
      .where(eq(o.workspaceId, ws))
      .groupBy(o.bizStepCode),

    db
      .select({
        ym: sql<string>`TO_CHAR(${o.insDate}, 'YYYY-MM')`,
        cnt: count(),
      })
      .from(o)
      .where(
        and(
          eq(o.workspaceId, ws),
          sql`${o.insDate} >= NOW() - INTERVAL '6 months'`,
        ),
      )
      .groupBy(sql`TO_CHAR(${o.insDate}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${o.insDate}, 'YYYY-MM')`),
  ]);

  const k = kpisRow[0] ?? { total: 0, inProgressAmt: 0, monthNew: 0, focus: 0 };

  return {
    ok: true as const,
    kpis: {
      total: Number(k.total) || 0,
      inProgressAmt: Number(k.inProgressAmt) || 0,
      monthNew: Number(k.monthNew) || 0,
      focus: Number(k.focus) || 0,
    },
    byStep: byStep.map((b) => ({
      stepCode: b.stepCode ?? null,
      cnt: Number(b.cnt) || 0,
    })),
    monthlyNew: monthlyNew.map((m) => ({
      ym: m.ym,
      cnt: Number(m.cnt) || 0,
    })),
  };
}
