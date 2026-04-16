import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ArchiveProjectButton } from "@/components/project/ArchiveProjectButton";
import { ProjectForm } from "@/components/project/ProjectForm";
import { SectionHeader } from "@/components/patterns/SectionHeader";
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
      <section>
        <SectionHeader title="Project Settings" />
        <div className="rounded-xl border border-surface-200 bg-card p-6 shadow-sm">
          <p className="mb-6 text-sm text-surface-500">
            Update the metadata that appears across the workspace.
          </p>
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
      </section>

      <section>
        <SectionHeader title="Danger Zone" />
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <p className="mb-4 text-sm text-destructive">
            Archiving keeps the record but removes it from the active project flow.
          </p>
          <ArchiveProjectButton projectId={projectId} />
        </div>
      </section>
    </div>
  );
}
