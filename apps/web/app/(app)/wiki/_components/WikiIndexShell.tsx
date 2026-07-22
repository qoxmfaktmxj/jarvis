"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type WikiIndexRow = {
  id: string;
  title: string;
  path: string;
  href: string;
  snippet: string;
};

type WikiPanelPage = {
  title: string;
  path: string;
  body: string;
};

type WikiIndexShellProps = {
  rows: WikiIndexRow[];
  total: number;
  page: number;
  totalPages: number;
};

export function WikiIndexShell({ rows, total, page, totalPages }: WikiIndexShellProps) {
  const t = useTranslations("Wiki.Index");
  const [isDesktop, setIsDesktop] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [panelPage, setPanelPage] = useState<WikiPanelPage | null>(null);
  const [panelFailed, setPanelFailed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setPanelPage(null);
      setPanelFailed(false);
      return;
    }

    let cancelled = false;
    setPanelPage(null);
    setPanelFailed(false);
    void fetch(`/api/wiki/page?path=${encodeURIComponent(selectedPath)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("WIKI_PANEL_FETCH_FAILED");
        return response.json() as Promise<{ ok: boolean; page?: WikiPanelPage }>;
      })
      .then((result) => {
        if (!result.ok || !result.page) throw new Error("WIKI_PANEL_FETCH_FAILED");
        if (!cancelled) setPanelPage(result.page);
      })
      .catch(() => {
        if (!cancelled) setPanelFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const panelOpen = isDesktop && selectedPath !== null;
  const handleCardClick = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (!isDesktop || event.detail !== 1 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setSelectedPath(path);
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className={panelOpen ? "min-h-0 flex-1 overflow-y-auto lg:w-1/2" : "min-h-0 flex-1 overflow-y-auto"}>
        <div className="grid gap-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              onClick={(event) => handleCardClick(event, row.path)}
              className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]"
            >
              <h2 className="font-medium text-[var(--fg-primary)]">{row.title}</h2>
              <p className="mt-2 text-sm text-[var(--fg-secondary)]">{row.snippet}</p>
            </Link>
          ))}
        </div>
        <nav className="mt-4 flex items-center justify-between" aria-label={t("pageStatus", { page, totalPages })}>
          {page > 1 ? (
            <Link href={`/wiki?page=${page - 1}`} className="text-sm text-[var(--fg-primary)]">
              {t("previous")}
            </Link>
          ) : (
            <span aria-disabled="true" className="text-sm text-[var(--fg-muted)]">{t("previous")}</span>
          )}
          <span className="text-sm text-[var(--fg-secondary)]">{t("pageStatus", { page, totalPages, total })}</span>
          {page < totalPages ? (
            <Link href={`/wiki?page=${page + 1}`} className="text-sm text-[var(--fg-primary)]">
              {t("next")}
            </Link>
          ) : (
            <span aria-disabled="true" className="text-sm text-[var(--fg-muted)]">{t("next")}</span>
          )}
        </nav>
      </div>
      {panelOpen ? (
        <aside className="hidden min-h-0 w-1/2 border-l border-[var(--border-default)] lg:flex lg:flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
            <p className="truncate font-medium text-[var(--fg-primary)]">{panelPage?.title ?? selectedPath}</p>
            <button type="button" onClick={() => setSelectedPath(null)} aria-label={t("panelClose")} className="text-sm text-[var(--fg-secondary)]">
              {t("panelClose")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panelFailed ? <p role="alert" className="text-sm text-[var(--fg-secondary)]">{t("panelError")}</p> : null}
            {!panelFailed && !panelPage ? <p className="text-sm text-[var(--fg-secondary)]">{t("panelLoading")}</p> : null}
            {panelPage ? <article className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{panelPage.body}</ReactMarkdown></article> : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
