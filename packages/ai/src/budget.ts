import { and, eq, gte, sql } from "drizzle-orm";
import type { BudgetTracker } from "./types.js";

export function createBudgetTracker(
  database: typeof import("@jarvis/db").db,
  limits: { dailyUsd: string },
): BudgetTracker {
  const dailyUsd = Number(limits.dailyUsd);
  if (!Number.isFinite(dailyUsd) || dailyUsd <= 0) {
    throw new Error("daily budget must be a positive finite number");
  }

  return {
    async reserve(input) {
      const { llmCallLog } = await import("@jarvis/db/schema");
      const startOfDay = new Date(new Date().toISOString().slice(0, 10));
      const [row] = await database
        .select({ total: sql<string>`coalesce(sum(${llmCallLog.costUsd}), 0)` })
        .from(llmCallLog)
        .where(and(
          eq(llmCallLog.workspaceId, input.workspaceId),
          gte(llmCallLog.createdAt, startOfDay),
        ));
      const total = Number(row?.total ?? 0);
      if (!Number.isFinite(total) || total < 0) {
        throw new Error("BUDGET_USAGE_INVALID");
      }
      if (total >= dailyUsd) {
        throw new Error("BUDGET_EXCEEDED");
      }
    },
    async finalize(input) {
      const { llmCallLog } = await import("@jarvis/db/schema");
      await database
        .insert(llmCallLog)
        .values({
          callId: input.callId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          provider: input.provider,
          model: input.model,
          purpose: "ask",
          promptTokens: input.usage.promptTokens,
          completionTokens: input.usage.completionTokens,
          costUsd: input.usage.costUsd,
          latencyMs: input.latencyMs,
          success: input.success,
          errorCode: input.errorCode,
        })
        .onConflictDoNothing({ target: llmCallLog.callId });
    },
  };
}
