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
import { PageShell } from "@/components/patterns/PageShell";

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
        getCurrentLeaderboard(selectedId, session.workspaceId),
        getOrgLeaderboard(selectedId, session.workspaceId),
        active ? getCumulativeScore(active.id, session.userId) : Promise.resolve(0)
      ])
    : [[], [], 0];

  return (
    <PageShell
      title={t("title")}
      actions={
        <p className="text-sm text-(--fg-secondary)">
          {selectedName ?? t("noSeason")} ·{" "}
          {isActive
            ? t("activeLabel", { score: cumulativeScore })
            : t("frozenLabel")}
        </p>
      }
    >
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
    </PageShell>
  );
}
