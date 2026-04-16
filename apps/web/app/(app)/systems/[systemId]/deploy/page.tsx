import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function SystemDeployPage({
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
        <CardTitle>{t("deployGuide")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-surface-600">
        {system.knowledgePageId ? (
          <>
            <p>{t("deployLinked")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/knowledge/${system.knowledgePageId}`}>
                Open Knowledge Page
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p>
              No deployment guide is linked yet. Use the knowledge platform to connect a
              step-by-step release document for this system.
            </p>
            {canEdit ? (
              <Button asChild size="sm">
                <Link href={`/knowledge/new?systemId=${systemId}&type=deploy`}>
                  Create Deploy Guide
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
