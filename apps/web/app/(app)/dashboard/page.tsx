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
import { ForbiddenBanner } from "./_components/ForbiddenBanner";
import { HeroGreeting } from "./_components/HeroGreeting";
import { InfoCardRow } from "./_components/InfoCardRow";
import { LoungeChat } from "./_components/LoungeChat";
import { NoticesWidget } from "./_components/NoticesWidget";
import { VacationsWidget } from "./_components/VacationsWidget";
import { WikiWidget } from "./_components/WikiWidget";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requirePageSession();
  const sp = await searchParams;
  const showForbidden = sp.error === "forbidden";
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
    // AppShellMain wrapper가 h-full viewport-fit 영역을 제공하므로 페이지는
    // 그 안에서 h-full만 받으면 됨 (별도 calc 불필요, 2026-05-16 전역 프레임 전환).
    // `overflow-hidden` — 페이지 자체 스크롤 차단, 내부 위젯만 스크롤.
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {showForbidden ? <ForbiddenBanner /> : null}
      <HeroGreeting name={displayName} now={now} />
      {/*
        2x2 viewport-fit grid:
          row 1: InfoCardRow (3-up: Today/DDay/FX)  | VacationsWidget
          row 2: LoungeChat (fills, internal scroll) | Notices/Wiki/Quiz stack
        Row 1 = auto (intrinsic height of top cards, ≥140px). Row 2 = fills rest.
        Right col bottom stack ratio: 20/40/40 (Notices / Wiki / Quiz).
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(140px,auto)_minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <InfoCardRow now={now} signals={signals} nextHoliday={nextHoliday} />
        <VacationsWidget items={vacations} />
        <LoungeChat
          initial={chatInit}
          viewerId={session.userId}
          viewerName={displayName}
          viewerRole={viewerRole}
          isAdmin={isAdmin}
        />
        <div className="grid min-h-0 grid-rows-[1fr_2fr_2fr] gap-3">
          <NoticesWidget items={notices} now={now} />
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
