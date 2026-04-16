import { getTranslations } from "next-intl/server";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { isoWeekNumber } from "@/lib/date-utils";
import { PageHeader } from "@/components/patterns/PageHeader";
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

  const week = isoWeekNumber(new Date());

  return (
    <div className="space-y-12">
      <PageHeader
        accent={`W${week}`}
        eyebrow="Dashboard"
        title={t("title")}
        description={t("welcome", { name: session.name })}
      />

      {/* Row 1 — QuickLinks as horizontal chip row (no card) */}
      <QuickLinksWidget items={data.quickLinks} />

      {/* Row 2 — Bento: HERO attendance (2/3) + ProjectStats (1/3) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceSummaryWidget summary={data.attendanceSummary} />
        </div>
        <ProjectStatsWidget stats={data.projectStats} />
      </section>

      {/* Row 3 — Recent activity (timeline, flow) + Search trends (bars, flow) */}
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-12">
        <div className="lg:col-span-3">
          <RecentActivityWidget entries={data.recentActivity} />
        </div>
        <div className="lg:col-span-2">
          <SearchTrendsWidget trends={data.searchTrends} />
        </div>
      </section>

      {/* Row 4 — Tasks + Stale pages, side-by-side flow sections */}
      <section className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:gap-12">
        <MyTasksWidget tasks={data.myTasks} />
        <StalePagesWidget pages={data.stalePages} />
      </section>
    </div>
  );
}
