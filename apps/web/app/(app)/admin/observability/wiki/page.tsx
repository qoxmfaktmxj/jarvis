/**
 * apps/web/app/(app)/admin/observability/wiki/page.tsx
 *
 * Phase-W3 v4-W3-T5 — Admin wiki observability dashboard.
 */

import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@jarvis/db/client";
import {
  wikiCommitLog,
  wikiLintReport,
  wikiPageIndex,
  wikiReviewQueue,
} from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/patterns/PageHeader";
import { DataTableShell } from "@/components/patterns/DataTableShell";
import { WikiObservabilityClient } from "./WikiObservabilityClient";

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50"
        : "border-surface-200 bg-card";
  return (
    <section className={`flex flex-col gap-2 rounded-xl border p-5 ${toneClass}`}>
      <p className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </p>
      <p className="text-display text-4xl font-bold leading-none tracking-tight text-surface-900 tabular-nums">
        {value}
      </p>
      {hint ? <p className="text-xs text-surface-500">{hint}</p> : null}
    </section>
  );
}

export const dynamic = "force-dynamic";

const PAGE_FIRST_PROMPT_VERSION = "2026-04-v1-pagefirst";

interface DailyCount {
  day: string;
  count: number;
}

interface TypeDistribution {
  type: string;
  count: number;
}

interface DashboardData {
  workspaceId: string;
  dailyIngest: DailyCount[];
  dailyIngestTotal: number;
  pageFirstQueryCount24h: number;
  latestCommitAt: Date | null;
  latestCommitSha: string | null;
  latestCommitOperation: string | null;
  commitStale: boolean;
  totalPages: number;
  typeDistribution: TypeDistribution[];
  boundaryViolationsPending: number;
  latestLintReport: {
    reportDate: string;
    orphan: number;
    brokenLink: number;
    noOutlink: number;
    contradiction: number;
    stale: number;
  } | null;
  reviewQueuePending: number;
  reviewQueueByKind: Array<{ kind: string; count: number }>;
}

async function fetchDailyIngest(workspaceId: string): Promise<DailyCount[]> {
  const rows = await db.execute<{ day: string; count: string }>(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           COUNT(*)::text AS count
    FROM wiki_commit_log
    WHERE workspace_id = ${workspaceId}::uuid
      AND operation = 'ingest'
      AND created_at >= now() - interval '7 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);
  return rows.rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

async function fetchPageFirstQueryCount(workspaceId: string): Promise<number> {
  const rows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM llm_call_log
    WHERE workspace_id = ${workspaceId}::uuid
      AND (op LIKE 'wiki.query.%' OR prompt_version = ${PAGE_FIRST_PROMPT_VERSION})
      AND created_at >= now() - interval '24 hours'
  `);
  return Number(rows.rows[0]?.count ?? 0);
}

async function fetchLatestCommit(workspaceId: string) {
  const rows = await db
    .select({
      commitSha: wikiCommitLog.commitSha,
      operation: wikiCommitLog.operation,
      createdAt: wikiCommitLog.createdAt,
    })
    .from(wikiCommitLog)
    .where(eq(wikiCommitLog.workspaceId, workspaceId))
    .orderBy(desc(wikiCommitLog.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function fetchPageStats(workspaceId: string) {
  const totalRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiPageIndex)
    .where(eq(wikiPageIndex.workspaceId, workspaceId));
  const total = totalRows[0]?.total ?? 0;

  const typeRows = await db.execute<{ type: string; count: string }>(sql`
    SELECT type, COUNT(*)::text AS count
    FROM wiki_page_index
    WHERE workspace_id = ${workspaceId}::uuid
    GROUP BY type
    ORDER BY COUNT(*) DESC
  `);

  return {
    totalPages: total,
    typeDistribution: typeRows.rows.map((r) => ({
      type: r.type,
      count: Number(r.count),
    })),
  };
}

async function fetchBoundaryViolationsPending(
  workspaceId: string,
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiReviewQueue)
    .where(
      and(
        eq(wikiReviewQueue.workspaceId, workspaceId),
        eq(wikiReviewQueue.kind, "boundary_violation"),
        eq(wikiReviewQueue.status, "pending"),
      ),
    );
  return rows[0]?.total ?? 0;
}

async function fetchLatestLintReport(workspaceId: string) {
  const rows = await db
    .select()
    .from(wikiLintReport)
    .where(eq(wikiLintReport.workspaceId, workspaceId))
    .orderBy(desc(wikiLintReport.reportDate))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    reportDate: row.reportDate,
    orphan: row.orphanCount,
    brokenLink: row.brokenLinkCount,
    noOutlink: row.noOutlinkCount,
    contradiction: row.contradictionCount,
    stale: row.staleCount,
  };
}

async function fetchReviewQueueStats(workspaceId: string) {
  const pendingRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiReviewQueue)
    .where(
      and(
        eq(wikiReviewQueue.workspaceId, workspaceId),
        eq(wikiReviewQueue.status, "pending"),
      ),
    );

  const byKindRows = await db.execute<{ kind: string; count: string }>(sql`
    SELECT kind, COUNT(*)::text AS count
    FROM wiki_review_queue
    WHERE workspace_id = ${workspaceId}::uuid
      AND status = 'pending'
    GROUP BY kind
    ORDER BY COUNT(*) DESC
  `);

  return {
    reviewQueuePending: pendingRows[0]?.total ?? 0,
    reviewQueueByKind: byKindRows.rows.map((r) => ({
      kind: r.kind,
      count: Number(r.count),
    })),
  };
}

function formatRelative(d: Date | null): string {
  if (!d) return "기록 없음";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return `${days}일 전`;
}

async function loadDashboard(workspaceId: string): Promise<DashboardData> {
  const [
    dailyIngest,
    pageFirstQueryCount24h,
    latestCommit,
    pageStats,
    boundaryViolationsPending,
    latestLintReport,
    reviewQueueStats,
  ] = await Promise.all([
    fetchDailyIngest(workspaceId),
    fetchPageFirstQueryCount(workspaceId),
    fetchLatestCommit(workspaceId),
    fetchPageStats(workspaceId),
    fetchBoundaryViolationsPending(workspaceId),
    fetchLatestLintReport(workspaceId),
    fetchReviewQueueStats(workspaceId),
  ]);

  const dailyIngestTotal = dailyIngest.reduce((acc, r) => acc + r.count, 0);
  const commitStale = latestCommit
    ? Date.now() - latestCommit.createdAt.getTime() > 24 * 3600 * 1000
    : true;

  return {
    workspaceId,
    dailyIngest,
    dailyIngestTotal,
    pageFirstQueryCount24h,
    latestCommitAt: latestCommit?.createdAt ?? null,
    latestCommitSha: latestCommit?.commitSha ?? null,
    latestCommitOperation: latestCommit?.operation ?? null,
    commitStale,
    totalPages: pageStats.totalPages,
    typeDistribution: pageStats.typeDistribution,
    boundaryViolationsPending,
    latestLintReport,
    reviewQueuePending: reviewQueueStats.reviewQueuePending,
    reviewQueueByKind: reviewQueueStats.reviewQueueByKind,
  };
}

export default async function WikiObservabilityPage() {
  const headersList = await headers();
  const session = await getSession(headersList.get("x-session-id") ?? "");
  if (!session) throw new Error("unauthenticated");

  const data = await loadDashboard(session.workspaceId);
  const renderedAt = new Date().toISOString();

  return (
    <WikiObservabilityClient renderedAt={renderedAt}>
      <div className="space-y-6">
        <PageHeader
          accent="AD"
          eyebrow="Admin · Wiki Observability"
          title="Wiki 운영 모니터링"
          description={`ingest 처리량, page-first 쿼리, commit 무결성, lint 결과 등 위키 파이프라인 건강 상태. Workspace: ${data.workspaceId}`}
        />

        {/* Top KPIs */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="일별 ingest 건수 (최근 7일)"
            value={data.dailyIngestTotal}
            hint={
              data.dailyIngest.length > 0
                ? `최근: ${data.dailyIngest[0]?.day} — ${data.dailyIngest[0]?.count}건`
                : "최근 7일 ingest 없음"
            }
          />
          <StatCard
            label="page-first 쿼리 (최근 24h)"
            value={data.pageFirstQueryCount24h}
            hint="op LIKE 'wiki.query.%' (fallback: prompt_version)"
          />
          <StatCard
            label="commit log 무결성"
            value={data.latestCommitAt ? "정상" : "기록 없음"}
            hint={
              data.latestCommitAt
                ? `최근 커밋: ${formatRelative(data.latestCommitAt)} · ${
                    data.latestCommitSha?.slice(0, 10) ?? ""
                  } (${data.latestCommitOperation ?? "?"})`
                : "wiki_commit_log에 레코드가 없습니다"
            }
            tone={
              !data.latestCommitAt
                ? "danger"
                : data.commitStale
                  ? "warn"
                  : "default"
            }
          />
        </section>

        {/* Daily ingest breakdown */}
        <DataTableShell
          rowCount={data.dailyIngest.length}
          empty={
            <div className="px-4 py-8 text-center text-sm text-surface-500">
              최근 7일 동안 ingest 커밋이 없습니다.
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead className="text-right">건수</TableHead>
                <TableHead>분포</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const max = Math.max(
                  1,
                  ...data.dailyIngest.map((r) => r.count),
                );
                return data.dailyIngest.map((r) => (
                  <TableRow key={r.day}>
                    <TableCell className="font-mono text-xs">{r.day}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.count}
                    </TableCell>
                    <TableCell>
                      <div
                        className="h-2 rounded bg-primary/70"
                        style={{
                          width: `${Math.max(4, (r.count / max) * 100)}%`,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        </DataTableShell>

        {/* Pages + type distribution */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-surface-200 bg-card">
            <header className="flex items-center justify-between border-b border-surface-200 bg-surface-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-surface-900">wiki_page_index 총 페이지</h2>
              <Badge variant="outline">{data.totalPages}</Badge>
            </header>
            {data.typeDistribution.length === 0 ? (
              <p className="p-4 text-sm text-surface-500">
                페이지 인덱스가 비어 있습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>type</TableHead>
                    <TableHead className="text-right">개수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.typeDistribution.map((r) => (
                    <TableRow key={r.type}>
                      <TableCell className="font-mono text-xs">{r.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Boundary violations */}
          <div className="rounded-xl border border-surface-200 bg-card">
            <header className="flex items-center justify-between border-b border-surface-200 bg-surface-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-surface-900">auto/manual 경계 위반</h2>
              <Badge
                variant={
                  data.boundaryViolationsPending > 0
                    ? "destructive"
                    : "outline"
                }
              >
                pending {data.boundaryViolationsPending}
              </Badge>
            </header>
            <div className="space-y-2 p-4 text-sm text-surface-500">
              {data.boundaryViolationsPending === 0 ? (
                <p>경계 위반이 없습니다. ({" "}
                  <a
                    href="/admin/wiki/boundary-violations"
                    className="underline hover:text-surface-900"
                  >
                    위반 로그
                  </a>
                  {" })"}
                </p>
              ) : (
                <p>
                  <strong className="text-destructive">
                    {data.boundaryViolationsPending}건
                  </strong>
                  의 auto/manual 경계 위반이 pending 상태입니다.{" "}
                  <a
                    href="/admin/wiki/boundary-violations"
                    className="underline hover:text-surface-900"
                  >
                    위반 로그 열기 →
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Lint report */}
        <div className="rounded-xl border border-surface-200 bg-card">
          <header className="flex items-center justify-between border-b border-surface-200 bg-surface-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-surface-900">최근 Lint 리포트</h2>
            {data.latestLintReport ? (
              <Badge variant="outline">
                {data.latestLintReport.reportDate}
              </Badge>
            ) : (
              <Badge variant="secondary">없음</Badge>
            )}
          </header>
          {data.latestLintReport ? (
            <div className="grid grid-cols-2 divide-y divide-surface-200 md:grid-cols-5 md:divide-x md:divide-y-0">
              <LintCell label="orphan" value={data.latestLintReport.orphan} />
              <LintCell
                label="broken link"
                value={data.latestLintReport.brokenLink}
              />
              <LintCell
                label="no outlink"
                value={data.latestLintReport.noOutlink}
              />
              <LintCell
                label="contradiction"
                value={data.latestLintReport.contradiction}
              />
              <LintCell label="stale" value={data.latestLintReport.stale} />
            </div>
          ) : (
            <p className="p-4 text-sm text-surface-500">
              아직 lint 리포트가 없습니다. 주간 cron이 실행된 후 표시됩니다.
            </p>
          )}
        </div>

        {/* Review queue */}
        <div className="rounded-xl border border-surface-200 bg-card">
          <header className="flex items-center justify-between border-b border-surface-200 bg-surface-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-surface-900">리뷰 큐 (pending)</h2>
            <Badge
              variant={
                data.reviewQueuePending > 0 ? "destructive" : "outline"
              }
            >
              {data.reviewQueuePending}
            </Badge>
          </header>
          {data.reviewQueueByKind.length === 0 ? (
            <p className="p-4 text-sm text-surface-500">
              pending 리뷰 항목이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>kind</TableHead>
                  <TableHead className="text-right">개수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.reviewQueueByKind.map((r) => (
                  <TableRow key={r.kind}>
                    <TableCell className="font-mono text-xs">{r.kind}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </WikiObservabilityClient>
  );
}

function LintCell({ label, value }: { label: string; value: number }) {
  const tone =
    value === 0
      ? "text-surface-500"
      : value >= 10
        ? "text-destructive"
        : "text-surface-900";
  return (
    <div className="px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-surface-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}
