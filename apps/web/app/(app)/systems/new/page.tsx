import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SystemForm } from "@/components/system/SystemForm";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function NewSystemPage() {
  const t = await getTranslations("Systems.create");
  await requirePageSession(PERMISSIONS.SYSTEM_CREATE, "/systems");

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Systems · New"
        title={t("title")}
        description={t("description")}
      />
      <SystemForm mode="create" />
    </div>
  );
}
