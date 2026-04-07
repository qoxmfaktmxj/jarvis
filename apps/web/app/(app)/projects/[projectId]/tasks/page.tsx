import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { TaskTable } from "@/components/project/TaskTable";
import { listProjectTasks, listWorkspaceUsers } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const [tasks, users] = await Promise.all([
    listProjectTasks({
      workspaceId: session.workspaceId,
      projectId
    }),
    listWorkspaceUsers({
      workspaceId: session.workspaceId
    })
  ]);

  if (!tasks) {
    notFound();
  }

  return <TaskTable projectId={projectId} items={tasks.data} assignees={users} />;
}
