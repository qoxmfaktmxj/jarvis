#!/usr/bin/env tsx
/**
 * scripts/migrate-add-dev-from-xls.ts
 *
 * Migrates XLS files from 추가개발/ directory into:
 *   - additional_development      (from 추가개발관리_1번시트.xls)
 *   - additional_development_effort (from 추가개발관리_2번시트.xls, heatmap cols)
 *   - additional_development_revenue (from 추가개발인력관리_2번시트.xls, heatmap cols)
 *   - project name / contract fields updated from 추가개발프로젝트관리.xls
 *
 * Run (dry-run safe — DO NOT execute against live DB without confirmation):
 *   WORKSPACE_ID=<uuid> pnpm tsx scripts/migrate-add-dev-from-xls.ts
 *
 * If WORKSPACE_ID is omitted, the first workspace in DB is used.
 *
 * NOTE: DB imports are kept inside main() so vitest can import and test
 * the pure-function exports without a live database connection.
 */
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedRequest = {
  requestCompany: string;
  requestYearMonth: string | null;
  requestSequence: number | null;
  status: string | null;
  part: string | null;
  requesterName: string | null;
  requestContent: string | null;
  isPaid: boolean | null;
  invoiceIssued: boolean | null;
  contractStartMonth: string | null;
  contractEndMonth: string | null;
  estimatedEffort: string | null;
  actualEffort: string | null;
  remark: string | null;
};

export type HeatmapCell = { yearMonth: string; value: number };

// ---------------------------------------------------------------------------
// Pure helper exports (tested by vitest)
// ---------------------------------------------------------------------------

/**
 * Converts an Excel serial date number to an ISO date string (YYYY-MM-DD).
 * Uses UTC to avoid timezone-dependent date shifts.
 */
export function excelDateToISO(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const d = new Date(utcValue * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses the request sheet (시트1 of 추가개발관리_1번시트.xls).
 * Skips the first 2 header rows.
 * Filters out rows with no company name.
 *
 * Column layout (0-indexed):
 *   0: No
 *   1: 요청회사
 *   2: 요청년월 (Excel serial)
 *   3: 요청순번
 *   4: 진행상태
 *   5: 파트
 *   6: 요청자
 *   7: 요청내용
 *   8-9: (merged/empty)
 *  10: 유상여부 (Y/N)
 *  11: (empty)
 *  12: 계산서 (Y/N)
 *  13: 계약시작 (Excel serial)
 *  14: 계약종료 (Excel serial)
 *  15-16: (empty)
 *  17: 예상공수
 *  18: 실제공수
 *  19: 비고
 */
export function parseRequestSheet(rows: unknown[][]): ParsedRequest[] {
  const data = rows.slice(2); // skip 2 header rows
  return data
    .filter((r): r is unknown[] => Array.isArray(r) && r[1] != null && String(r[1]).trim() !== '')
    .map((r) => ({
      requestCompany: String(r[1]),
      requestYearMonth:
        typeof r[2] === 'number' ? excelDateToISO(r[2]).slice(0, 7) : null,
      requestSequence:
        typeof r[3] === 'number' ? Math.floor(r[3]) : null,
      status: r[4] != null ? String(r[4]) : null,
      part: r[5] != null ? String(r[5]) : null,
      requesterName: r[6] != null ? String(r[6]) : null,
      requestContent: r[7] != null ? String(r[7]) : null,
      isPaid: r[10] === 'Y' ? true : r[10] === 'N' ? false : null,
      invoiceIssued: r[12] === 'Y' ? true : r[12] === 'N' ? false : null,
      contractStartMonth:
        typeof r[13] === 'number' ? excelDateToISO(r[13]).slice(0, 7) : null,
      contractEndMonth:
        typeof r[14] === 'number' ? excelDateToISO(r[14]).slice(0, 7) : null,
      estimatedEffort:
        typeof r[17] === 'number' ? String(r[17]) : null,
      actualEffort:
        typeof r[18] === 'number' ? String(r[18]) : null,
      remark: r[19] != null ? String(r[19]) : null,
    }));
}

/**
 * Parses a month heatmap from a sheet.
 * Each data row (after 2 header rows) contributes cells at startCol..startCol+11 (12 months).
 * Returns a Map<rowIndex (0-based from data start), HeatmapCell[]> with only non-zero cells.
 *
 * @param rows      - Full sheet rows (including headers)
 * @param startCol  - Column index where month 1 (January) begins
 * @param year      - Calendar year for labeling (e.g. 2025)
 */
export function parseMonthHeatmap(
  rows: unknown[][],
  startCol: number,
  year: number,
): Map<number, HeatmapCell[]> {
  const out = new Map<number, HeatmapCell[]>();
  const data = rows.slice(2);
  data.forEach((r, idx) => {
    if (!r || !Array.isArray(r)) return;
    const cells: HeatmapCell[] = [];
    for (let m = 0; m < 12; m++) {
      const v = r[startCol + m];
      if (typeof v === 'number' && v > 0) {
        cells.push({
          yearMonth: `${year}-${String(m + 1).padStart(2, '0')}`,
          value: v,
        });
      }
    }
    if (cells.length) out.set(idx, cells);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Main (DB writes — only runs when executed directly)
// ---------------------------------------------------------------------------

async function main() {
  // Lazy imports — keeps pure functions testable without DB
  await import('dotenv/config');
  const XLSX = await import('xlsx');
  const { db } = await import('@jarvis/db/client');
  const { and, eq } = await import('drizzle-orm');
  const {
    additionalDevelopment,
    additionalDevelopmentEffort,
    additionalDevelopmentRevenue,
    company,
    project,
    workspace,
  } = await import('@jarvis/db/schema');

  let workspaceId = process.env['WORKSPACE_ID'];
  if (!workspaceId) {
    const [ws] = await db.select().from(workspace).limit(1);
    if (!ws) throw new Error('no workspace found; set WORKSPACE_ID env var');
    workspaceId = ws.id;
  }

  const base = path.resolve(process.cwd(), '추가개발');
  const report = {
    requests: 0,
    contracts_matched: 0,
    efforts: 0,
    revenues: 0,
    staff_skipped: true,
    unmatched_companies: [] as string[],
  };

  // 1) Load company + project lookup maps
  const companies = await db
    .select()
    .from(company)
    .where(eq(company.workspaceId, workspaceId));
  const projects = await db
    .select()
    .from(project)
    .where(eq(project.workspaceId, workspaceId));

  const companyByName = new Map(companies.map((c) => [c.name, c]));
  const projectByCompanyId = new Map(projects.map((p) => [p.companyId, p]));

  // 2) 요청 시트 → additional_development 본체
  const wb1 = XLSX.readFile(path.join(base, '추가개발관리_1번시트.xls'));
  const rows1 = XLSX.utils.sheet_to_json<unknown[]>(
    wb1.Sheets[wb1.SheetNames[0]!]!,
    { header: 1 },
  );
  const requests = parseRequestSheet(rows1);

  const createdIds: { key: string; id: string }[] = [];

  for (const req of requests) {
    const co = companyByName.get(req.requestCompany);
    if (!co) {
      report.unmatched_companies.push(req.requestCompany);
      continue;
    }
    const proj = projectByCompanyId.get(co.id);
    if (!proj) {
      report.unmatched_companies.push(`${req.requestCompany}(no project)`);
      continue;
    }

    const [created] = await db
      .insert(additionalDevelopment)
      .values({
        workspaceId,
        projectId: proj.id,
        requestYearMonth: req.requestYearMonth,
        requestSequence: req.requestSequence,
        status: req.status ?? '협의중',
        part: req.part,
        requesterName: req.requesterName,
        requestContent: req.requestContent,
        isPaid: req.isPaid,
        invoiceIssued: req.invoiceIssued,
        contractStartMonth: req.contractStartMonth,
        contractEndMonth: req.contractEndMonth,
        estimatedEffort: req.estimatedEffort,
        actualEffort: req.actualEffort,
        remark: req.remark,
        projectName: req.requestContent?.slice(0, 200) ?? null,
      })
      .returning();

    report.requests++;
    createdIds.push({
      key: `${req.requestCompany}|${req.requestYearMonth}|${req.requestSequence}`,
      id: created!.id,
    });
  }

  // 3) 공수 히트맵 (추가개발관리_2번시트.xls)
  const wb2 = XLSX.readFile(path.join(base, '추가개발관리_2번시트.xls'));
  const rows2 = XLSX.utils.sheet_to_json<unknown[]>(
    wb2.Sheets[wb2.SheetNames[0]!]!,
    { header: 1 },
  );

  for (const [startCol, year] of [[10, 2025], [22, 2026]] as const) {
    const map = parseMonthHeatmap(rows2, startCol, year);
    for (const [rowIdx, cells] of map) {
      const req = requests[rowIdx];
      if (!req) continue;
      const match = createdIds.find(
        (c) => c.key === `${req.requestCompany}|${req.requestYearMonth}|${req.requestSequence}`,
      );
      if (!match) continue;
      for (const c of cells) {
        await db
          .insert(additionalDevelopmentEffort)
          .values({
            addDevId: match.id,
            yearMonth: c.yearMonth,
            effort: String(c.value),
          })
          .onConflictDoNothing();
        report.efforts++;
      }
    }
  }

  // 4) 프로젝트 관리 시트 → contract_* 필드 업데이트 (추가개발프로젝트관리.xls)
  //
  // Column layout (0-indexed, after 2 header rows):
  //   0: No   1: 프로젝트명   2: 요청회사   3: 파트   4: (empty)
  //   5: 협력사 담당자   6: 계약시작   7: 계약종료   8: 개발시작   9: 개발종료
  //  10-11: (empty)   12: 계산서   13: 실제공수   14: 계약금액   15: 비고
  const wbP = XLSX.readFile(path.join(base, '추가개발프로젝트관리.xls'));
  const rowsP = XLSX.utils
    .sheet_to_json<unknown[]>(wbP.Sheets[wbP.SheetNames[0]!]!, { header: 1 })
    .slice(2);

  for (const r of rowsP) {
    if (!Array.isArray(r) || !r[1]) continue;
    const projectName = String(r[1]);
    const requestCompany = String(r[2] ?? '');
    const candidate = createdIds.find((c) => c.key.startsWith(requestCompany + '|'));
    if (!candidate) continue;

    await db
      .update(additionalDevelopment)
      .set({
        projectName,
        part: r[3] != null ? String(r[3]) : undefined,
        vendorContactNote: r[5] != null ? String(r[5]) : undefined,
        contractStartMonth:
          typeof r[6] === 'number' ? excelDateToISO(r[6]).slice(0, 7) : undefined,
        contractEndMonth:
          typeof r[7] === 'number' ? excelDateToISO(r[7]).slice(0, 7) : undefined,
        devStartDate:
          typeof r[8] === 'number' ? excelDateToISO(r[8]) : undefined,
        devEndDate:
          typeof r[9] === 'number' ? excelDateToISO(r[9]) : undefined,
        invoiceIssued: r[12] === 'Y' ? true : r[12] === 'N' ? false : undefined,
        actualEffort:
          typeof r[13] === 'number' ? String(r[13]) : undefined,
        contractAmount:
          typeof r[14] === 'number' ? String(Math.round(r[14])) : undefined,
        remark: r[15] != null ? String(r[15]) : undefined,
      })
      .where(
        and(
          eq(additionalDevelopment.id, candidate.id),
          eq(additionalDevelopment.workspaceId, workspaceId),
        ),
      );
    report.contracts_matched++;
  }

  // 5) 매출 히트맵 (추가개발인력관리_2번시트.xls)
  //    startCol=13 for 2025 months (Jan=col13, Dec=col24)
  const wbR = XLSX.readFile(path.join(base, '추가개발인력관리_2번시트.xls'));
  const rowsR = XLSX.utils.sheet_to_json<unknown[]>(
    wbR.Sheets[wbR.SheetNames[0]!]!,
    { header: 1 },
  );
  const revMap = parseMonthHeatmap(rowsR, 13, 2025);
  for (const [rowIdx, cells] of revMap) {
    const req = requests[rowIdx];
    if (!req) continue;
    const match = createdIds.find(
      (c) => c.key === `${req.requestCompany}|${req.requestYearMonth}|${req.requestSequence}`,
    );
    if (!match) continue;
    for (const c of cells) {
      await db
        .insert(additionalDevelopmentRevenue)
        .values({
          addDevId: match.id,
          yearMonth: c.yearMonth,
          amount: String(Math.round(c.value)),
        })
        .onConflictDoNothing();
      report.revenues++;
    }
  }

  // 6) Staff sheet — deferred to manual follow-up
  //    additionalDevelopmentStaff migration requires userId resolution (name→user lookup)
  //    which needs a confirmed user roster. Skipped in P4-B scope.

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
