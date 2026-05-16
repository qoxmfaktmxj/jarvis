import { getTranslations } from "next-intl/server";
import { requirePageSession } from "@/lib/server/page-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { MonthlyReportContainer } from "./_components/MonthlyReportContainer";
import { PageShellFit } from "@/components/patterns/PageShell";

export default async function MonthlyReportsPage() {
  await requirePageSession(PERMISSIONS.MONTH_REPORT_READ, "/dashboard");
  const t = await getTranslations("Reports.Monthly");
  return (
    <PageShellFit title={t("title")}>
      <MonthlyReportContainer />
    </PageShellFit>
  );
}
