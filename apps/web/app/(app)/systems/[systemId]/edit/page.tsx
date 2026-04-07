import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SystemForm } from "@/components/system/SystemForm";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

function coerceCategory(value: string | null) {
  return value === "web" ||
    value === "db" ||
    value === "server" ||
    value === "network" ||
    value === "middleware"
    ? value
    : "";
}

function coerceEnvironment(value: string | null) {
  return value === "dev" || value === "staging" || value === "prod"
    ? value
    : "prod";
}

function coerceSensitivity(value: string | null) {
  return value === "PUBLIC" ||
    value === "INTERNAL" ||
    value === "RESTRICTED" ||
    value === "SECRET_REF_ONLY"
    ? value
    : "INTERNAL";
}

function coerceStatus(value: string | null) {
  return value === "active" ||
    value === "deprecated" ||
    value === "decommissioned"
    ? value
    : "active";
}

export default async function EditSystemPage({
  params
}: {
  params: Promise<{ systemId: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.SYSTEM_UPDATE, "/systems");
  const { systemId } = await params;
  const system = await getSystem({
    workspaceId: session.workspaceId,
    systemId
  });

  if (!system) {
    notFound();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">Edit System</h2>
        <p className="text-sm text-gray-500">
          Update metadata, ownership context, and linked operational resources.
        </p>
      </div>
      <SystemForm
        mode="edit"
        systemId={systemId}
        defaultValues={{
          name: system.name,
          category: coerceCategory(system.category),
          environment: coerceEnvironment(system.environment),
          description: system.description ?? "",
          techStack: system.techStack ?? "",
          repositoryUrl: system.repositoryUrl ?? "",
          dashboardUrl: system.dashboardUrl ?? "",
          sensitivity: coerceSensitivity(system.sensitivity),
          status: coerceStatus(system.status)
        }}
      />
    </div>
  );
}
