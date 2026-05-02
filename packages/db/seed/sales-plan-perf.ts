/**
 * packages/db/seed/sales-plan-perf.ts
 *
 * Group 6 통계 차트가 시연될 수 있도록 24개월 × 5조직 × 3구분 × 3지표 = 1080행 시드.
 * Deterministic per (ym, orgCd, gubun, metric) — 재시드 시 같은 값.
 * Idempotent on the unique index (workspaceId, ym, orgCd, gubunCd, trendGbCd).
 */
import { db } from "../client.js";
import { salesPlanPerf } from "../schema/sales-plan-perf.js";

interface DeptSeed { code: string; name: string; baseline: number }

const DEPTS: DeptSeed[] = [
  { code: "SALES01", name: "영업1본부", baseline: 1_500_000_000 },
  { code: "SALES02", name: "영업2본부", baseline: 1_100_000_000 },
  { code: "SALES03", name: "영업3본부", baseline: 900_000_000 },
  { code: "SALES04", name: "기술영업본부", baseline: 700_000_000 },
  { code: "SALES05", name: "신규사업본부", baseline: 400_000_000 },
];

const GUBUNS = ["PLAN", "ACTUAL", "FORECAST"] as const;
const METRICS = ["SALES", "GROSS_PROFIT", "OP_INCOME"] as const;

const METRIC_RATIO: Record<typeof METRICS[number], number> = {
  SALES: 1.0,
  GROSS_PROFIT: 0.32,
  OP_INCOME: 0.12,
};

const GUBUN_RATIO: Record<typeof GUBUNS[number], number> = {
  PLAN: 1.0,
  ACTUAL: 0.94,
  FORECAST: 1.05,
};

function deterministicNoise(ym: string, dept: string, gubun: string, metric: string): number {
  const s = `${ym}|${dept}|${gubun}|${metric}`;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const norm = ((h >>> 0) % 30000) / 100000;
  return 1 + (norm - 0.15);
}

function* months(start: string, end: string): Generator<string> {
  const sy = Number(start.slice(0, 4));
  const sm = Number(start.slice(4, 6));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(4, 6));
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    yield `${y}${String(m).padStart(2, "0")}`;
    m += 1;
    if (m > 12) { y += 1; m = 1; }
  }
}

export async function seedSalesPlanPerf(workspaceId: string): Promise<void> {
  const rows: Array<typeof salesPlanPerf.$inferInsert> = [];
  for (const ym of months("202401", "202512")) {
    for (const dept of DEPTS) {
      for (const gubun of GUBUNS) {
        for (const metric of METRICS) {
          const noise = deterministicNoise(ym, dept.code, gubun, metric);
          const amt = Math.round(dept.baseline * METRIC_RATIO[metric] * GUBUN_RATIO[gubun] * noise);
          rows.push({
            workspaceId,
            ym,
            orgCd: dept.code,
            orgNm: dept.name,
            gubunCd: gubun,
            trendGbCd: metric,
            amt,
            note: null,
          });
        }
      }
    }
  }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(salesPlanPerf)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoNothing({
        target: [
          salesPlanPerf.workspaceId,
          salesPlanPerf.ym,
          salesPlanPerf.orgCd,
          salesPlanPerf.gubunCd,
          salesPlanPerf.trendGbCd,
        ],
      });
  }
  console.log(`✓ seeded ${rows.length} sales_plan_perf rows`);
}
