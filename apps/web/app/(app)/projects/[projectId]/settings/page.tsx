import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ArchiveProjectButton } from "@/components/project/ArchiveProjectButton";
import { ProjectForm } from "@/components/project/ProjectForm";
import { getProjectById } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(
    PERMISSIONS.PROJECT_UPDATE,
    "/projects"
  );
  const { projectId } = await params;
  const project = await getProjectById({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Project Settings</h2>
          <p className="text-sm text-gray-500">
            Update the metadata that appears across the workspace.
          </p>
        </div>
        <ProjectForm
          mode="edit"
          projectId={projectId}
          defaultValues={{
            code: project.code,
            name: project.name,
            description: project.description ?? "",
            status: project.status as "active" | "on-hold" | "completed" | "archived",
            startDate: project.startDate ?? "",
            endDate: project.endDate ?? ""
          }}
        />
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold text-rose-900">Danger Zone</h2>
          <p className="text-sm text-rose-700">
            Archiving keeps the record but removes it from the active project flow.
          </p>
        </div>
        <ArchiveProjectButton projectId={projectId} />
      </div>
    </div>
  );
}
