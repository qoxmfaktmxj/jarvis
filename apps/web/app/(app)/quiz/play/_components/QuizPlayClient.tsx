"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type {
  QuizAnswerOutput,
  QuizQuestion
} from "@jarvis/shared/validation/quiz";

interface AnsweredState {
  output: QuizAnswerOutput;
  chosenIndex: number;
}

interface Props {
  workspaceId: string;
  initialQuestions: QuizQuestion[];
  initialScore: number;
  seasonName: string | null;
}

export function QuizPlayClient({
  workspaceId,
  initialQuestions,
  initialScore,
  seasonName: _seasonName
}: Props) {
  const t = useTranslations("Quiz.Play");
  const [questions] = useState(initialQuestions);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnsweredState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState(initialScore);
  const [error, setError] = useState<string | null>(null);

  const finished = index >= questions.length;
  const current = questions[index];
  const answered = current ? answers[current.id] : undefined;

  async function submit(chosenIndex: number) {
    if (!current || answered || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: current.id, chosenIndex })
      });
      if (!res.ok) {
        setError(t("submitError"));
        return;
      }
      const out = (await res.json()) as QuizAnswerOutput;
      setAnswers((prev) => ({ ...prev, [current.id]: { output: out, chosenIndex } }));
      setScore(out.newScore);
    } catch {
      setError(t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (finished) {
    const correctCount = Object.values(answers).filter((a) => a.output.correct)
      .length;
    const totalDelta = Object.values(answers).reduce(
      (sum, a) => sum + a.output.scoreDelta,
      0
    );
    return (
      <section className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-6">
        <h2 className="mb-2 text-lg font-semibold text-(--fg-primary)">
          {t("summaryTitle")}
        </h2>
        <p className="mb-4 text-sm text-(--fg-secondary)">
          {t("summaryBody", {
            correct: correctCount,
            total: questions.length,
            delta: totalDelta,
            score
          })}
        </p>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg border border-(--border-default) bg-(--bg-default) px-4 py-2 text-sm text-(--fg-primary) hover:bg-(--bg-hover)"
          >
            {t("backToDashboard")}
          </Link>
          <Link
            href="/quiz/leaderboard"
            className="rounded-lg bg-(--brand-primary) px-4 py-2 text-sm text-(--brand-primary-fg)"
          >
            {t("seeLeaderboard")}
          </Link>
        </div>
      </section>
    );
  }

  if (!current) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-(--fg-secondary)">
        <span>
          {t("progress", { current: index + 1, total: questions.length })}
        </span>
        <span>{t("difficulty." + current.difficulty)}</span>
      </div>
      <article className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-5">
        <h2 className="mb-4 text-base font-semibold text-(--fg-primary)">
          {current.question}
        </h2>
        <ul className="flex flex-col gap-2">
          {current.options.map((opt, i) => {
            const isChosen = answered?.chosenIndex === i;
            const isCorrectAnswer =
              answered && i === answered.output.answerIndex;
            const variant = answered
              ? isCorrectAnswer
                ? "border-emerald-500/70 bg-emerald-500/10 text-(--fg-primary)"
                : isChosen
                  ? "border-rose-500/70 bg-rose-500/10 text-(--fg-primary)"
                  : "border-(--border-default) bg-(--bg-default) text-(--fg-secondary)"
              : "border-(--border-default) bg-(--bg-default) hover:border-(--brand-primary) hover:bg-(--bg-hover)";
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition ${variant}`}
                  disabled={!!answered || submitting}
                  onClick={() => submit(i)}
                >
                  <span className="mr-2 text-xs font-semibold text-(--fg-secondary)">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
        {answered && (
          <div className="mt-4 rounded-lg border border-(--border-default) bg-(--bg-default) p-3 text-sm">
            <p className="mb-1 font-semibold text-(--fg-primary)">
              {answered.output.correct ? t("correct") : t("wrong")} ·{" "}
              {t("scoreDelta", { delta: answered.output.scoreDelta })}
            </p>
            {answered.output.explanation && (
              <p className="text-(--fg-secondary)">{answered.output.explanation}</p>
            )}
            <Link
              href={`/wiki/${workspaceId}/${answered.output.sourcePagePath}`}
              className="mt-2 inline-block text-xs text-(--brand-primary) hover:underline"
            >
              {t("viewSource")} →
            </Link>
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs text-rose-500">{error}</p>
        )}
      </article>
      <div className="flex items-center justify-between">
        <span className="text-xs text-(--fg-secondary)">
          {t("cumulative", { score })}
        </span>
        <button
          type="button"
          className="rounded-lg bg-(--brand-primary) px-4 py-2 text-sm text-(--brand-primary-fg) disabled:opacity-50"
          onClick={() => setIndex((i) => i + 1)}
          disabled={!answered}
        >
          {index === questions.length - 1 ? t("finish") : t("next")}
        </button>
      </div>
    </section>
  );
}
