import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import type { OpType } from '@jarvis/shared/constants';
import { logLlmCall } from './logger.js';

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

/**
 * Workspace별 오늘 LLM 지출을 집계해 `LLM_DAILY_BUDGET_USD` 초과 시 throw.
 *
 * 집계 범위: workspace + `created_at >= date_trunc('day', now())` + status='ok'.
 * op 필터는 하지 않으므로 wiki.* 오퍼레이션(ingest/query/lint/save-as-page)도
 * 자동으로 동일 예산에 합산된다. Phase-W4 이전에는 op별 별도 예산 분리를 하지 않는다
 * (YAGNI — WIKI-AGENTS §8 `LLM_DAILY_BUDGET_USD` 정의와 일치).
 */
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

export async function recordBlocked(
  workspaceId: string,
  model: string,
  requestId?: string | null,
  op?: OpType,
): Promise<void> {
  await logLlmCall({
    op,
    workspaceId,
    requestId: requestId ?? null,
    model,
    promptVersion: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: '0',
    durationMs: 0,
    status: 'blocked_by_budget',
    blockedBy: 'budget',
    errorCode: null,
  });
}
