import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PageHeader }     from '@/components/patterns/PageHeader';
import { DataTableShell } from '@/components/patterns/DataTableShell';
import { EmptyState }     from '@/components/patterns/EmptyState';

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
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · LLM Cost"
        title="LLM Cost — 최근 7일"
        description="workspace × model 기준 집계. blocked = 예산 차단으로 기록된 호출 수."
      />
      <DataTableShell
        rowCount={rows.length}
        empty={
          <EmptyState
            title="LLM cost"
            description="최근 7일 호출 기록이 없습니다."
          />
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Total (USD)</TableHead>
              <TableHead className="text-right">Blocked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{r.workspace_id}</TableCell>
                <TableCell>{r.model}</TableCell>
                <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                <TableCell className="text-right tabular-nums">${Number(r.total_cost).toFixed(4)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.blocked}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableShell>
    </div>
  );
}
