import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { listAuditLogs } from "@/lib/server/repositories/audit";
import { AuditGridContainer } from "./_components/AuditGridContainer";

export default async function AuditPage() {
  const session = await requirePagePermission(PERMISSIONS.AUDIT_READ, "/admin/audit");
  const t = await getTranslations("Admin.Audit");
  const initial = await listAuditLogs({ workspaceId: session.workspaceId }, { page: 1, limit: 100 });
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <AuditGridContainer initialRows={initial.rows} total={initial.total} />
    </PageShell>
  );
}
