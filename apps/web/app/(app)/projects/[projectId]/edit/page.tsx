import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectForm } from "@/components/project/ProjectForm";
import { PageShell } from "@/components/patterns/PageShell";
import { getProject } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

function coerceStatus(value: string | null) {
  return value === "active" ||
    value === "deprecated" ||
    value === "decommissioned"
    ? value
    : "active";
}

export default async function EditProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_UPDATE, "/projects");
  const { projectId } = await params;
  const project = await getProject({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!project) {
    notFound();
  }

  return (
    <PageShell title="Edit Project">
      <ProjectForm
        mode="edit"
        projectId={projectId}
        defaultValues={{
          name: project.name,
          description: project.description ?? "",
          status: coerceStatus(project.status)
        }}
      />
    </PageShell>
  );
}
