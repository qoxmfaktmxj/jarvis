import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { appUser, auditLog, db } from "@jarvis/db";

const inputSchema = z.object({
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  success: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(100),
});

const outputSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      resourceType: z.string(),
      resourceId: z.string().nullable(),
      details: z.record(z.string(), z.unknown()),
      success: z.boolean(),
      errorMessage: z.string().nullable(),
      actorEmail: z.string().email().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
  total: z.number().int().nonnegative(),
});

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function listAuditLogs(context: { workspaceId: string }, raw: unknown) {
  const input = inputSchema.parse(raw);
  const where = and(
    eq(auditLog.workspaceId, context.workspaceId),
    input.action ? eq(auditLog.action, input.action) : undefined,
    input.success === undefined ? undefined : eq(auditLog.success, input.success),
    input.q
      ? or(
          ilike(auditLog.action, `%${escapeLike(input.q)}%`),
          ilike(auditLog.resourceType, `%${escapeLike(input.q)}%`),
          ilike(appUser.email, `%${escapeLike(input.q)}%`),
        )
      : undefined,
  );
  const base = db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      details: auditLog.details,
      success: auditLog.success,
      errorMessage: auditLog.errorMessage,
      actorEmail: appUser.email,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(
      appUser,
      and(eq(appUser.workspaceId, context.workspaceId), eq(appUser.id, auditLog.userId)),
    )
    .where(where);
  const [rows, totals] = await Promise.all([
    base
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db
      .select({ total: count() })
      .from(auditLog)
      .leftJoin(
        appUser,
        and(eq(appUser.workspaceId, context.workspaceId), eq(appUser.id, auditLog.userId)),
      )
      .where(where),
  ]);
  return outputSchema.parse({
    rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total: Number(totals[0]?.total ?? 0),
  });
}
