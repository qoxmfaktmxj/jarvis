import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import type {
  StatsRow,
  StatsCombinedRow,
  StatsInput,
} from '@jarvis/shared/validation/service-desk';

export async function getStatsByGroupingSet(
  input: StatsInput & { workspaceId: string },
): Promise<{
  byCompany: StatsRow[];
  byManager: StatsRow[];
}> {
  const { workspaceId, yyyymmFrom, yyyymmTo, categories, cntRatio } = input;

  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH base AS (
      SELECT request_company_nm, manager_nm,
             COUNT(1)::int AS cnt,
             COALESCE(SUM(NULLIF(work_time, '')::numeric), 0) AS work_time
      FROM service_desk_incident
      WHERE workspace_id = ${workspaceId}
        AND yyyy || mm BETWEEN ${yyyymmFrom} AND ${yyyymmTo}
        AND status_cd IN ('2','3','4','9')
        AND higher_cd = ANY(${categories}::text[])
      GROUP BY GROUPING SETS ((request_company_nm), (manager_nm))
    ),
    ranked AS (
      SELECT *,
        RANK() OVER (
          PARTITION BY (request_company_nm IS NOT NULL, manager_nm IS NOT NULL)
          ORDER BY work_time DESC
        ) AS ranking_time,
        RANK() OVER (
          PARTITION BY (request_company_nm IS NOT NULL, manager_nm IS NOT NULL)
          ORDER BY cnt DESC
        ) AS ranking_cnt
      FROM base
    )
    SELECT
      CASE WHEN request_company_nm IS NOT NULL THEN 'company' ELSE 'manager' END AS bucket,
      COALESCE(request_company_nm, manager_nm) AS label,
      cnt::int AS cnt,
      work_time::float AS work_time,
      ranking_time::int AS ranking_time,
      ranking_cnt::int AS ranking_cnt,
      RANK() OVER (
        PARTITION BY (request_company_nm IS NOT NULL, manager_nm IS NOT NULL)
        ORDER BY (ranking_time * (1 - ${cntRatio} / 100.0) + ranking_cnt * (${cntRatio} / 100.0)) ASC
      ) AS final_rank
    FROM ranked
    ORDER BY bucket, final_rank
  `);

  const byCompany: StatsRow[] = [];
  const byManager: StatsRow[] = [];
  for (const r of rows.rows) {
    const row: StatsRow = {
      label: String(r.label ?? ''),
      cnt: Number(r.cnt ?? 0),
      workTime: Number(r.work_time ?? 0),
      rankingTime: Number(r.ranking_time ?? 0),
      rankingCnt: Number(r.ranking_cnt ?? 0),
      finalRank: Number(r.final_rank ?? 0),
    };
    if (r.bucket === 'company') byCompany.push(row);
    else byManager.push(row);
  }
  return { byCompany, byManager };
}

export async function getStatsCombined(
  input: StatsInput & { workspaceId: string },
): Promise<StatsCombinedRow[]> {
  const { workspaceId, yyyymmFrom, yyyymmTo, categories, cntRatio } = input;

  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH t AS (
      SELECT
        manager_nm,
        request_company_nm,
        COUNT(1)::int AS cnt,
        COALESCE(SUM(NULLIF(work_time, '')::numeric), 0) AS work_time
      FROM service_desk_incident
      WHERE workspace_id = ${workspaceId}
        AND yyyy || mm BETWEEN ${yyyymmFrom} AND ${yyyymmTo}
        AND status_cd IN ('2','3','4','9')
        AND higher_cd = ANY(${categories}::text[])
      GROUP BY ROLLUP(manager_nm, request_company_nm)
    ),
    manager_total AS (
      SELECT manager_nm, SUM(cnt)::int AS cnt, SUM(work_time)::float AS work_time
      FROM t WHERE request_company_nm IS NULL AND manager_nm IS NOT NULL
      GROUP BY manager_nm
    ),
    ranked AS (
      SELECT manager_nm,
        RANK() OVER (ORDER BY (work_time * (1 - ${cntRatio} / 100.0) + cnt * (${cntRatio} / 100.0)) DESC) AS final_rank
      FROM manager_total
    )
    SELECT
      t.manager_nm,
      t.request_company_nm,
      t.cnt::int AS cnt,
      t.work_time::float AS work_time,
      (t.work_time * (1 - ${cntRatio} / 100.0) + t.cnt * (${cntRatio} / 100.0))::float AS total,
      r.final_rank::int AS final_rank
    FROM t
    LEFT JOIN ranked r ON r.manager_nm = t.manager_nm
    WHERE t.manager_nm IS NOT NULL
    ORDER BY r.final_rank, t.manager_nm, t.request_company_nm NULLS LAST
  `);

  return rows.rows.map((r) => ({
    managerNm: r.manager_nm as string | null,
    requestCompanyNm: r.request_company_nm as string | null,
    cnt: Number(r.cnt ?? 0),
    workTime: Number(r.work_time ?? 0),
    total: Number(r.total ?? 0),
    finalRank: Number(r.final_rank ?? 0),
  }));
}
