import { and, count, desc, eq } from "drizzle-orm";
import { db, llmCallLog } from "@jarvis/db";
import { z } from "zod";

const inputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(100),
});

export async function listLlmUsage(context: { workspaceId: string }, raw: unknown) {
  const input = inputSchema.parse(raw);
  const where = and(eq(llmCallLog.workspaceId, context.workspaceId));
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: llmCallLog.id,
        createdAt: llmCallLog.createdAt,
        route: llmCallLog.purpose,
        model: llmCallLog.model,
        promptTokens: llmCallLog.promptTokens,
        completionTokens: llmCallLog.completionTokens,
        costUsd: llmCallLog.costUsd,
      })
      .from(llmCallLog)
      .where(where)
      .orderBy(desc(llmCallLog.createdAt))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ total: count() }).from(llmCallLog).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      route: row.route,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.promptTokens + row.completionTokens,
      costUsd: Number(row.costUsd),
    })),
    total: Number(totals[0]?.total ?? 0),
  };
}
