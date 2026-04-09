import { getTranslations } from "next-intl/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { AttendanceSummaryWidget } from "./_components/AttendanceSummaryWidget";
import { MyTasksWidget } from "./_components/MyTasksWidget";
import { ProjectStatsWidget } from "./_components/ProjectStatsWidget";
import { QuickLinksWidget } from "./_components/QuickLinksWidget";
import { RecentActivityWidget } from "./_components/RecentActivityWidget";
import { SearchTrendsWidget } from "./_components/SearchTrendsWidget";
import { StalePagesWidget } from "./_components/StalePagesWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");
  const session = await requirePageSession();

  const data = await getDashboardData(
    session.workspaceId,
    session.userId,
    session.roles
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500">
          {t("welcome", { name: session.name })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <QuickLinksWidget items={data.quickLinks} />
        <RecentActivityWidget entries={data.recentActivity} />
        <MyTasksWidget tasks={data.myTasks} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ProjectStatsWidget stats={data.projectStats} />
        <StalePagesWidget pages={data.stalePages} />
        <SearchTrendsWidget trends={data.searchTrends} />
        <AttendanceSummaryWidget summary={data.attendanceSummary} />
      </div>
    </div>
  );
}
