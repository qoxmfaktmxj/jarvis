import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { SystemTabs } from "@/components/system/SystemTabs";
import { getSystem } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function SystemDetailLayout({
  children,
  params
}: {
  children: React.ReactNode;
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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {system.name}
          </h1>
          {system.environment ? (
            <Badge variant="secondary">{system.environment}</Badge>
          ) : null}
          {system.category ? <Badge variant="outline">{system.category}</Badge> : null}
        </div>
        {system.description ? (
          <p className="text-sm text-gray-500">{system.description}</p>
        ) : null}
      </div>

      <SystemTabs systemId={systemId} />
      <div>{children}</div>
    </div>
  );
}
