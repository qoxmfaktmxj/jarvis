import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Search, Filter } from "lucide-react";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectTable } from "@/components/project/ProjectTable";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isoWeekNumber } from "@/lib/date-utils";
import { listProjects } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  status?: string;
  q?: string;
};

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("Projects");
  const session = await requirePageSession(
    PERMISSIONS.PROJECT_READ,
    "/dashboard"
  );
  const params = await searchParams;
  const page = parsePage(params.page);
  const status = params.status;
  const q = params.q?.trim() || undefined;

  const result = await listProjects({
    workspaceId: session.workspaceId,
    page,
    status,
    q
  });

  const canCreate = session.permissions.includes(PERMISSIONS.PROJECT_CREATE);
  const hasActiveFilter = Boolean(q || status);

  return (
    <div className="space-y-6">
      <PageHeader
        stamp={`W${isoWeekNumber(new Date())}`}
        kicker="Projects"
        title={t("title")}
        subtitle={t("subtitle", { total: result.meta.total })}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="h-4 w-4" />
                {t("newProject")}
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Filter bar */}
      <form className="rounded-md border border-surface-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="grid gap-2 md:grid-cols-[1fr_200px_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
            <Input
              name="q"
              defaultValue={q}
              placeholder={t("title")}
              className="h-9 pl-9 placeholder:text-surface-400"
            />
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
            <select
              name="status"
              defaultValue={status ?? ""}
              className="flex h-9 w-full appearance-none rounded-md border border-surface-200 bg-white pl-9 pr-8 text-[13px] text-surface-800 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200"
            >
              <option value="">{t("allStatuses")}</option>
              <option value="active">{t("statuses.active")}</option>
              <option value="on-hold">{t("statuses.onHold")}</option>
              <option value="completed">{t("statuses.completed")}</option>
              <option value="archived">{t("statuses.archived")}</option>
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-surface-400"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <Button type="submit" size="sm" className="h-9">
            {t("applyFilters")}
          </Button>
          {hasActiveFilter && (
            <Button type="button" variant="ghost" size="sm" asChild className="h-9">
              <Link href="/projects">초기화</Link>
            </Button>
          )}
        </div>
      </form>

      <ProjectTable
        data={result.data}
        page={result.meta.page}
        totalPages={result.meta.totalPages}
        total={result.meta.total}
      />
    </div>
  );
}
