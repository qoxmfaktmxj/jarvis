import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jarvis/db/client";
import { sql } from "drizzle-orm";
import { generateEmbedding } from "../embed.js";
import { BudgetExceededError } from "../budget.js";

const WS = "00000000-0000-0000-0000-00000000beef";

describe("embed budget integration", () => {
  beforeEach(async () => {
    process.env.LLM_DAILY_BUDGET_USD = "0.01";
    await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);
    await db.execute(sql`
      INSERT INTO llm_call_log
        (workspace_id, model, tokens_in, tokens_out, cost_usd, latency_ms, status)
      VALUES
        (${WS}::uuid, 'text-embedding-3-small', 1000, 0, 0.02, 50, 'ok')
    `);
  });

  it("throws BudgetExceededError and records blocked_by=budget row", async () => {
    await expect(
      generateEmbedding("hello", { workspaceId: WS, requestId: "req-it-2" }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    const rows = await db.execute<{ status: string; blocked_by: string | null }>(sql`
      SELECT status, blocked_by
      FROM llm_call_log
      WHERE workspace_id = ${WS}::uuid
        AND request_id = 'req-it-2'
    `);
    expect(rows.rows[0]?.status).toBe("blocked_by_budget");
    expect(rows.rows[0]?.blocked_by).toBe("budget");
  });
});
