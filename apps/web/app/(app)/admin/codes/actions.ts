"use server";
/**
 * apps/web/app/(app)/admin/codes/actions.ts
 *
 * 공통코드관리(/admin/codes) server actions — 그룹코드 + 세부코드.
 *
 * 권한: ADMIN_ALL (legacy /api/admin/codes/route.ts와 동일).
 * 감사:
 *   admin.code_group.{create,update,delete}
 *   admin.code_item.{create,update,delete}
 *
 * 패턴 출처: apps/web/app/(app)/admin/infra/licenses/actions.ts (P1.5 Task 5).
 *
 * NOTE: code_group/code_item 스키마는 created_at/updated_at/created_by/updated_by
 * audit 컬럼이 아직 없다. 이번 dispatch에서는 audit_log 테이블에만 기록하고
 * row-level audit columns 추가는 Phase-2 follow-up으로 둔다.
 */
import { cookies, headers } from "next/headers";
import { and, asc, count, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, codeGroup, codeItem } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  codeGroupRow,
  codeItemRow,
  listCodeGroupsInput,
  listCodeGroupsOutput,
  listCodeItemsInput,
  listCodeItemsOutput,
  saveCodeGroupsInput,
  saveCodeGroupsOutput,
  saveCodeItemsInput,
  saveCodeItemsOutput,
  type CodeGroupRow,
  type CodeItemRow,
} from "@jarvis/shared/validation/admin/code";
import type { z } from "zod";

// ---------------------------------------------------------------------------
// Session helpers (mirror admin/infra/licenses/actions.ts)
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

async function resolveAdminContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return {
    ok: true as const,
    userId: session.userId,
    workspaceId: session.workspaceId,
  };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------
function serializeGroup(
  r: typeof codeGroup.$inferSelect & { subCnt?: number | null },
): CodeGroupRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    nameEn: r.nameEn ?? null,
    description: r.description ?? null,
    businessDivCode: r.businessDivCode ?? null,
    kindCode: r.kindCode,
    commonYn: r.commonYn,
    isActive: r.isActive,
    subCnt: Number(r.subCnt ?? 0),
  };
}

function serializeItem(r: typeof codeItem.$inferSelect): CodeItemRow {
  return {
    id: r.id,
    groupId: r.groupId,
    code: r.code,
    name: r.name,
    nameEn: r.nameEn ?? null,
    fullName: r.fullName ?? null,
    memo: r.memo ?? null,
    note1: r.note1 ?? null,
    note2: r.note2 ?? null,
    note3: r.note3 ?? null,
    note4: r.note4 ?? null,
    note5: r.note5 ?? null,
    note6: r.note6 ?? null,
    note7: r.note7 ?? null,
    note8: r.note8 ?? null,
    note9: r.note9 ?? null,
    numNote: r.numNote ?? null,
    sdate: r.sdate,
    edate: r.edate,
    visualYn: r.visualYn,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  };
}

// ---------------------------------------------------------------------------
// listCodeGroups
// ---------------------------------------------------------------------------
export async function listCodeGroups(
  rawInput: z.input<typeof listCodeGroupsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listCodeGroupsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  // EXISTS subquery: code_item.name이 q 혹은 qName과 부분일치하는 row가 있는 그룹.
  // legacy '포함세부코드명' 토글이 켜졌을 때, q (그룹코드) 또는 qName (그룹코드명)
  // 어느 쪽이 채워져 있어도 세부코드명 매칭에 그 substring을 활용한다.
  const detailNeedle =
    input.includesDetailCodeNm ? (input.qName ?? input.q ?? "") : "";
  const detailMatch =
    detailNeedle.length > 0
      ? exists(
          db
            .select({ one: sql`1` })
            .from(codeItem)
            .where(
              and(
                eq(codeItem.groupId, codeGroup.id),
                ilike(codeItem.name, `%${detailNeedle}%`),
              ),
            ),
        )
      : undefined;

  // q matches code/description; qName matches name; each independent (AND).
  const qFilter = input.q
    ? or(
        ilike(codeGroup.code, `%${input.q}%`),
        ilike(codeGroup.description, `%${input.q}%`),
      )
    : undefined;
  const qNameFilter = input.qName
    ? ilike(codeGroup.name, `%${input.qName}%`)
    : undefined;

  const baseFilters = and(
    eq(codeGroup.workspaceId, ctx.workspaceId),
    input.kind ? eq(codeGroup.kindCode, input.kind) : undefined,
    input.businessDivCode
      ? eq(codeGroup.businessDivCode, input.businessDivCode)
      : undefined,
    qFilter,
    qNameFilter,
    detailMatch,
  );

  // subCnt: correlated subquery
  const subCntExpr = sql<number>`(SELECT COUNT(*)::int FROM ${codeItem} WHERE ${codeItem.groupId} = ${codeGroup.id})`;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: codeGroup.id,
        workspaceId: codeGroup.workspaceId,
        code: codeGroup.code,
        name: codeGroup.name,
        nameEn: codeGroup.nameEn,
        description: codeGroup.description,
        businessDivCode: codeGroup.businessDivCode,
        kindCode: codeGroup.kindCode,
        commonYn: codeGroup.commonYn,
        isActive: codeGroup.isActive,
        subCnt: subCntExpr,
      })
      .from(codeGroup)
      .where(baseFilters)
      .orderBy(asc(codeGroup.code))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(codeGroup).where(baseFilters),
  ]);

  return listCodeGroupsOutput.parse({
    rows: rows.map((r) =>
      serializeGroup(r as typeof codeGroup.$inferSelect & { subCnt: number }),
    ),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveCodeGroups
// ---------------------------------------------------------------------------
export async function saveCodeGroups(
  rawInput: z.input<typeof saveCodeGroupsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveCodeGroupsOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveCodeGroupsInput.parse(rawInput);
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        await tx.insert(codeGroup).values({
          id: c.id,
          workspaceId: ctx.workspaceId,
          code: c.code,
          name: c.name,
          nameEn: c.nameEn ?? null,
          description: c.description ?? null,
          businessDivCode: c.businessDivCode ?? null,
          kindCode: c.kindCode,
          commonYn: c.commonYn,
          isActive: c.isActive,
        });
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "admin.code_group.create",
          resourceType: "code_group",
          resourceId: c.id,
          details: {
            code: c.code,
            name: c.name,
            kindCode: c.kindCode,
          } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // strip identity field
        const { id: _id, ...patch } = u.patch;
        await tx
          .update(codeGroup)
          .set(patch)
          .where(
            and(
              eq(codeGroup.id, u.id),
              eq(codeGroup.workspaceId, ctx.workspaceId),
            ),
          );
        await tx.insert(auditLog).values({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "admin.code_group.update",
          resourceType: "code_group",
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
            id: codeGroup.id,
            code: codeGroup.code,
            name: codeGroup.name,
          })
          .from(codeGroup)
          .where(
            and(
              eq(codeGroup.workspaceId, ctx.workspaceId),
              inArray(codeGroup.id, input.deletes),
            ),
          );

        await tx
          .delete(codeGroup)
          .where(
            and(
              eq(codeGroup.workspaceId, ctx.workspaceId),
              inArray(codeGroup.id, input.deletes),
            ),
          );

        const detailsById = new Map(condemned.map((r) => [r.id, r] as const));
        for (const id of input.deletes) {
          const row = detailsById.get(id);
          await tx.insert(auditLog).values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            action: "admin.code_group.delete",
            resourceType: "code_group",
            resourceId: id,
            details: row
              ? ({ code: row.code, name: row.name } as Record<string, unknown>)
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

  return saveCodeGroupsOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ---------------------------------------------------------------------------
// listCodeItems
// ---------------------------------------------------------------------------
export async function listCodeItems(
  rawInput: z.input<typeof listCodeItemsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listCodeItemsInput.parse(rawInput);
  const offset = (input.page - 1) * input.limit;

  // 그룹이 워크스페이스 소속인지 확인 (cross-workspace guard)
  const [owner] = await db
    .select({ id: codeGroup.id })
    .from(codeGroup)
    .where(
      and(
        eq(codeGroup.id, input.groupId),
        eq(codeGroup.workspaceId, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!owner) return { ok: false as const, error: "Not found", rows: [], total: 0 };

  const where = and(
    eq(codeItem.groupId, input.groupId),
    input.useYn ? eq(codeItem.isActive, input.useYn === "Y") : undefined,
    input.q
      ? or(
          ilike(codeItem.code, `%${input.q}%`),
          ilike(codeItem.name, `%${input.q}%`),
          ilike(codeItem.note1, `%${input.q}%`),
          ilike(codeItem.note2, `%${input.q}%`),
          ilike(codeItem.note3, `%${input.q}%`),
          ilike(codeItem.note4, `%${input.q}%`),
          ilike(codeItem.note5, `%${input.q}%`),
          ilike(codeItem.note6, `%${input.q}%`),
          ilike(codeItem.note7, `%${input.q}%`),
          ilike(codeItem.note8, `%${input.q}%`),
          ilike(codeItem.note9, `%${input.q}%`),
        )
      : undefined,
  );

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(codeItem)
      .where(where)
      .orderBy(asc(codeItem.sortOrder), asc(codeItem.code))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(codeItem).where(where),
  ]);

  return listCodeItemsOutput.parse({
    rows: rows.map(serializeItem),
    total: Number(totalRows[0]?.total ?? 0),
  });
}

// ---------------------------------------------------------------------------
// saveCodeItems
// ---------------------------------------------------------------------------
export async function saveCodeItems(
  rawInput: z.input<typeof saveCodeItemsInput>,
) {
  const ctx = await resolveAdminContext();
  if (!ctx.ok)
    return saveCodeItemsOutput.parse({
      ok: false,
      errors: [{ message: ctx.error }],
    });

  const input = saveCodeItemsInput.parse(rawInput);
  const workspaceId = ctx.workspaceId;
  const userId = ctx.userId;
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  const errors: { id?: string; message: string }[] = [];

  // Cross-workspace guard helper — verify a groupId belongs to workspaceId.
  // Pattern from app/api/admin/codes/route.ts:64-69.
  async function verifyGroupOwnership(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    groupId: string,
  ): Promise<boolean> {
    const [g] = await tx
      .select({ id: codeGroup.id })
      .from(codeGroup)
      .where(
        and(
          eq(codeGroup.id, groupId),
          eq(codeGroup.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return Boolean(g);
  }

  try {
    await db.transaction(async (tx) => {
      // ---- CREATE ----
      for (const c of input.creates) {
        if (!(await verifyGroupOwnership(tx, c.groupId))) {
          errors.push({ id: c.id, message: "그룹코드가 워크스페이스에 존재하지 않습니다" });
          continue;
        }
        await tx.insert(codeItem).values({
          id: c.id,
          groupId: c.groupId,
          code: c.code,
          name: c.name,
          nameEn: c.nameEn ?? null,
          fullName: c.fullName ?? null,
          memo: c.memo ?? null,
          note1: c.note1 ?? null,
          note2: c.note2 ?? null,
          note3: c.note3 ?? null,
          note4: c.note4 ?? null,
          note5: c.note5 ?? null,
          note6: c.note6 ?? null,
          note7: c.note7 ?? null,
          note8: c.note8 ?? null,
          note9: c.note9 ?? null,
          numNote: c.numNote ?? null,
          sdate: c.sdate,
          edate: c.edate,
          visualYn: c.visualYn,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
        });
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.code_item.create",
          resourceType: "code_item",
          resourceId: c.id,
          details: {
            groupId: c.groupId,
            code: c.code,
            name: c.name,
          } as Record<string, unknown>,
          success: true,
        });
        created.push(c.id);
      }

      // ---- UPDATE ----
      for (const u of input.updates) {
        // verify the existing row belongs to ctx.workspaceId via its current groupId
        const [existing] = await tx
          .select({ id: codeItem.id, groupId: codeItem.groupId })
          .from(codeItem)
          .where(eq(codeItem.id, u.id))
          .limit(1);
        if (!existing || !(await verifyGroupOwnership(tx, existing.groupId))) {
          errors.push({ id: u.id, message: "수정 대상이 워크스페이스에 존재하지 않습니다" });
          continue;
        }
        // if patch.groupId is provided, also verify that target group belongs to workspace
        if (u.patch.groupId && u.patch.groupId !== existing.groupId) {
          if (!(await verifyGroupOwnership(tx, u.patch.groupId))) {
            errors.push({ id: u.id, message: "이동 대상 그룹이 워크스페이스에 존재하지 않습니다" });
            continue;
          }
        }
        const { id: _id, ...patch } = u.patch;
        await tx.update(codeItem).set(patch).where(eq(codeItem.id, u.id));
        await tx.insert(auditLog).values({
          workspaceId,
          userId,
          action: "admin.code_item.update",
          resourceType: "code_item",
          resourceId: u.id,
          details: patch as Record<string, unknown>,
          success: true,
        });
        updated.push(u.id);
      }

      // ---- DELETE ----
      if (input.deletes.length > 0) {
        // capture rows + verify ownership in a single query (join on codeGroup workspace_id)
        const condemned = await tx
          .select({
            id: codeItem.id,
            groupId: codeItem.groupId,
            code: codeItem.code,
            name: codeItem.name,
            workspaceId: codeGroup.workspaceId,
          })
          .from(codeItem)
          .innerJoin(codeGroup, eq(codeItem.groupId, codeGroup.id))
          .where(inArray(codeItem.id, input.deletes));

        const allowed = condemned.filter((r) => r.workspaceId === workspaceId);
        const allowedIds = allowed.map((r) => r.id);
        const denied = input.deletes.filter((id) => !allowedIds.includes(id));
        for (const id of denied) {
          errors.push({ id, message: "삭제 대상이 워크스페이스에 존재하지 않습니다" });
        }

        if (allowedIds.length > 0) {
          await tx
            .delete(codeItem)
            .where(inArray(codeItem.id, allowedIds));

          for (const row of allowed) {
            await tx.insert(auditLog).values({
              workspaceId,
              userId,
              action: "admin.code_item.delete",
              resourceType: "code_item",
              resourceId: row.id,
              details: {
                groupId: row.groupId,
                code: row.code,
                name: row.name,
              } as Record<string, unknown>,
              success: true,
            });
          }
          deleted.push(...allowedIds);
        }
      }
    });
  } catch (e: unknown) {
    errors.push({ message: e instanceof Error ? e.message : "save failed" });
  }

  return saveCodeItemsOutput.parse({
    ok: errors.length === 0,
    created,
    updated,
    deleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// expose row schemas for client consumers if useful
export { codeGroupRow, codeItemRow };
