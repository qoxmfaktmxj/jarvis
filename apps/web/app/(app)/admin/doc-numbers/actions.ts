"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, documentNumber } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  buildDocNo,
  listDocumentNumbersInput,
  saveDocumentNumbersInput,
  type DocumentNumberRow,
  type SaveDocumentNumbersOutput,
} from "@jarvis/shared/validation/document-number";
import { and, eq } from "drizzle-orm";
import {
  listAvailableYears,
  listDocumentNumbers,
  nextSeq,
  type DocNumberRow,
} from "@/lib/queries/document-number";

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

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

async function resolveContext(required: Permission) {
  const sessionId = await resolveSessionId();
  const session = await getSession(sessionId ?? "");
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, required) && !hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, session };
}

function toClientRow(r: DocNumberRow): DocumentNumberRow {
  return {
    id: r.id,
    year: r.year,
    seq: r.seq,
    docNo: r.docNo,
    docName: r.docName,
    userId: r.userId,
    userName: r.userName,
    userEmployeeId: r.userEmployeeId,
    docDate: r.docDate,
    note: r.note,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  };
}

export async function listDocumentNumbersAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.DOC_NUM_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listDocumentNumbersInput.parse(rawInput);
  const result = await listDocumentNumbers({
    workspaceId: ctx.session.workspaceId,
    q: input.q,
    year: input.year,
    page: input.page,
    limit: input.limit,
  });

  return {
    ok: true as const,
    rows: result.data.map(toClientRow),
    total: result.pagination.total,
  };
}

export async function listDocumentYearsAction() {
  const ctx = await resolveContext(PERMISSIONS.DOC_NUM_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, years: [] };

  const years = await listAvailableYears({ workspaceId: ctx.session.workspaceId });
  return { ok: true as const, years };
}

export async function saveDocumentNumbersAction(
  rawInput: unknown,
): Promise<SaveDocumentNumbersOutput> {
  const ctx = await resolveContext(PERMISSIONS.DOC_NUM_WRITE);
  if (!ctx.ok) {
    return { ok: false, inserted: 0, updated: 0, deleted: 0, error: ctx.error };
  }

  let parsed;
  try {
    parsed = saveDocumentNumbersInput.parse(rawInput);
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: e instanceof Error ? e.message : "validation failed",
    };
  }

  // delete 시 ADMIN 권한 별도 검사
  if (parsed.deletes.length > 0) {
    const adminCtx = await resolveContext(PERMISSIONS.DOC_NUM_ADMIN);
    if (!adminCtx.ok) {
      return {
        ok: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        error: "Forbidden: delete requires DOC_NUM_ADMIN",
      };
    }
  }

  const ws = ctx.session.workspaceId;
  const actorUserId = ctx.session.userId;
  const actorIdent = ctx.session.employeeId ?? null;
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  try {
    await db.transaction(async (tx) => {
      const auditEntries: Array<{
        action: string;
        resourceId: string;
        details: Record<string, unknown>;
      }> = [];

      for (const c of parsed.creates) {
        // 같은 (ws, year) 내에서 max(seq)+1 (트랜잭션 내 — Postgres는
        // unique constraint 와 결합 시 race 발생 가능. 충돌 시 retry 또는
        // unique 위반으로 표면화.)
        const seq = await nextSeq({
          workspaceId: ws,
          year: c.year,
          database: tx as unknown as typeof db,
        });
        const docNo = buildDocNo(c.year, seq);
        const [created] = await tx
          .insert(documentNumber)
          .values({
            workspaceId: ws,
            year: c.year,
            seq,
            docNo,
            docName: c.docName,
            userId: c.userId,
            docDate: c.docDate,
            note: c.note,
            updatedBy: actorIdent,
          })
          .returning({ id: documentNumber.id });
        if (created) {
          inserted++;
          auditEntries.push({
            action: "doc-num.create",
            resourceId: created.id,
            details: { year: c.year, seq, docNo, docName: c.docName },
          });
        }
      }

      for (const u of parsed.updates) {
        const values: Record<string, unknown> = {
          updatedAt: new Date(),
          updatedBy: actorIdent,
        };
        if (u.docName !== undefined) values.docName = u.docName;
        if (u.userId !== undefined) values.userId = u.userId;
        if (u.docDate !== undefined) values.docDate = u.docDate;
        if (u.note !== undefined) values.note = u.note;

        const [updatedRow] = await tx
          .update(documentNumber)
          .set(values)
          .where(
            and(
              eq(documentNumber.id, u.id),
              eq(documentNumber.workspaceId, ws),
            ),
          )
          .returning({ id: documentNumber.id });
        if (updatedRow) {
          updated++;
          auditEntries.push({
            action: "doc-num.update",
            resourceId: updatedRow.id,
            details: { patch: u },
          });
        }
      }

      for (const id of parsed.deletes) {
        const [deletedRow] = await tx
          .delete(documentNumber)
          .where(
            and(
              eq(documentNumber.id, id),
              eq(documentNumber.workspaceId, ws),
            ),
          )
          .returning({ id: documentNumber.id });
        if (deletedRow) {
          deleted++;
          auditEntries.push({
            action: "doc-num.delete",
            resourceId: deletedRow.id,
            details: {},
          });
        }
      }

      if (auditEntries.length > 0) {
        await tx.insert(auditLog).values(
          auditEntries.map(({ action, resourceId, details }) => ({
            workspaceId: ws,
            userId: actorUserId,
            action,
            resourceType: "document_number",
            resourceId,
            details,
            success: true,
          })),
        );
      }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "save failed";
    let code = "SAVE_FAILED";
    if (message.toLowerCase().includes("unique")) code = "DUPLICATE";
    return {
      ok: false,
      inserted,
      updated,
      deleted,
      error: `${code}: ${message}`,
    };
  }

  return { ok: true, inserted, updated, deleted };
}
