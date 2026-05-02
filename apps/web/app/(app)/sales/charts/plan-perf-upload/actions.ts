"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { auditLog, salesPlanPerf } from "@jarvis/db/schema";
import {
  ListPlanPerfUploadInput,
  SavePlanPerfUploadInput,
  type SalesPlanPerfRow,
} from "@jarvis/shared/validation/sales-charts";
import { resolveSalesContext } from "../../_lib/sales-context";
import {
  UPLOAD_XLSX_STRICT_MIME,
  looksLikeXlsxMagicBytes,
  validateUploadMime,
  validateUploadSize,
} from "@/lib/server/validateUpload";

function serialize(r: typeof salesPlanPerf.$inferSelect): SalesPlanPerfRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    ym: r.ym,
    orgCd: r.orgCd,
    orgNm: r.orgNm,
    gubunCd: r.gubunCd as SalesPlanPerfRow["gubunCd"],
    trendGbCd: r.trendGbCd as SalesPlanPerfRow["trendGbCd"],
    amt: Number(r.amt),
    note: r.note ?? null,
    createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
  };
}

export async function listPlanPerfUpload(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) {
    return { ok: false as const, error: ctx.error, rows: [] as SalesPlanPerfRow[], total: 0, page: 1, limit: 50 };
  }
  const input = ListPlanPerfUploadInput.parse(rawInput);

  const conditions = [eq(salesPlanPerf.workspaceId, ctx.workspaceId)];
  if (input.ym) conditions.push(eq(salesPlanPerf.ym, input.ym));
  if (input.orgCd) conditions.push(eq(salesPlanPerf.orgCd, input.orgCd));
  if (input.gubunCd) conditions.push(eq(salesPlanPerf.gubunCd, input.gubunCd));
  if (input.trendGbCd) conditions.push(eq(salesPlanPerf.trendGbCd, input.trendGbCd));
  if (input.q) {
    conditions.push(
      or(
        ilike(salesPlanPerf.orgCd, `%${input.q}%`),
        ilike(salesPlanPerf.orgNm, `%${input.q}%`),
        ilike(salesPlanPerf.note, `%${input.q}%`),
      )!,
    );
  }

  const where = and(...conditions);
  const offset = (input.page - 1) * input.limit;
  const [rows, countRows] = await Promise.all([
    db.select().from(salesPlanPerf).where(where)
      .orderBy(desc(salesPlanPerf.ym), salesPlanPerf.orgCd, salesPlanPerf.gubunCd, salesPlanPerf.trendGbCd)
      .limit(input.limit).offset(offset),
    db.select({ count: count() }).from(salesPlanPerf).where(where),
  ]);

  return {
    ok: true as const,
    rows: rows.map(serialize),
    total: Number(countRows[0]?.count ?? 0),
    page: input.page,
    limit: input.limit,
  };
}

export async function savePlanPerfUpload(rawInput: unknown) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  const input = SavePlanPerfUploadInput.parse(rawInput);

  const now = new Date();
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  await db.transaction(async (tx) => {
    if (input.creates.length > 0) {
      const inserts = input.creates.map((c) => ({
        workspaceId: ctx.workspaceId,
        ym: c.ym,
        orgCd: c.orgCd,
        orgNm: c.orgNm,
        gubunCd: c.gubunCd,
        trendGbCd: c.trendGbCd,
        amt: c.amt,
        note: c.note ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      }));
      const result = await tx.insert(salesPlanPerf).values(inserts).onConflictDoNothing({
        target: [salesPlanPerf.workspaceId, salesPlanPerf.ym, salesPlanPerf.orgCd, salesPlanPerf.gubunCd, salesPlanPerf.trendGbCd],
      }).returning({ id: salesPlanPerf.id });
      inserted = result.length;
      if (inserted > 0) {
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.plan_perf_upload.create",
          resourceType: "sales_plan_perf",
          resourceId: null,
          details: { count: inserted },
          success: true,
        });
      }
    }

    for (const u of input.updates) {
      const patch: Record<string, unknown> = { updatedBy: ctx.userId, updatedAt: now };
      if (u.patch.ym !== undefined) patch.ym = u.patch.ym;
      if (u.patch.orgCd !== undefined) patch.orgCd = u.patch.orgCd;
      if (u.patch.orgNm !== undefined) patch.orgNm = u.patch.orgNm;
      if (u.patch.gubunCd !== undefined) patch.gubunCd = u.patch.gubunCd;
      if (u.patch.trendGbCd !== undefined) patch.trendGbCd = u.patch.trendGbCd;
      if (u.patch.amt !== undefined) patch.amt = u.patch.amt;
      if (u.patch.note !== undefined) patch.note = u.patch.note;
      const r = await tx.update(salesPlanPerf).set(patch)
        .where(and(eq(salesPlanPerf.id, u.id), eq(salesPlanPerf.workspaceId, ctx.workspaceId)))
        .returning({ id: salesPlanPerf.id });
      if (r.length > 0) updated += 1;
    }
    if (updated > 0) {
      await tx.insert(auditLog).values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "sales.plan_perf_upload.update",
        resourceType: "sales_plan_perf",
        resourceId: null,
        details: { count: updated },
        success: true,
      });
    }

    if (input.deletes.length > 0) {
      for (const id of input.deletes) {
        const r = await tx.delete(salesPlanPerf)
          .where(and(eq(salesPlanPerf.id, id), eq(salesPlanPerf.workspaceId, ctx.workspaceId)))
          .returning({ id: salesPlanPerf.id });
        if (r.length > 0) deleted += 1;
      }
      if (deleted > 0) {
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.plan_perf_upload.delete",
          resourceType: "sales_plan_perf",
          resourceId: null,
          details: { count: deleted },
          success: true,
        });
      }
    }
  });

  revalidatePath("/sales/charts/plan-perf-upload");
  return { ok: true as const, inserted, updated, deleted };
}

/**
 * Excel 업로드 — base64 인코딩된 xlsx Buffer 를 받아 파싱 후 batch upsert.
 * 컬럼 순서: ym | orgCd | orgNm | gubunCd | trendGbCd | amt | note (planPerfUpload 레거시와 동일).
 */
export async function uploadPlanPerfExcel(payload: { base64: string; mimeType?: string }) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };

  const XLSX = await import("xlsx");
  let buf: Buffer;
  try {
    buf = Buffer.from(payload.base64, "base64");
  } catch {
    return { ok: false as const, error: "Invalid base64 payload" };
  }

  // ── Size guard (10 MB default) — reject before parsing to avoid xlsx OOM ────
  const sizeCheck = validateUploadSize(buf.byteLength);
  if (!sizeCheck.ok) {
    return { ok: false as const, error: sizeCheck.error };
  }

  // ── MIME guard (declared) — strict xlsx/xls only (CSV is rejected). ────────
  // The legacy planPerfUpload pipeline expected real Excel files; CSV would
  // bypass the magic-bytes check below, so we narrow the allowlist here.
  if (payload.mimeType) {
    const mimeCheck = validateUploadMime(payload.mimeType, UPLOAD_XLSX_STRICT_MIME);
    if (!mimeCheck.ok) {
      return { ok: false as const, error: mimeCheck.error };
    }
  }

  // ── Magic-bytes guard — xlsx is a zip, must start with PK\x03\x04. ─────────
  // CSV is rejected upstream (strict MIME), so every passing file must have
  // xlsx magic bytes. No special-casing needed.
  if (!looksLikeXlsxMagicBytes(buf)) {
    return { ok: false as const, error: "Excel 파일 형식이 아닙니다 (magic bytes mismatch)." };
  }

  let workbook;
  try {
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch {
    return { ok: false as const, error: "Excel 파일을 읽을 수 없습니다." };
  }
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { ok: false as const, error: "시트가 비어 있습니다." };
  const sheet = workbook.Sheets[firstSheet]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const errors: string[] = [];
  const valid: Array<typeof salesPlanPerf.$inferInsert> = [];
  const VALID_GUBUN = new Set(["PLAN", "ACTUAL", "FORECAST"]);
  const VALID_TREND = new Set(["SALES", "GROSS_PROFIT", "OP_INCOME"]);

  rows.forEach((r, idx) => {
    const lineNo = idx + 2;
    const ym = String(r.ym ?? "").trim();
    const orgCd = String(r.orgCd ?? "").trim();
    const orgNm = String(r.orgNm ?? "").trim();
    const gubunCd = String(r.gubunCd ?? "").trim().toUpperCase();
    const trendGbCd = String(r.trendGbCd ?? "").trim().toUpperCase();
    const amtRaw = r.amt;
    const note = r.note != null ? String(r.note) : null;

    if (!/^\d{6}$/.test(ym)) { errors.push(`L${lineNo}: ym 형식 오류 (YYYYMM)`); return; }
    if (!orgCd) { errors.push(`L${lineNo}: orgCd 누락`); return; }
    if (!orgNm) { errors.push(`L${lineNo}: orgNm 누락`); return; }
    if (!VALID_GUBUN.has(gubunCd)) { errors.push(`L${lineNo}: gubunCd ∉ {PLAN,ACTUAL,FORECAST}`); return; }
    if (!VALID_TREND.has(trendGbCd)) { errors.push(`L${lineNo}: trendGbCd ∉ {SALES,GROSS_PROFIT,OP_INCOME}`); return; }
    const amt = typeof amtRaw === "number" ? amtRaw : Number(String(amtRaw ?? "0").replace(/,/g, ""));
    if (!Number.isFinite(amt)) { errors.push(`L${lineNo}: amt 숫자 변환 불가`); return; }

    valid.push({
      workspaceId: ctx.workspaceId,
      ym,
      orgCd,
      orgNm,
      gubunCd,
      trendGbCd,
      amt: Math.round(amt),
      note,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
  });

  if (errors.length > 0 && valid.length === 0) {
    return { ok: false as const, error: "Excel 파싱 오류", errors };
  }

  let upserted = 0;
  if (valid.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const result = await db.insert(salesPlanPerf).values(slice)
        .onConflictDoUpdate({
          target: [salesPlanPerf.workspaceId, salesPlanPerf.ym, salesPlanPerf.orgCd, salesPlanPerf.gubunCd, salesPlanPerf.trendGbCd],
          set: {
            orgNm: sql`excluded.org_nm`,
            amt: sql`excluded.amt`,
            note: sql`excluded.note`,
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          },
        }).returning({ id: salesPlanPerf.id });
      upserted += result.length;
    }
    await db.insert(auditLog).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "sales.plan_perf_upload.excel_import",
      resourceType: "sales_plan_perf",
      resourceId: null,
      details: { upserted, errors: errors.length },
      success: errors.length === 0,
    });
  }

  revalidatePath("/sales/charts/plan-perf-upload");
  return { ok: true as const, upserted, errors };
}
