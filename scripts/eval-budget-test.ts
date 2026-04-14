// scripts/eval-budget-test.ts
// G1 harness: 인위적 예산 초과로 차단 동작 검증.
// 사용: pnpm eval:budget-test
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateAnswer } from '@jarvis/ai/ask';

process.env.LLM_DAILY_BUDGET_USD = '0.01';
const WS = process.env['EVAL_WORKSPACE_ID'] ?? '00000000-0000-0000-0000-0000000000ee';

async function drain(gen: AsyncGenerator<{ type: string; message?: string }>) {
  const events: string[] = [];
  for await (const ev of gen) {
    events.push(ev.type);
  }
  return events;
}

async function main() {
  await db.execute(sql`DELETE FROM llm_call_log WHERE workspace_id = ${WS}::uuid`);

  // 1회차: 예산 아직 0, 통과 가능
  // (ASK_MODEL 단가 * 소폭 토큰 = $0.01 미만이어야 1회는 통과)
  // 이후 호출은 누적 cost_usd로 차단돼야 한다.
  let blocked = 0;
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const events = await drain(
      generateAnswer('ping?', '<context/>', [], [], [], [], 'simple', {
        workspaceId: WS,
        requestId: `eval-${i}`,
      }) as AsyncGenerator<{ type: string; message?: string }>,
    );
    if (events.includes('error')) blocked++;
    else ok++;
  }

  const rows = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*)::text AS count
    FROM llm_call_log
    WHERE workspace_id = ${WS}::uuid
    GROUP BY status
  `);

  console.log('eval-budget-test summary:', { ok, blocked, rows: rows.rows });

  const blockedRows = rows.rows.find((r) => r.status === 'blocked_by_budget');
  if (!blockedRows || Number(blockedRows.count) < 1) {
    console.error('FAIL: no blocked_by_budget rows recorded');
    process.exit(1);
  }
  if (blocked < 1) {
    console.error('FAIL: expected at least 1 blocked call');
    process.exit(1);
  }
  console.log('PASS: G1 — kill-switch triggered and rows recorded');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
