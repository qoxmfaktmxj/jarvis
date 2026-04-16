import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
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
      <PageHeader
        eyebrow="Project"
        title={project.name}
        description={project.code}
        accent={project.code?.slice(0, 3).toUpperCase()}
      />

      <ProjectTabs projectId={projectId} />
      <div>{children}</div>
    </div>
  );
}
