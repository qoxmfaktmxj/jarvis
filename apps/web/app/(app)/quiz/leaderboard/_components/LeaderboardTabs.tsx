"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type {
  LeaderboardEntry,
  OrgLeaderboardEntry
} from "@/lib/queries/quiz-leaderboard";

interface Props {
  activeSeasonId: string | null;
  activeSeasonName: string | null;
  pastSeasons: { id: string; name: string; endedAt: string }[];
  selectedId: string | null;
  individual: LeaderboardEntry[];
  organizations: OrgLeaderboardEntry[];
}

export function LeaderboardTabs({
  activeSeasonId,
  activeSeasonName,
  pastSeasons,
  selectedId,
  individual,
  organizations
}: Props) {
  const t = useTranslations("Quiz.Leaderboard");

  const tabs: { id: string | null; label: string }[] = [];
  if (activeSeasonId) {
    tabs.push({ id: activeSeasonId, label: activeSeasonName ?? t("currentSeason") });
  }
  for (const p of pastSeasons) {
    tabs.push({ id: p.id, label: p.name });
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 border-b border-(--border-default)">
        {tabs.map((tab) => {
          const selected = tab.id === selectedId;
          return (
            <Link
              key={tab.id}
              href={tab.id ? `/quiz/leaderboard?season=${tab.id}` : "/quiz/leaderboard"}
              className={`rounded-t-md px-3 py-1.5 text-sm transition ${
                selected
                  ? "border-b-2 border-(--brand-primary) text-(--fg-primary)"
                  : "text-(--fg-secondary) hover:text-(--fg-primary)"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--fg-primary)">
            {t("individualTitle")}
          </h2>
          {individual.length === 0 ? (
            <p className="text-sm text-(--fg-secondary)">{t("empty")}</p>
          ) : (
            <ol className="flex flex-col">
              {individual.map((row) => (
                <li
                  key={row.userId}
                  className="flex items-center justify-between border-b border-(--border-default) py-2 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm font-semibold text-(--fg-secondary)">
                      {row.rank}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-(--fg-primary)">
                        {row.userName}
                      </p>
                      <p className="text-xs text-(--fg-secondary)">
                        {row.orgName ?? "—"} ·{" "}
                        {t("attemptsLine", {
                          attempts: row.attempts,
                          correct: row.correct
                        })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-(--fg-primary)">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
          <h2 className="mb-3 text-sm font-semibold text-(--fg-primary)">
            {t("orgTitle")}
          </h2>
          {organizations.length === 0 ? (
            <p className="text-sm text-(--fg-secondary)">{t("empty")}</p>
          ) : (
            <ol className="flex flex-col">
              {organizations.map((row, i) => (
                <li
                  key={row.orgId}
                  className="flex items-center justify-between border-b border-(--border-default) py-2 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm font-semibold text-(--fg-secondary)">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-(--fg-primary)">
                        {row.orgName}
                      </p>
                      <p className="text-xs text-(--fg-secondary)">
                        {t("memberLine", { count: row.members })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-(--fg-primary)">
                    {row.averageScore}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
