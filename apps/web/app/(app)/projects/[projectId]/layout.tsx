import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { getProjectById } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ProjectDetailLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
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
      <div className="space-y-1">
        <p className="font-mono text-xs text-gray-500">{project.code}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {project.name}
        </h1>
      </div>

      <ProjectTabs projectId={projectId} />
      <div>{children}</div>
    </div>
  );
}
