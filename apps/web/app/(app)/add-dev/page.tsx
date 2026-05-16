import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";
import { PageShellFit } from "@/components/patterns/PageShell";
import { Button } from "@/components/ui/button";
import { listAdditionalDev } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";
import { AddDevGridContainer } from "./_components/AddDevGridContainer";

export const dynamic = "force-dynamic";

export default async function AddDevListPage() {
  const t = await getTranslations("AdditionalDev");
  const session = await requirePageSession(
    PERMISSIONS.ADDITIONAL_DEV_READ,
    "/dashboard?error=forbidden",
  );

  const result = await listAdditionalDev({
    workspaceId: session.workspaceId,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const canCreate = hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_CREATE);

  return (
    <PageShellFit
      title={t("title")}
      actions={
        canCreate ? (
          <Button asChild>
            <Link href="/add-dev/new">{t("newAddDev")}</Link>
          </Button>
        ) : null
      }
    >
      <AddDevGridContainer initial={result.data} total={result.pagination.total} />
    </PageShellFit>
  );
}
