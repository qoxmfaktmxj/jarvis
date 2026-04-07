import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <span className="text-sm text-gray-500">
          Start: {formatDate(project.startDate)}
        </span>
        <span className="text-sm text-gray-500">
          End: {formatDate(project.endDate)}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-gray-900">
              {project.taskCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Staff</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-gray-900">
              {project.staffCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inquiries</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-gray-900">
              {project.inquiryCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium text-gray-500">Project Code</dt>
              <dd className="font-mono text-sm text-gray-900">{project.code}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium text-gray-500">Workspace Status</dt>
              <dd className="text-sm text-gray-900">{project.status}</dd>
            </div>
            <div className="space-y-1 md:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="text-sm leading-6 text-gray-700">
                {project.description || "No project description has been added yet."}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
