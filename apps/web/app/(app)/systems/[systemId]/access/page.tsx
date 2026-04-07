import { notFound } from "next/navigation";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AccessEntryForm } from "@/components/system/AccessEntryForm";
import { AccessPanel } from "@/components/system/AccessPanel";
import { getSystem, listSystemAccessEntries } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function SystemAccessPage({
  params
}: {
  params: Promise<{ systemId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.SYSTEM_READ, "/systems");
  const { systemId } = await params;
  const system = await getSystem({
    workspaceId: session.workspaceId,
    systemId
  });

  if (!system) {
    notFound();
  }

  const entries = await listSystemAccessEntries({
    workspaceId: session.workspaceId,
    systemId,
    sessionRoles: session.roles ?? [],
    sessionPermissions: session.permissions ?? []
  });

  if (!entries) {
    notFound();
  }

  const canManage = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">Access Registry</h2>
        <p className="text-sm text-gray-500">
          Secret-backed entries are resolved server-side and filtered by session role.
        </p>
      </div>

      {canManage ? <AccessEntryForm systemId={systemId} /> : null}
      <AccessPanel entries={entries} systemId={systemId} canManage={canManage} />
    </div>
  );
}
