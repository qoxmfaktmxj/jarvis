import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectTable } from "@/components/project/ProjectTable";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("description", { total: result.meta.total })}
          </p>
        </div>

        {session.permissions.includes(PERMISSIONS.PROJECT_CREATE) ? (
          <Link
            href="/projects/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t("newProject")}
          </Link>
        ) : null}
      </div>

      <form className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_auto]">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("title")}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="active">{t("statuses.active")}</option>
          <option value="on-hold">{t("statuses.onHold")}</option>
          <option value="completed">{t("statuses.completed")}</option>
          <option value="archived">{t("statuses.archived")}</option>
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {t("applyFilters")}
        </button>
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
