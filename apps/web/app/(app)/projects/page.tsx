import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectTable } from "@/components/project/ProjectTable";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listProjects } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  connectType?: "IP" | "VPN" | "VDI" | "RE";
  hasDev?: string;
  status?: string;
  q?: string;
};

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseConnectType(value?: string): "IP" | "VPN" | "VDI" | "RE" | undefined {
  if (value === "IP" || value === "VPN" || value === "VDI" || value === "RE") return value;
  return undefined;
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("Projects");
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/dashboard");
  const params = await searchParams;
  const page = parsePage(params.page);
  const result = await listProjects({
    workspaceId: session.workspaceId,
    page,
    pageSize: 50,
    connectType: parseConnectType(params.connectType),
    hasDev: params.hasDev === "1" ? true : undefined,
    status: params.status || undefined,
    q: params.q?.trim() || undefined
  });

  const canCreate = hasPermission(session, PERMISSIONS.PROJECT_CREATE);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Projects"
        title={t("title")}
        subtitle={t("description", { total: result.pagination.total })}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new">{t("registerProject")}</Link>
            </Button>
          ) : null
        }
      />

      <form className="grid gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-sm md:grid-cols-[1fr_160px_160px_160px_auto]">
        <Input name="q" defaultValue={params.q} placeholder={t("searchPlaceholder")} />
        <select
          name="connectType"
          defaultValue={params.connectType ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allConnectTypes")}</option>
          <option value="IP">IP</option>
          <option value="VPN">VPN</option>
          <option value="VDI">VDI</option>
          <option value="RE">RE</option>
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="active">active</option>
          <option value="deprecated">deprecated</option>
          <option value="decommissioned">decommissioned</option>
        </select>
        <label className="flex h-10 items-center gap-2 px-2 text-sm text-surface-700">
          <input type="checkbox" name="hasDev" value="1" defaultChecked={params.hasDev === "1"} />
          {t("hasDev")}
        </label>
        <Button type="submit" variant="outline">
          {t("applyFilters")}
        </Button>
      </form>

      <ProjectTable data={result.data} />
    </div>
  );
}
