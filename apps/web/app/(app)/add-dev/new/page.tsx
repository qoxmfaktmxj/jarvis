import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AddDevForm } from "@/components/add-dev/AddDevForm";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function AddDevNewPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations("AdditionalDev");
  await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_CREATE, "/add-dev");
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Add-Dev" title={t("newAddDev")} />
      <AddDevForm mode="create" initialProjectId={sp.projectId} />
    </div>
  );
}
