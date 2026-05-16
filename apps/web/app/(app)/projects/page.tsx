import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";
import { PageShellFit } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { listProjectsForGrid } from "@/lib/queries/projects";
import { listCompanyOptions } from "@/lib/queries/infra-license";
import { requirePageSession } from "@/lib/server/page-auth";
import { ProjectsGridContainer } from "./_components/ProjectsGridContainer";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  connectType?: "IP" | "VPN" | "VDI" | "RE";
  status?: "active" | "deprecated" | "decommissioned";
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

function parseStatus(value?: string): "active" | "deprecated" | "decommissioned" | undefined {
  if (value === "active" || value === "deprecated" || value === "decommissioned") return value;
  return undefined;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("Projects");
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/dashboard");
  const params = await searchParams;
  const page = parsePage(params.page);
  const limit = DEFAULT_PAGE_SIZE;
  const status = parseStatus(params.status);
  const connectType = parseConnectType(params.connectType);
  const q = params.q?.trim() || undefined;

  const [{ rows, total }, companyOptions] = await Promise.all([
    listProjectsForGrid({
      workspaceId: session.workspaceId,
      page,
      limit,
      status,
      connectType,
      q,
    }),
    listCompanyOptions(session.workspaceId),
  ]);

  const canCreate = hasPermission(session, PERMISSIONS.PROJECT_ADMIN);

  return (
    <PageShellFit
      title={t("title")}
      actions={
        canCreate ? (
          <Button asChild>
            <Link href="/projects/new">{t("registerProject")}</Link>
          </Button>
        ) : null
      }
    >
      <ProjectsGridContainer
        initialRows={rows}
        initialTotal={total}
        page={page}
        limit={limit}
        companyOptions={companyOptions}
        initialQ={q ?? ""}
        initialStatus={status ?? ""}
        initialConnectType={connectType ?? ""}
      />
    </PageShellFit>
  );
}
