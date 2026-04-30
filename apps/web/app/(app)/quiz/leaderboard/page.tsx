import { requirePageSession } from "@/lib/server/page-auth";
import {
  getActiveSeason,
  getCumulativeScore
} from "@/lib/queries/quiz";
import {
  getCurrentLeaderboard,
  getOrgLeaderboard,
  listPastSeasons
} from "@/lib/queries/quiz-leaderboard";
import { LeaderboardTabs } from "./_components/LeaderboardTabs";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function QuizLeaderboardPage({ searchParams }: PageProps) {
  const session = await requirePageSession();
  const t = await getTranslations("Quiz.Leaderboard");
  const sp = await searchParams;

  const [active, pastSeasons] = await Promise.all([
    getActiveSeason(session.workspaceId),
    listPastSeasons(session.workspaceId, 6)
  ]);

  const selectedId = sp.season ?? active?.id ?? pastSeasons[0]?.id ?? null;
  const isActive = selectedId !== null && selectedId === active?.id;
  const selectedName = isActive
    ? active?.name
    : pastSeasons.find((p) => p.id === selectedId)?.name;

  const [individual, organizations, cumulativeScore] = selectedId
    ? await Promise.all([
        getCurrentLeaderboard(selectedId),
        getOrgLeaderboard(selectedId),
        active ? getCumulativeScore(active.id, session.userId) : Promise.resolve(0)
      ])
    : [[], [], 0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-(--fg-primary)">
          {t("title")}
        </h1>
        <p className="text-sm text-(--fg-secondary)">
          {selectedName ?? t("noSeason")} ·{" "}
          {isActive
            ? t("activeLabel", { score: cumulativeScore })
            : t("frozenLabel")}
        </p>
      </header>
      <LeaderboardTabs
        activeSeasonId={active?.id ?? null}
        activeSeasonName={active?.name ?? null}
        pastSeasons={pastSeasons.map((p) => ({
          id: p.id,
          name: p.name,
          endedAt: p.endedAt.toISOString()
        }))}
        selectedId={selectedId}
        individual={individual}
        organizations={organizations}
      />
    </div>
  );
}
