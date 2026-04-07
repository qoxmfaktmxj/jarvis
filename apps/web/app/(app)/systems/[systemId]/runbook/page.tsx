import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function SystemRunbookPage({
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

  const canEdit = hasPermission(session, PERMISSIONS.SYSTEM_UPDATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runbook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-600">
        {system.knowledgePageId ? (
          <>
            <p>Operational runbook content is linked from the knowledge platform.</p>
            <Link
              href={`/knowledge/${system.knowledgePageId}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 px-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Open Knowledge Page
            </Link>
          </>
        ) : (
          <>
            <p>
              No runbook is linked yet. Connect incident response, recovery steps, and
              monitoring notes for this system.
            </p>
            {canEdit ? (
              <Link
                href={`/knowledge/new?systemId=${systemId}&type=runbook`}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 font-medium text-white transition-colors hover:bg-blue-700"
              >
                Create Runbook
              </Link>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
