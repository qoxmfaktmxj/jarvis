import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { requirePageSession } from "@/lib/server/page-auth";
import { listAdditionalDev } from "@/lib/queries/additional-dev";
import { Button } from "@/components/ui/button";
import { AddDevTable } from "@/components/add-dev/AddDevTable";

export default async function ProjectAddDevTabPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const result = await listAdditionalDev({
    workspaceId: session.workspaceId,
    projectId,
    pageSize: 50,
  });
  const canCreate = hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_CREATE);
  const t = await getTranslations("AdditionalDev");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t("projectTab.heading", { count: result.pagination.total })}
        </h2>
        {canCreate ? (
          <Button asChild size="sm">
            <Link href={`/add-dev/new?projectId=${projectId}`}>
              {t("newAddDev")}
            </Link>
          </Button>
        ) : null}
      </div>
      <AddDevTable data={result.data} />
    </div>
  );
}
