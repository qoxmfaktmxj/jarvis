import { requirePageSession } from "@/lib/server/page-auth";
import {
  getActiveSeason,
  getCumulativeScore,
  getRemainingUnansweredCount,
  getTodayQuestionsForUser
} from "@/lib/queries/quiz";
import { QuizPlayClient } from "./_components/QuizPlayClient";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/patterns/PageShell";

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
    <PageShell
      title={t("title")}
      actions={
        <span className="text-xs text-(--fg-secondary)">
          {season?.name ?? t("noSeason")} · {t("cumulative", { score: cumulativeScore })}
        </span>
      }
    >
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
    </PageShell>
  );
}
