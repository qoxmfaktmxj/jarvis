import { requirePageSession } from "@/lib/server/page-auth";
import {
  getActiveSeason,
  getCumulativeScore,
  getRemainingUnansweredCount,
  getTodayQuestionsForUser
} from "@/lib/queries/quiz";
import { QuizPlayClient } from "./_components/QuizPlayClient";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function QuizPlayPage() {
  const session = await requirePageSession();
  const t = await getTranslations("Quiz.Play");
  const now = new Date();

  const [season, questions, remaining] = await Promise.all([
    getActiveSeason(session.workspaceId),
    getTodayQuestionsForUser(session.workspaceId, session.userId, now),
    getRemainingUnansweredCount(session.workspaceId, session.userId)
  ]);
  const cumulativeScore = season
    ? await getCumulativeScore(season.id, session.userId)
    : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-(--fg-primary)">
          {t("title")}
        </h1>
        <span className="text-xs text-(--fg-secondary)">
          {season?.name ?? t("noSeason")} · {t("cumulative", { score: cumulativeScore })}
        </span>
      </header>
      {questions.length === 0 ? (
        <section className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-6 text-center">
          <p className="text-sm text-(--fg-secondary)">
            {remaining === 0 ? t("emptyAllDone") : t("emptyToday")}
          </p>
        </section>
      ) : (
        <QuizPlayClient
          workspaceId={session.workspaceId}
          initialQuestions={questions}
          initialScore={cumulativeScore}
          seasonName={season?.name ?? null}
        />
      )}
    </div>
  );
}
