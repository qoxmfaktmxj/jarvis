import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectForm } from "@/components/project/ProjectForm";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const t = await getTranslations("Projects.create");
  await requirePageSession(PERMISSIONS.PROJECT_CREATE, "/projects");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500">
          {t("description")}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <ProjectForm mode="create" />
      </div>
    </div>
  );
}
