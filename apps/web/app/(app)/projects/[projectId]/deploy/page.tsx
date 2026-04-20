import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function ProjectDeployPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations("Projects.detail");
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const project = await getProject({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!project) {
    notFound();
  }

  const canEdit = hasPermission(session, PERMISSIONS.PROJECT_UPDATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("deployGuide")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-surface-600">
        {project.knowledgePageId ? (
          <>
            <p>{t("deployLinked")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/knowledge/${project.knowledgePageId}`}>
                Open Knowledge Page
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p>
              No deployment guide is linked yet. Use the knowledge platform to connect a
              step-by-step release document for this project.
            </p>
            {canEdit ? (
              <Button asChild size="sm">
                <Link href={`/knowledge/new?projectId=${projectId}&type=deploy`}>
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
