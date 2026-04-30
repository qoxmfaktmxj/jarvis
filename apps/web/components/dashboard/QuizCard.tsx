import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  getActiveSeason,
  getCumulativeScore,
  getRemainingUnansweredCount,
  getTodayQuestionsForUser
} from "@/lib/queries/quiz";

interface Props {
  workspaceId: string;
  userId: string;
}

/**
 * 대시보드 우측 컬럼용 카드. 서버 컴포넌트.
 * - 오늘의 chunk에 남은 N개 표시
 * - 누적 시즌 점수
 * - "5문제 풀기" CTA → /quiz/play
 * - 모두 풀었으면 empty state
 *
 * 통합은 dashboard/page.tsx에서 placeholder 자리에 import하여 배치.
 */
export async function QuizCard({ workspaceId, userId }: Props) {
  const t = await getTranslations("Quiz.Card");
  const now = new Date();

  const [season, todayQuestions, remainingPool] = await Promise.all([
    getActiveSeason(workspaceId),
    getTodayQuestionsForUser(workspaceId, userId, now),
    getRemainingUnansweredCount(workspaceId, userId)
  ]);
  const cumulativeScore = season
    ? await getCumulativeScore(season.id, userId)
    : 0;

  const empty = todayQuestions.length === 0;

  return (
    <section className="flex flex-col rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-(--fg-primary)">
          {t("title")}
        </h2>
        {season && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-(--fg-secondary)">
            {season.name}
          </span>
        )}
      </header>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-(--fg-primary)">
          {cumulativeScore}
        </span>
        <span className="text-xs text-(--fg-secondary)">
          {t("scoreSuffix")}
        </span>
      </div>
      {empty ? (
        <p className="text-xs text-(--fg-secondary)">
          {remainingPool === 0 ? t("emptyAllDone") : t("emptyToday")}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-(--fg-secondary)">
            {t("todayCount", { count: todayQuestions.length })}
          </p>
          <Link
            href="/quiz/play"
            className="rounded-lg bg-(--brand-primary) px-3 py-1.5 text-center text-sm font-medium text-(--brand-primary-fg) hover:opacity-90"
          >
            {t("cta")}
          </Link>
        </>
      )}
      <Link
        href="/quiz/leaderboard"
        className="mt-2 text-center text-[11px] text-(--fg-secondary) hover:text-(--brand-primary)"
      >
        {t("leaderboardLink")} →
      </Link>
    </section>
  );
}
