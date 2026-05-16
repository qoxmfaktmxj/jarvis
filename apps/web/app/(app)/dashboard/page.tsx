import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { requirePageSession } from "@/lib/server/page-auth";
import { listDashboardNotices } from "@/lib/queries/dashboard-notices";
import { listWeekVacations } from "@/lib/queries/dashboard-vacations";
import { listLatestWikiPages } from "@/lib/queries/dashboard-wiki";
import { pickWikiOfTheDay } from "@/lib/queries/dashboard-wiki-pick";
import { listRecentChatMessages } from "@/lib/queries/chat";
import { getDailySignals } from "@/lib/queries/dashboard-signals";
import { getNextHoliday } from "@/lib/queries/dashboard-dday";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageShellFit } from "@/components/patterns/PageShell";
import { pickMascotMood } from "@/lib/mascot-mood";
import { QuizCard } from "@/components/dashboard/QuizCard";
import { ForbiddenBanner } from "./_components/ForbiddenBanner";
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

  const t = await getTranslations("Dashboard");
  const mood = pickMascotMood(now);

  return (
    <PageShellFit
      header={
        // dashboard 한정 inline header — 인사 h1 옆에 mascot + mood (간격 6).
        // PageHeader 표준 30px h1 + 우측 actions(justify-between)로 두면 mascot이
        // 페이지 우측 끝으로 떨어져 의도(인사 옆)와 다름. PageShellFit `header`
        // prop으로 override해서 같은 라인에 inline. items-baseline + 32px mascot
        // 으로 row height을 표준 h1과 거의 동일(~37.5px)하게 유지.
        <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-(--fg-primary)">
            {t("greeting", { name: displayName })}
          </h1>
          <div className="mt-6 flex items-center gap-2">
            <Image
              src={`/capybara/${mood.id}.png`}
              alt=""
              width={32}
              height={32}
              priority
              unoptimized
              aria-hidden="true"
              className="shrink-0 object-contain"
            />
            <span className="text-[13px] text-(--fg-secondary)">{mood.message}</span>
          </div>
        </div>
      }
    >
      {showForbidden ? <ForbiddenBanner /> : null}
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
    </PageShellFit>
  );
}
