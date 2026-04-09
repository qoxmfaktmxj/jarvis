import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SystemForm } from "@/components/system/SystemForm";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function NewSystemPage() {
  const t = await getTranslations("Systems.create");
  await requirePageSession(PERMISSIONS.SYSTEM_CREATE, "/systems");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500">
          {t("description")}
        </p>
      </div>
      <SystemForm mode="create" />
    </div>
  );
}
