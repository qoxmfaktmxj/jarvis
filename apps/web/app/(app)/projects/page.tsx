import Link from "next/link";
import { getTranslations } from "next-intl/server";
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title={t("title")}
        description={t("description", { total: result.meta.total })}
        accent={`W${isoWeekNumber(new Date())}`}
        meta={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new">{t("newProject")}</Link>
            </Button>
          ) : null
        }
      />

      <form className="grid gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-sm md:grid-cols-[1fr_180px_auto]">
        <Input name="q" defaultValue={q} placeholder={t("title")} />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="active">{t("statuses.active")}</option>
          <option value="on-hold">{t("statuses.onHold")}</option>
          <option value="completed">{t("statuses.completed")}</option>
          <option value="archived">{t("statuses.archived")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("applyFilters")}
        </Button>
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
