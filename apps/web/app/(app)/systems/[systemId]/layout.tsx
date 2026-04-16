import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { SystemTabs } from "@/components/system/SystemTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
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
      <PageHeader
        eyebrow="System"
        title={system.name}
        description={system.description ?? undefined}
        accent={system.name?.slice(0, 3).toUpperCase()}
        meta={
          <div className="flex items-center gap-2">
            {system.environment ? (
              <Badge variant="secondary">{system.environment}</Badge>
            ) : null}
            {system.category ? <Badge variant="outline">{system.category}</Badge> : null}
          </div>
        }
      />

      <SystemTabs systemId={systemId} />
      <div>{children}</div>
    </div>
  );
}
