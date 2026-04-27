// packages/ai/__tests__/ask.budget.integration.test.ts
// 실 DB를 사용하는 integration test. vitest.config.ts의 integration 프로젝트에서만 실행.
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@jarvis/db/client";
import { sql } from "drizzle-orm";
import { generateAnswer } from "../ask.js";

const WS = "00000000-0000-0000-0000-00000000abcd";

// TODO(Phase B3 follow-up): Integration test for generateAnswer() budget gate.
// After Phase B3, askAI calls askAgentStream, not generateAnswer.
// Budget gate is still tested via askAI() in ask-agent-integration.test.ts.
describe.skip("ask budget integration (legacy — skipped after Phase B3, needs real DB)", () => {
  beforeEach(async () => {
    process.env.LLM_DAILY_BUDGET_USD = "0.01";
    await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);
    // seed: 오늘 이미 $0.02 소비
    await db.execute(sql`
      INSERT INTO llm_call_log
        (workspace_id, model, input_tokens, output_tokens, cost_usd, duration_ms, status)
      VALUES
        (${WS}::uuid, 'gpt-5.4-mini', 100, 100, 0.02, 100, 'ok')
    `);
  });

  it("blocks ask when today's spent exceeds LLM_DAILY_BUDGET_USD", async () => {
    const events: string[] = [];
    for await (const ev of generateAnswer(
      "q",
      "<context/>",
      [],
      [],
      [],
      [],
      "gpt-5.4-mini",
      { workspaceId: WS, requestId: "req-it-1" },
    )) {
      events.push(ev.type);
      if (ev.type === "error") {
        expect(ev.message).toMatch(/budget/i);
      }
    }
    expect(events).toContain("error");
    const rows = await db.execute<{ status: string; blocked_by: string | null }>(sql`
      SELECT status, blocked_by
      FROM llm_call_log
      WHERE workspace_id = ${WS}::uuid
        AND request_id = 'req-it-1'
    `);
    expect(rows.rows[0]?.status).toBe("blocked_by_budget");
    expect(rows.rows[0]?.blocked_by).toBe("budget");
  });
});
