import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectForm } from "@/components/project/ProjectForm";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getProject } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

function coerceSensitivity(value: string | null) {
  return value === "PUBLIC" ||
    value === "INTERNAL" ||
    value === "RESTRICTED" ||
    value === "SECRET_REF_ONLY"
    ? value
    : "INTERNAL";
}

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
    <div className="max-w-3xl space-y-6">
      <div>
        <SectionHeader title="Edit Project" />
        <p className="text-sm text-surface-500">
          Update metadata, ownership context, and linked operational resources.
        </p>
      </div>
      <ProjectForm
        mode="edit"
        projectId={projectId}
        defaultValues={{
          name: project.name,
          description: project.description ?? "",
          sensitivity: coerceSensitivity(project.sensitivity),
          status: coerceStatus(project.status)
        }}
      />
    </div>
  );
}
