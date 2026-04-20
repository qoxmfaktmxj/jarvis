import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getProject } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function ProjectOverviewPage({
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

  const canEdit = hasPermission(session, PERMISSIONS.PROJECT_UPDATE);

  return (
    <div className="space-y-6">
      <SectionHeader title="Project Overview">
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/edit`}>Edit Project</Link>
          </Button>
        ) : null}
      </SectionHeader>

      <Card>
        <CardContent className="py-5">
          <dl className="grid gap-4 text-sm md:grid-cols-[180px_1fr]">
            <dt className="font-medium text-surface-500">Status</dt>
            <dd>
              <Badge variant={project.status === "active" ? "success" : "warning"}>
                {project.status}
              </Badge>
            </dd>

            <dt className="font-medium text-surface-500">Sensitivity</dt>
            <dd>
              <Badge variant="outline">{project.sensitivity}</Badge>
            </dd>

            {project.description ? (
              <>
                <dt className="font-medium text-surface-500">Description</dt>
                <dd className="whitespace-pre-wrap text-surface-700">
                  {project.description}
                </dd>
              </>
            ) : null}

            {project.prodDomainUrl ? (
              <>
                <dt className="font-medium text-surface-500">Prod URL</dt>
                <dd>
                  <a
                    href={project.prodDomainUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-isu-600 hover:underline"
                  >
                    {project.prodDomainUrl}
                  </a>
                </dd>
              </>
            ) : null}

            {project.devDomainUrl ? (
              <>
                <dt className="font-medium text-surface-500">Dev URL</dt>
                <dd>
                  <a
                    href={project.devDomainUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-isu-600 hover:underline"
                  >
                    {project.devDomainUrl}
                  </a>
                </dd>
              </>
            ) : null}

            <dt className="font-medium text-surface-500">Created At</dt>
            <dd className="text-surface-700">
              {new Intl.DateTimeFormat("ko-KR", {
                dateStyle: "long",
                timeStyle: "short"
              }).format(new Date(project.createdAt))}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
