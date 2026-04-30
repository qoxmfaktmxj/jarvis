import { requirePageSession } from "@/lib/server/page-auth";
import { listDashboardNotices } from "@/lib/queries/dashboard-notices";
import { listWeekVacations } from "@/lib/queries/dashboard-vacations";
import { listLatestWikiPages } from "@/lib/queries/dashboard-wiki";
import { pickWikiOfTheDay } from "@/lib/queries/dashboard-wiki-pick";
import { listRecentChatMessages } from "@/lib/queries/chat";
import { getDailySignals } from "@/lib/queries/dashboard-signals";
import { getNextHoliday } from "@/lib/queries/dashboard-dday";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { QuizCard } from "@/components/dashboard/QuizCard";
import { HeroGreeting } from "./_components/HeroGreeting";
import { InfoCardRow } from "./_components/InfoCardRow";
import { LoungeChat } from "./_components/LoungeChat";
import { NoticesWidget } from "./_components/NoticesWidget";
import { VacationsWidget } from "./_components/VacationsWidget";
import { WikiWidget } from "./_components/WikiWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requirePageSession();
  const now = new Date();

  const [
    notices,
    vacations,
    latestWiki,
    wikiPick,
    chatInit,
    signals,
    nextHoliday
  ] = await Promise.all([
    listDashboardNotices(session.workspaceId, 5, now),
    listWeekVacations(session.workspaceId, now, 10),
    listLatestWikiPages(session.workspaceId, session.permissions, 10),
    pickWikiOfTheDay(session.workspaceId, session.permissions, now),
    listRecentChatMessages(session.workspaceId, session.userId, 50),
    getDailySignals(session.workspaceId, session.userId, now),
    getNextHoliday(session.workspaceId, now)
  ]);

  const viewerRole = session.roles[0] ?? "—";
  const isAdmin = session.permissions.includes(PERMISSIONS.ADMIN_ALL);
  const displayName = session.name || "사용자";

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 p-6">
      <HeroGreeting name={displayName} now={now} />
      <InfoCardRow now={now} signals={signals} nextHoliday={nextHoliday} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <LoungeChat
          initial={chatInit}
          viewerId={session.userId}
          viewerName={displayName}
          viewerRole={viewerRole}
          isAdmin={isAdmin}
        />
        <div className="flex flex-col gap-4">
          <NoticesWidget items={notices} now={now} />
          <VacationsWidget items={vacations} />
          <WikiWidget
            latest={latestWiki}
            pick={wikiPick}
            workspaceId={session.workspaceId}
            now={now.toISOString()}
          />
          <QuizCard
            workspaceId={session.workspaceId}
            userId={session.userId}
          />
        </div>
      </div>
    </div>
  );
}
