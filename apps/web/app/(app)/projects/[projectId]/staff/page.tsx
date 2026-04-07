import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { StaffTable } from "@/components/project/StaffTable";
import { listProjectStaff, listWorkspaceUsers } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function ProjectStaffPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const [staff, users] = await Promise.all([
    listProjectStaff({
      workspaceId: session.workspaceId,
      projectId
    }),
    listWorkspaceUsers({
      workspaceId: session.workspaceId
    })
  ]);

  if (!staff) {
    notFound();
  }

  return <StaffTable projectId={projectId} items={staff} userOptions={users} />;
}
