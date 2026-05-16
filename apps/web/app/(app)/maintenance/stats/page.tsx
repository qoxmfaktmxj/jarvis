import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { StatsContainer } from "./_components/StatsContainer";
import { PageShell } from "@/components/patterns/PageShell";

export default async function MaintenanceStatsPage() {
  await requirePermission(PERMISSIONS.MAINTENANCE_READ);
  const t = await getTranslations("Maintenance.Stats");

  return (
    <PageShell title={t("title")}>
      <p className="text-sm text-slate-600">{t("description")}</p>
      <StatsContainer />
    </PageShell>
  );
}
