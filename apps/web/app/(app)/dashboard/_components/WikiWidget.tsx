"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DashboardWikiRow } from "@/lib/queries/dashboard-wiki";

function rel(d: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type Tab = "latest" | "pick";

/**
 * WikiWidget — 위키 카드. [최신|오늘의 추천] 탭.
 *
 * 최신: 최근 게시된 N건. 추천: 오늘의 결정론적 random pick 1건.
 * Server Component(LatestWikiWidget)을 대체.
 */
export function WikiWidget({
  latest,
  pick,
  workspaceId,
  now: nowIso
}: {
  latest: DashboardWikiRow[];
  pick: DashboardWikiRow | null;
  workspaceId: string;
  /** ISO string — RSC에서 Date 직렬화 통과를 위해. */
  now: string;
}) {
  const t = useTranslations("Dashboard.latestWiki");
  const [tab, setTab] = useState<Tab>("latest");
  const now = new Date(nowIso);

  return (
    <section className="flex max-h-[320px] flex-col rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <div role="tablist" className="flex items-center gap-1 text-sm">
          <TabBtn active={tab === "latest"} onClick={() => setTab("latest")}>
            {t("title")}
          </TabBtn>
          <TabBtn active={tab === "pick"} onClick={() => setTab("pick")}>
            오늘의 추천
          </TabBtn>
        </div>
        <Link
          href="/wiki"
          className="text-xs text-(--fg-secondary) hover:text-(--brand-primary)"
        >
          {t("viewAll")} →
        </Link>
      </header>

      {tab === "latest" ? (
        <LatestList items={latest} workspaceId={workspaceId} now={now} />
      ) : (
        <PickPanel pick={pick} workspaceId={workspaceId} />
      )}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-(--brand-primary-bg) px-2 py-1 text-[13px] font-semibold text-(--brand-primary-text)"
          : "rounded-md px-2 py-1 text-[13px] font-medium text-(--fg-secondary) hover:bg-(--bg-page)"
      }
    >
      {children}
    </button>
  );
}

function LatestList({
  items,
  workspaceId,
  now
}: {
  items: DashboardWikiRow[];
  workspaceId: string;
  now: Date;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-(--fg-secondary)">최근 게시된 페이지가 없습니다.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {items.map((w) => (
        <li key={w.id} className="flex flex-col">
          <Link
            href={`/wiki/${workspaceId}/${w.path}`}
            className="truncate text-sm font-medium text-(--fg-primary) hover:text-(--brand-primary)"
          >
            {w.title}
          </Link>
          <div className="flex items-center gap-1 text-xs text-(--fg-secondary)">
            <span>
              {w.authorName} · {rel(w.createdAt, now)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PickPanel({
  pick,
  workspaceId
}: {
  pick: DashboardWikiRow | null;
  workspaceId: string;
}) {
  if (!pick) {
    return (
      <p className="text-sm text-(--fg-secondary)">
        추천할 위키 페이지가 아직 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/wiki/${workspaceId}/${pick.path}`}
        className="text-sm font-semibold text-(--fg-primary) hover:text-(--brand-primary)"
      >
        {pick.title}
      </Link>
      <p className="text-[12px] text-(--fg-muted)">
        매일 한 페이지씩 무작위로. 잠깐 둘러보고 가요.
      </p>
    </div>
  );
}
