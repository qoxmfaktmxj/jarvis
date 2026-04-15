import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface Row extends Record<string, unknown> {
  workspace_id: string;
  model: string;
  calls: string;
  total_cost: string;
  blocked: string;
}

async function fetchRows(): Promise<Row[]> {
  const res = await db.execute<Row>(sql`
    SELECT
      workspace_id::text AS workspace_id,
      model,
      COUNT(*)::text AS calls,
      COALESCE(SUM(cost_usd), 0)::text AS total_cost,
      SUM(CASE WHEN status = 'blocked_by_budget' THEN 1 ELSE 0 END)::text AS blocked
    FROM llm_call_log
    WHERE created_at >= now() - interval '7 days'
    GROUP BY workspace_id, model
    ORDER BY total_cost DESC
    LIMIT 200
  `);
  return res.rows;
}

export default async function LlmCostPage() {
  const rows = await fetchRows();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">LLM Cost — 최근 7일</h1>
      <p className="text-sm text-gray-500 mb-4">
        workspace × model 기준 집계. blocked = 예산 차단으로 기록된 호출 수.
      </p>
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left p-2">Workspace</th>
            <th className="text-left p-2">Model</th>
            <th className="text-right p-2">Calls</th>
            <th className="text-right p-2">Total (USD)</th>
            <th className="text-right p-2">Blocked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 font-mono text-xs">{r.workspace_id}</td>
              <td className="p-2">{r.model}</td>
              <td className="p-2 text-right">{r.calls}</td>
              <td className="p-2 text-right">${Number(r.total_cost).toFixed(4)}</td>
              <td className="p-2 text-right">{r.blocked}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="p-4 text-center text-gray-400" colSpan={5}>
                최근 7일 호출 기록이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
