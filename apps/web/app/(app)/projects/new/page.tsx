import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectForm } from "@/components/project/ProjectForm";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function NewProjectPage() {
  const t = await getTranslations("Projects.create");
  await requirePageSession(PERMISSIONS.PROJECT_ADMIN, "/projects");

  return (
    <PageShell title={t("title")}>
      <ProjectForm mode="create" />
    </PageShell>
  );
}
