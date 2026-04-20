import { notFound } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AddDevTabs } from "@/components/add-dev/AddDevTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getAdditionalDev } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function AddDevDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_READ, "/add-dev");
  const { id } = await params;

  const row = await getAdditionalDev({
    workspaceId: session.workspaceId,
    id,
  });

  if (!row) {
    notFound();
  }

  const title = [row.projectName, row.requestYearMonth].filter(Boolean).join(" · ") || "추가개발";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Add-Dev"
        title={title}
      />
      <AddDevTabs id={id} />
      <div>{children}</div>
    </div>
  );
}
