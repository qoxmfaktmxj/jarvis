import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { StatsContainer } from "./_components/StatsContainer";

export default async function MaintenanceStatsPage() {
  await requirePermission(PERMISSIONS.MAINTENANCE_STATS_READ);
  const t = await getTranslations("Maintenance.Stats");

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
      <p className="text-sm text-slate-600">{t("description")}</p>
      <StatsContainer />
    </div>
  );
}
