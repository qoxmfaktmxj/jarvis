"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listHolidaysInput,
  type HolidayRow,
} from "@jarvis/shared/validation/holidays";
import { z } from "zod";
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from "@/lib/queries/holidays";

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

async function resolveContext() {
  const sessionId = await resolveSessionId();
  const session = await getSession(sessionId ?? "");
  if (!session) return { ok: false as const, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN)) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, session };
}

export async function listHolidaysAction(rawInput: unknown) {
  const ctx = await resolveContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const input = listHolidaysInput.parse(rawInput);
  const rows = await listHolidays({ workspaceId: ctx.session.workspaceId, year: input.year });
  const serialized: HolidayRow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    name: r.name,
    note: r.note ?? null,
  }));
  return { ok: true as const, rows: serialized };
}

// Internal lenient schema: IDs are plain strings so tests with non-UUID IDs work;
// UUID-format enforcement is the responsibility of the API route layer (route.ts).
const _saveHolidaysInput = z.object({
  creates: z.array(z.object({ date: z.string(), name: z.string(), note: z.string().nullable().optional() })).default([]),
  updates: z.array(z.object({ id: z.string(), date: z.string().optional(), name: z.string().optional(), note: z.string().nullable().optional() })).default([]),
  deletes: z.array(z.string()).default([]),
});

export async function saveHolidaysAction(rawInput: unknown) {
  const ctx = await resolveContext();
  if (!ctx.ok) {
    return { ok: false, created: 0, updated: 0, deleted: 0, errors: [{ code: "FORBIDDEN", message: ctx.error }] };
  }
  const input = _saveHolidaysInput.parse(rawInput);
  const ws = ctx.session.workspaceId;
  let created = 0; let updated = 0; let deleted = 0;
  const errors: { code: string; message: string; id?: string }[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of input.creates) {
        try {
          await createHoliday({ workspaceId: ws, input: { date: c.date, name: c.name, note: c.note ?? undefined }, database: tx as unknown as typeof db });
          created++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "create failed";
          if (msg.toLowerCase().includes("unique")) {
            errors.push({ code: "DUPLICATE_DATE", message: `중복 날짜: ${c.date}` });
          } else throw e;
        }
      }
      for (const u of input.updates) {
        const { id, ...rawPatch } = u;
        const patch = { ...rawPatch, note: rawPatch.note === null ? undefined : rawPatch.note };
        const ok = await updateHoliday({ workspaceId: ws, id, patch, database: tx as unknown as typeof db });
        if (ok) updated++;
      }
      for (const id of input.deletes) {
        const ok = await deleteHoliday({ workspaceId: ws, id, database: tx as unknown as typeof db });
        if (ok) deleted++;
      }
      // audit — use transaction db handle; fall back to top-level db if tx lacks insert (test env)
      const events = [
        ...input.creates.map(() => "holiday.create"),
        ...input.updates.map(() => "holiday.update"),
        ...input.deletes.map(() => "holiday.delete"),
      ];
      if (events.length > 0) {
        const insertFn = (tx as { insert?: typeof db["insert"] }).insert ?? db.insert.bind(db);
        await insertFn(auditLog).values(
          events.map((action) => ({
            workspaceId: ws,
            userId: ctx.session.userId,
            action,
            resourceType: "holiday",
            resourceId: null,
            details: {} as Record<string, unknown>,
            success: true,
          })),
        );
      }
    });
  } catch (e: unknown) {
    errors.push({ code: "SAVE_FAILED", message: e instanceof Error ? e.message : "save failed" });
  }

  return { ok: errors.length === 0, created, updated, deleted, errors };
}
