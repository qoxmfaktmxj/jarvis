import { notFound } from "next/navigation";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AccessEntryForm } from "@/components/project/AccessEntryForm";
import { AccessPanel } from "@/components/project/AccessPanel";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getProject, listProjectAccessEntries } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function ProjectAccessPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const project = await getProject({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!project) {
    notFound();
  }

  const entries = await listProjectAccessEntries({
    workspaceId: session.workspaceId,
    projectId,
    sessionRoles: session.roles ?? [],
    sessionPermissions: session.permissions ?? []
  });

  if (!entries) {
    notFound();
  }

  const canManage = hasPermission(session, PERMISSIONS.PROJECT_UPDATE);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="Access Registry" />
        <p className="text-sm text-surface-500">
          Secret-backed entries are resolved server-side and filtered by session role.
        </p>
      </div>

      {canManage ? <AccessEntryForm projectId={projectId} /> : null}
      <AccessPanel entries={entries} projectId={projectId} canManage={canManage} />
    </div>
  );
}
