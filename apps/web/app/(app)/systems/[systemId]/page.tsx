import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function SystemOverviewPage({
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
    <div className="space-y-6">
      <SectionHeader title="System Overview">
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/systems/${systemId}/edit`}>Edit System</Link>
          </Button>
        ) : null}
      </SectionHeader>

      <Card>
        <CardContent className="py-5">
          <dl className="grid gap-4 text-sm md:grid-cols-[180px_1fr]">
            <dt className="font-medium text-surface-500">Status</dt>
            <dd>
              <Badge variant={system.status === "active" ? "success" : "warning"}>
                {system.status}
              </Badge>
            </dd>

            <dt className="font-medium text-surface-500">Sensitivity</dt>
            <dd>
              <Badge variant="outline">{system.sensitivity}</Badge>
            </dd>

            {system.description ? (
              <>
                <dt className="font-medium text-surface-500">Description</dt>
                <dd className="whitespace-pre-wrap text-surface-700">
                  {system.description}
                </dd>
              </>
            ) : null}

            {system.techStack ? (
              <>
                <dt className="font-medium text-surface-500">Tech Stack</dt>
                <dd className="text-surface-700">{system.techStack}</dd>
              </>
            ) : null}

            {system.repositoryUrl ? (
              <>
                <dt className="font-medium text-surface-500">Repository</dt>
                <dd>
                  <a
                    href={system.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-isu-600 hover:underline"
                  >
                    {system.repositoryUrl}
                  </a>
                </dd>
              </>
            ) : null}

            {system.dashboardUrl ? (
              <>
                <dt className="font-medium text-surface-500">Dashboard</dt>
                <dd>
                  <a
                    href={system.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-isu-600 hover:underline"
                  >
                    {system.dashboardUrl}
                  </a>
                </dd>
              </>
            ) : null}

            <dt className="font-medium text-surface-500">Created At</dt>
            <dd className="text-surface-700">
              {new Intl.DateTimeFormat("ko-KR", {
                dateStyle: "long",
                timeStyle: "short"
              }).format(new Date(system.createdAt))}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
