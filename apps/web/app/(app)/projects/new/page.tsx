import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectForm } from "@/components/project/ProjectForm";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const t = await getTranslations("Projects.create");
  await requirePageSession(PERMISSIONS.PROJECT_CREATE, "/projects");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Projects · New"
        title={t("title")}
        description={t("description")}
      />

      <div className="rounded-xl border border-surface-200 bg-card p-6 shadow-sm">
        <ProjectForm mode="create" />
      </div>
    </div>
  );
}
