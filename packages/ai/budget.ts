import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';

export class BudgetExceededError extends Error {
  constructor(public workspaceId: string, public spent: number, public limit: number) {
    super(
      `LLM daily budget exceeded for workspace ${workspaceId}: $${spent.toFixed(
        4,
      )} >= $${limit.toFixed(2)}`,
    );
    this.name = 'BudgetExceededError';
  }
}

function dailyLimitUsd(): number {
  const raw = process.env['LLM_DAILY_BUDGET_USD'];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

export async function assertBudget(workspaceId: string): Promise<void> {
  const limit = dailyLimitUsd();
  const result = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(cost_usd), 0)::text AS total
    FROM llm_call_log
    WHERE workspace_id = ${workspaceId}::uuid
      AND status = 'ok'
      AND created_at >= date_trunc('day', now())
  `);
  const spent = Number(result.rows[0]?.total ?? '0');
  if (spent >= limit) {
    throw new BudgetExceededError(workspaceId, spent, limit);
  }
}

export async function recordBlocked(workspaceId: string, reason: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO llm_call_log
      (workspace_id, model, status, blocked_by, error_message)
    VALUES
      (${workspaceId}::uuid, 'unknown', 'blocked_by_budget', ${reason}, ${reason})
  `);
}
