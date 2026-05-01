"use server";
/**
 * apps/web/app/(app)/sales/product-cost-mapping/actions.ts
 *
 * 영업 제품군 × 코스트 매핑 (sales_product_type_cost / TBIZ024 row mapping)
 * server actions.
 *
 * Phase-Sales P1.5 Task 6 (2026-05-01).
 *
 * 권한: SALES_ALL — 다른 sales/* 라우트와 동일.
 * 감사: sales.product_type_cost.{create,update,delete}
 */
import { cookies, headers } from "next/headers";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import {
  auditLog,
  salesCostMaster,
  salesProductType,
  salesProductTypeCost,
} from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listProductCostMappingInput,
  listProductCostMappingOutput,
  saveProductCostMappingInput,
  saveProductCostMappingOutput,
} from "@jarvis/shared/validation/sales/product-type-cost";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirroring sales/product-types/actions.ts)
// ---------------------------------------------------------------------------
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
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
}

// ---------------------------------------------------------------------------
// listProductCostMapping — joins product_nm + cost_nm for display.
// q matches productCd/productNm/costCd/costNm/note partial.
// ---------------------------------------------------------------------------
export async function listProductCostMapping(
  rawInput: z.input<typeof listProductCostMappingInput>,
) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listProductCostMappingInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  const where = and(
    eq(salesProductTypeCost.workspaceId, ctx.workspaceId),
    input.productTypeId ? eq(salesProductTypeCost.productTypeId, input.productTypeId) : undefined,
    input.costId ? eq(salesProductTypeCost.costId, input.costId) : undefined,
    input.q
      ? or(
          ilike(salesProductType.productCd, `%${input.q}%`),
          ilike(salesProductType.productNm, `%${input.q}%`),
          ilike(salesCostMaster.costCd, `%${input.q}%`),
          ilike(salesCostMaster.costNm, `%${input.q}%`),
          ilike(salesProductTypeCost.note, `%${input.q}%`),
        )
      : undefined,
    // searchYmd: "row is valid on this date" — sdate <= searchYmd AND (edate >= searchYmd OR edate IS NULL)
    input.searchYmd ? lte(salesProductTypeCost.sdate, input.searchYmd) : undefined,
    input.searchYmd
      ? or(
          gte(salesProductTypeCost.edate, input.searchYmd),
          isNull(salesProductTypeCost.edate),
        )
      : undefined,
    // searchCostNm: ILIKE on joined cost name
    input.searchCostNm
      ? ilike(salesCostMaster.costNm, `%${input.searchCostNm}%`)
      : undefined,
  );

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: salesProductTypeCost.id,
        productTypeId: salesProductTypeCost.productTypeId,
        costId: salesProductTypeCost.costId,
        productTypeNm: salesProductType.productNm,
        costNm: salesCostMaster.costNm,
        legacyProductTypeCd: salesProductTypeCost.legacyProductTypeCd,
        legacyCostCd: salesProductTypeCost.legacyCostCd,
        sdate: salesProductTypeCost.sdate,
        edate: salesProductTypeCost.edate,
        bizYn: salesProductTypeCost.bizYn,
        note: salesProductTypeCost.note,
        createdAt: salesProductTypeCost.createdAt,
        updatedAt: salesProductTypeCost.updatedAt,
        createdBy: salesProductTypeCost.createdBy,
        updatedBy: salesProductTypeCost.updatedBy,
      })
      .from(salesProductTypeCost)
      .leftJoin(salesProductType, eq(salesProductType.id, salesProductTypeCost.productTypeId))
      .leftJoin(salesCostMaster, eq(salesCostMaster.id, salesProductTypeCost.costId))
      .where(where)
      .orderBy(desc(salesProductTypeCost.sdate))
      .limit(input.limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(salesProductTypeCost)
      .leftJoin(salesProductType, eq(salesProductType.id, salesProductTypeCost.productTypeId))
      .leftJoin(salesCostMaster, eq(salesCostMaster.id, salesProductTypeCost.costId))
      .where(where),
  ]);

  return listProductCostMappingOutput.parse({
    rows: rows.map((r) => ({
      id: r.id,
      productTypeId: r.productTypeId,
      costId: r.costId,
      productTypeNm: r.productTypeNm ?? null,
      costNm: r.costNm ?? null,
      legacyProductTypeCd: r.legacyProductTypeCd ?? null,
      legacyCostCd: r.legacyCostCd ?? null,
      sdate: r.sdate,
      edate: r.edate ?? null,
      bizYn: r.bizYn,
      note: r.note ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      createdBy: r.createdBy ?? null,
      updatedBy: r.updatedBy ?? null,
    })),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveProductCostMapping — creates/updates/deletes batch transaction + audit.
// ---------------------------------------------------------------------------
export async function saveProductCostMapping(
  rawInput: z.input<typeof saveProductCostMappingInput>,
) {
  const ctx = await resolveSalesContext();
  if (!ctx.ok)
    return saveProductCostMappingOutput.parse({ ok: false, errors: [{ message: ctx.error }] });

  const input = saveProductCostMappingInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        // legacy_*_cd stamp from product/cost masters (audit hint, optional).
        const [pt] = await tx
          .select({ cd: salesProductType.productCd })
          .from(salesProductType)
          .where(
            and(
              eq(salesProductType.id, c.productTypeId),
              eq(salesProductType.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);
        const [cm] = await tx
          .select({ cd: salesCostMaster.costCd })
          .from(salesCostMaster)
          .where(
            and(
              eq(salesCostMaster.id, c.costId),
              eq(salesCostMaster.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1);

        await tx.insert(salesProductTypeCost).values({
          id: c.id,
          workspaceId: ctx.workspaceId,
          productTypeId: c.productTypeId,
          costId: c.costId,
          legacyProductTypeCd: c.legacyProductTypeCd ?? pt?.cd ?? null,
          legacyCostCd: c.legacyCostCd ?? cm?.cd ?? null,
          sdate: c.sdate,
          edate: c.edate ?? null,
          bizYn: c.bizYn,
          note: c.note ?? null,
          createdBy: ctx.userId,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.product_type_cost.create",
          resourceType: "sales_product_type_cost",
          resourceId: c.id,
          details: {
            productTypeId: c.productTypeId,
            costId: c.costId,
            sdate: c.sdate,
          } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // strip output-only / read-only join fields from patch.
        const {
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          createdBy: _createdBy,
          updatedBy: _updatedBy,
          id: _id,
          productTypeNm: _productTypeNm,
          costNm: _costNm,
          legacyProductTypeCd: _legacyProductTypeCd,
          legacyCostCd: _legacyCostCd,
          ...patch
        } = u.patch;
        await tx
          .update(salesProductTypeCost)
          .set({
            ...patch,
            updatedBy: ctx.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(salesProductTypeCost.id, u.id),
              eq(salesProductTypeCost.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "sales.product_type_cost.update",
          resourceType: "sales_product_type_cost",
          resourceId: u.id,
          details: patch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        const condemned = await tx
          .select({
            id: salesProductTypeCost.id,
            productTypeId: salesProductTypeCost.productTypeId,
            costId: salesProductTypeCost.costId,
            sdate: salesProductTypeCost.sdate,
          })
          .from(salesProductTypeCost)
          .where(
            and(
              eq(salesProductTypeCost.workspaceId, ctx.workspaceId),
              inArray(salesProductTypeCost.id, input.deletes),
            ),
          );

        await tx
          .delete(salesProductTypeCost)
          .where(
            and(
              eq(salesProductTypeCost.workspaceId, ctx.workspaceId),
              inArray(salesProductTypeCost.id, input.deletes),
            ),
          );

        const detailsById = new Map(condemned.map((r) => [r.id, r] as const));
        for (const id of input.deletes) {
          const row = detailsById.get(id);
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "sales.product_type_cost.delete",
            resourceType: "sales_product_type_cost",
            resourceId: id,
            details: row
              ? ({
                  productTypeId: row.productTypeId,
                  costId: row.costId,
                  sdate: row.sdate,
                } as Record<string, unknown>)
              : ({} as Record<string, unknown>),
            success: true,
          });
        }
        deleted.push(...input.deletes);
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveProductCostMappingOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
