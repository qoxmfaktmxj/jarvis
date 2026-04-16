/**
 * apps/web/app/(app)/admin/wiki/review-queue/page.tsx
 *
 * Phase-W3 T5 — Wiki review queue 관리자 UI (RSC).
 */

import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { db } from "@jarvis/db/client";
import { wikiReviewQueue } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission, isAdmin } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/patterns/PageHeader";
import { DataTableShell } from "@/components/patterns/DataTableShell";
import { EmptyState } from "@/components/patterns/EmptyState";

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
  "synonym_conflict",
  "integrity_violation",
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

function kindBadgeVariant(
  kind: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (kind === "contradiction" || kind === "ingest_fail" || kind === "pii") {
    return "destructive";
  }
  if (kind === "boundary_violation" || kind === "lint") {
    return "secondary";
  }
  return "outline";
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

  if (!session) redirect("/login");

  if (
    !isAdmin(session) &&
    !hasPermission(session, PERMISSIONS.KNOWLEDGE_REVIEW)
  ) {
    forbidden();
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

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {STATUS_VALUES.map((s) => {
          const active = s === status;
          return (
            <Button
              key={s}
              asChild
              size="sm"
              variant={active ? "default" : "ghost"}
            >
              <a href={filterHref({ status: s })}>
                {t(`statusFilter.${s}` as never)}
              </a>
            </Button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="text-sm text-surface-600">
          {t("kindFilterLabel")}:
        </span>
        <div className="flex flex-wrap gap-1">
          {KIND_VALUES.map((k) => {
            const active = k === kind;
            return (
              <Button
                key={k}
                asChild
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 px-2 text-xs"
              >
                <a href={filterHref({ kind: k })}>{t(`kind.${k}` as never)}</a>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const pagination =
    totalPages > 1 ? (
      <>
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          {page <= 1 ? (
            <span className="pointer-events-none opacity-50">
              {t("pagination.previous")}
            </span>
          ) : (
            <a href={pageHref(Math.max(1, page - 1))}>
              {t("pagination.previous")}
            </a>
          )}
        </Button>
        <span className="text-sm text-surface-500">
          {t("pagination.pageInfo", { page, total: totalPages })}
        </span>
        <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
          {page >= totalPages ? (
            <span className="pointer-events-none opacity-50">
              {t("pagination.next")}
            </span>
          ) : (
            <a href={pageHref(Math.min(totalPages, page + 1))}>
              {t("pagination.next")}
            </a>
          )}
        </Button>
      </>
    ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Wiki Review Queue"
        title={t("title")}
        description={t("description", { count: total })}
      />

      <DataTableShell
        rowCount={rows.length}
        filters={filters}
        empty={<EmptyState title={t("empty")} />}
        pagination={pagination}
      >
        <ul className="divide-y divide-surface-200">
          {rows.map((row) => {
            const shortSha = (row.commitSha ?? "").slice(0, 10);
            const affectedCount = Array.isArray(row.affectedPages)
              ? row.affectedPages.length
              : 0;

            return (
              <li
                key={row.id}
                className="flex items-start gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={kindBadgeVariant(row.kind)}
                      className="shrink-0"
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
                      <span className="text-xs text-surface-500">
                        {t("affectedPages", { count: affectedCount })}
                      </span>
                    ) : null}
                    {shortSha ? (
                      <span className="font-mono text-xs text-surface-500">
                        {shortSha}
                      </span>
                    ) : null}
                  </div>
                  {row.description ? (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-surface-700">
                      {row.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-surface-500">
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
              </li>
            );
          })}
        </ul>
      </DataTableShell>
    </div>
  );
}
