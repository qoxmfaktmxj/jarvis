import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getProjectDetail } from "@/lib/queries/projects";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  "on-hold": "secondary",
  completed: "outline",
  archived: "destructive"
};

function formatDate(value: string | null) {
  return value ?? "-";
}

export default async function ProjectOverviewPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations("Projects.detail");
  const session = await requirePageSession(PERMISSIONS.PROJECT_READ, "/projects");
  const { projectId } = await params;
  const project = await getProjectDetail({
    workspaceId: session.workspaceId,
    projectId
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Badge variant={statusVariant[project.status] ?? "default"}>
          {project.status}
        </Badge>
        <span className="text-sm text-surface-500">
          Start: {formatDate(project.startDate)}
        </span>
        <span className="text-sm text-surface-500">
          End: {formatDate(project.endDate)}
        </span>
      </div>

      <section>
        <SectionHeader title="Overview" />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("tasks")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-display text-3xl font-semibold text-surface-900">
                {project.taskCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("staff")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-display text-3xl font-semibold text-surface-900">
                {project.staffCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("inquiries")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-display text-3xl font-semibold text-surface-900">
                {project.inquiryCount}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title={t("summary")} />
        <Card>
          <CardContent className="py-5">
            <dl className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-sm font-medium text-surface-500">Project Code</dt>
                <dd className="font-mono text-sm text-surface-900">{project.code}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-sm font-medium text-surface-500">Workspace Status</dt>
                <dd className="text-sm text-surface-900">{project.status}</dd>
              </div>
              <div className="space-y-1 md:col-span-2">
                <dt className="text-sm font-medium text-surface-500">Description</dt>
                <dd className="text-sm leading-6 text-surface-700">
                  {project.description || "No project description has been added yet."}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
