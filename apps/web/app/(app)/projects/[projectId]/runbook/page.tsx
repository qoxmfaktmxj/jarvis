import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function SystemRunbookPage({
  params
}: {
  params: Promise<{ systemId: string }>;
}) {
  const t = await getTranslations("Systems.detail");
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
        <CardTitle>{t("runbook")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-surface-600">
        {system.knowledgePageId ? (
          <>
            <p>{t("runbookLinked")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/knowledge/${system.knowledgePageId}`}>
                Open Knowledge Page
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p>
              No runbook is linked yet. Connect incident response, recovery steps, and
              monitoring notes for this system.
            </p>
            {canEdit ? (
              <Button asChild size="sm">
                <Link href={`/knowledge/new?systemId=${systemId}&type=runbook`}>
                  Create Runbook
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
