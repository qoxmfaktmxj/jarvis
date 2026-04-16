/**
 * apps/web/app/(app)/admin/wiki/review-queue/page.tsx
 *
 * Phase-W3 T5 — Wiki review queue 관리자 UI (RSC).
 *
 * - 스코프: `wiki_review_queue` 전체 (kind + status 필터 가능).
 * - 기존 `admin/wiki/boundary-violations` 페이지와 레이아웃 일관성을 맞추되,
 *   approve/reject를 지원한다.
 * - admin layout에서 `isAdmin` 게이트가 이미 걸려 있으므로, 여기서는 추가로
 *   `KNOWLEDGE_REVIEW` 권한(또는 ADMIN_ALL)을 검사해 non-admin 리뷰어에게도
 *   진입을 허용할 경로를 확보한다.
 */

import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db } from "@jarvis/db/client";
import { wikiReviewQueue } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

import { Badge } from "@/components/ui/badge";

import { ApprovalDialog } from "./_components/ApprovalDialog";

const PAGE_SIZE = 20;

const KIND_VALUES = [
  "all",
  "contradiction",
  "lint",
  "heal",
  "sensitivity_promotion",
  "ingest_fail",
  "boundary_violation",
  "pii",
] as const;

const STATUS_VALUES = ["all", "pending", "approved", "rejected"] as const;

type KindValue = (typeof KIND_VALUES)[number];
type StatusValue = (typeof STATUS_VALUES)[number];

interface WikiReviewQueuePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickKind(raw: string | undefined): KindValue {
  if (raw && (KIND_VALUES as readonly string[]).includes(raw)) {
    return raw as KindValue;
  }
  return "all";
}

function pickStatus(raw: string | undefined): StatusValue {
  if (raw && (STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as StatusValue;
  }
  return "pending";
}

function pickPage(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * kind별 Badge 색상 매핑.
 * shadcn Badge는 variant="default|secondary|destructive|outline" 만 지원하므로,
 * 더 세분화된 색은 Tailwind 클래스로 직접 부여한다.
 */
function kindBadgeClass(kind: string): string {
  switch (kind) {
    case "contradiction":
      return "bg-red-100 text-red-800 border-red-200";
    case "lint":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "heal":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "sensitivity_promotion":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "ingest_fail":
      return "bg-red-100 text-red-800 border-red-200";
    case "boundary_violation":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "pii":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "pending") return "outline";
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

export default async function WikiReviewQueuePage({
  searchParams,
}: WikiReviewQueuePageProps) {
  const t = await getTranslations("Admin.WikiReviewQueue");
  const headersList = await headers();
  const session = await getSession(headersList.get("x-session-id") ?? "");

  if (!session) throw new Error("unauthenticated");

  // Admin layout이 이미 isAdmin 게이트를 수행하지만, page-level에서
  // KNOWLEDGE_REVIEW 권한을 명시적으로 재확인한다 (non-admin 리뷰어 경로 대비).
  if (
    !isAdmin(session) &&
    !hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW)
  ) {
    throw new Error("forbidden");
  }

  const workspaceId = session.workspaceId;

  const sp = await searchParams;
  const kind = pickKind(typeof sp.kind === "string" ? sp.kind : undefined);
  const status = pickStatus(
    typeof sp.status === "string" ? sp.status : undefined,
  );
  const page = pickPage(typeof sp.page === "string" ? sp.page : undefined);

  const baseFilters = [eq(wikiReviewQueue.workspaceId, workspaceId)];
  if (kind !== "all") baseFilters.push(eq(wikiReviewQueue.kind, kind));
  if (status !== "all") baseFilters.push(eq(wikiReviewQueue.status, status));
  const where = and(...baseFilters);

  const totalRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiReviewQueue)
    .where(where);
  const total = totalRows[0]?.total ?? 0;

  const rows = await db
    .select({
      id: wikiReviewQueue.id,
      kind: wikiReviewQueue.kind,
      status: wikiReviewQueue.status,
      description: wikiReviewQueue.description,
      commitSha: wikiReviewQueue.commitSha,
      affectedPages: wikiReviewQueue.affectedPages,
      createdAt: wikiReviewQueue.createdAt,
    })
    .from(wikiReviewQueue)
    .where(where)
    .orderBy(desc(wikiReviewQueue.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function filterHref(next: { kind?: KindValue; status?: StatusValue }): string {
    const params = new URLSearchParams();
    const k = next.kind ?? kind;
    const s = next.status ?? status;
    if (k !== "all") params.set("kind", k);
    if (s !== "pending") params.set("status", s);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  function pageHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (status !== "pending") params.set("status", status);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("description", { count: total })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b pb-3">
        <div className="flex gap-1">
          {STATUS_VALUES.map((s) => {
            const active = s === status;
            return (
              <a
                key={s}
                href={filterHref({ status: s })}
                className={
                  active
                    ? "px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
                    : "px-3 py-1.5 text-sm rounded-md hover:bg-muted text-muted-foreground"
                }
              >
                {t(`statusFilter.${s}` as never)}
              </a>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor="wiki-kind-filter"
          >
            {t("kindFilterLabel")}:
          </label>
          <div className="flex flex-wrap gap-1">
            {KIND_VALUES.map((k) => {
              const active = k === kind;
              return (
                <a
                  key={k}
                  href={filterHref({ kind: k })}
                  className={
                    active
                      ? "px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground font-medium"
                      : "px-2 py-1 text-xs rounded-md hover:bg-muted text-muted-foreground border"
                  }
                >
                  {t(`kind.${k}` as never)}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {rows.map((row) => {
            const shortSha = (row.commitSha ?? "").slice(0, 10);
            const affectedCount = Array.isArray(row.affectedPages)
              ? row.affectedPages.length
              : 0;

            return (
              <div
                key={row.id}
                className="flex items-start gap-4 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`shrink-0 ${kindBadgeClass(row.kind)}`}
                    >
                      {t(`kind.${row.kind}` as never)}
                    </Badge>
                    <Badge
                      variant={statusBadgeVariant(row.status)}
                      className="shrink-0"
                    >
                      {t(`statusFilter.${row.status}` as never)}
                    </Badge>
                    {affectedCount > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {t("affectedPages", { count: affectedCount })}
                      </span>
                    ) : null}
                    {shortSha ? (
                      <span className="text-xs text-muted-foreground font-mono">
                        {shortSha}
                      </span>
                    ) : null}
                  </div>
                  {row.description ? (
                    <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">
                      {row.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-1">
                    {row.createdAt.toISOString()}
                  </p>
                </div>

                {row.status === "pending" ? (
                  <ApprovalDialog
                    itemId={row.id}
                    kind={row.kind}
                    description={row.description}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-2">
          <a
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={
              page <= 1
                ? "px-3 py-1.5 text-sm rounded-md text-muted-foreground pointer-events-none opacity-40"
                : "px-3 py-1.5 text-sm rounded-md hover:bg-muted"
            }
          >
            {t("pagination.previous")}
          </a>
          <span className="text-sm text-muted-foreground">
            {t("pagination.pageInfo", { page, total: totalPages })}
          </span>
          <a
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={
              page >= totalPages
                ? "px-3 py-1.5 text-sm rounded-md text-muted-foreground pointer-events-none opacity-40"
                : "px-3 py-1.5 text-sm rounded-md hover:bg-muted"
            }
          >
            {t("pagination.next")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
