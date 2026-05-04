"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog, faqEntry } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listFaqInput,
  saveFaqInput,
  type FaqEntryRow,
  type SaveFaqOutput,
} from "@jarvis/shared/validation/faq";
import { and, eq } from "drizzle-orm";
import { listFaq, nextFaqSeq, type FaqRow } from "@/lib/queries/faq";

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

function toClientRow(r: FaqRow): FaqEntryRow {
  return {
    id: r.id,
    seq: r.seq,
    bizCode: r.bizCode,
    question: r.question,
    answer: r.answer,
    fileSeq: r.fileSeq,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  };
}

export async function listFaqAction(rawInput: unknown) {
  const ctx = await resolveContext(PERMISSIONS.FAQ_READ);
  if (!ctx.ok) return { ok: false as const, error: ctx.error, rows: [], total: 0 };

  const input = listFaqInput.parse(rawInput);
  const result = await listFaq({
    workspaceId: ctx.session.workspaceId,
    q: input.q,
    bizCode: input.bizCode,
    page: input.page,
    limit: input.limit,
  });
  return {
    ok: true as const,
    rows: result.data.map(toClientRow),
    total: result.pagination.total,
  };
}

export async function saveFaqAction(rawInput: unknown): Promise<SaveFaqOutput> {
  const ctx = await resolveContext(PERMISSIONS.FAQ_WRITE);
  if (!ctx.ok) {
    return { ok: false, inserted: 0, updated: 0, deleted: 0, error: ctx.error };
  }

  let parsed;
  try {
    parsed = saveFaqInput.parse(rawInput);
  } catch (e) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: e instanceof Error ? e.message : "validation failed",
    };
  }

  if (parsed.deletes.length > 0) {
    const adminCtx = await resolveContext(PERMISSIONS.FAQ_ADMIN);
    if (!adminCtx.ok) {
      return {
        ok: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        error: "Forbidden: delete requires FAQ_ADMIN",
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
        const seq = await nextFaqSeq({
          workspaceId: ws,
          database: tx as unknown as typeof db,
        });
        const [created] = await tx
          .insert(faqEntry)
          .values({
            workspaceId: ws,
            seq,
            bizCode: c.bizCode,
            question: c.question,
            answer: c.answer,
            fileSeq: c.fileSeq,
            updatedBy: actorIdent,
          })
          .returning({ id: faqEntry.id });
        if (created) {
          inserted++;
          auditEntries.push({
            action: "faq.create",
            resourceId: created.id,
            details: { seq, bizCode: c.bizCode, question: c.question.slice(0, 80) },
          });
        }
      }

      for (const u of parsed.updates) {
        const values: Record<string, unknown> = {
          updatedAt: new Date(),
          updatedBy: actorIdent,
        };
        if (u.bizCode !== undefined) values.bizCode = u.bizCode;
        if (u.question !== undefined) values.question = u.question;
        if (u.answer !== undefined) values.answer = u.answer;
        if (u.fileSeq !== undefined) values.fileSeq = u.fileSeq;

        const [updatedRow] = await tx
          .update(faqEntry)
          .set(values)
          .where(and(eq(faqEntry.id, u.id), eq(faqEntry.workspaceId, ws)))
          .returning({ id: faqEntry.id });
        if (updatedRow) {
          updated++;
          auditEntries.push({
            action: "faq.update",
            resourceId: updatedRow.id,
            details: { patch: u },
          });
        }
      }

      for (const id of parsed.deletes) {
        const [deletedRow] = await tx
          .delete(faqEntry)
          .where(and(eq(faqEntry.id, id), eq(faqEntry.workspaceId, ws)))
          .returning({ id: faqEntry.id });
        if (deletedRow) {
          deleted++;
          auditEntries.push({
            action: "faq.delete",
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
            resourceType: "faq_entry",
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
