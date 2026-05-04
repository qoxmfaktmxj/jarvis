import { getTranslations } from "next-intl/server";
import { requirePageSession } from "@/lib/server/page-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { MonthlyReportContainer } from "./_components/MonthlyReportContainer";

export default async function MonthlyReportsPage() {
  await requirePageSession(PERMISSIONS.MONTH_REPORT_READ, "/dashboard");
  const t = await getTranslations("Reports.Monthly");
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col p-4">
      <h1 className="mb-3 text-xl font-semibold text-slate-900">{t("title")}</h1>
      <MonthlyReportContainer />
    </div>
  );
}
