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

  useEffect(() => {
    setSelectedPath(null);
  }, [page]);

  const panelOpen = isDesktop && selectedPath !== null;
  const handleCardClick = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (!isDesktop || event.detail !== 1 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setSelectedPath(path);
  };

  const pageItems = paginationItems(page, totalPages);

  return (
    <div className={panelOpen ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]" : "grid gap-4"}>
      <section className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)]">
        <div className="divide-y divide-[var(--border-default)]">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              onClick={(event) => handleCardClick(event, row.path)}
              className="block px-5 py-4 transition-colors hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-inset"
            >
              <h2 className="truncate text-sm font-medium text-[var(--fg-primary)]">{row.title}</h2>
            </Link>
          ))}
        </div>
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3" aria-label={t("pageNav")}>
          {page > 1 ? (
            <Link href={`/wiki?page=${page - 1}`} className="rounded-md px-2 py-1 text-sm text-[var(--fg-primary)] hover:bg-[var(--bg-page)]">
              {t("previous")}
            </Link>
          ) : (
            <span aria-disabled="true" className="px-2 py-1 text-sm text-[var(--fg-muted)]">{t("previous")}</span>
          )}
          <div className="flex items-center gap-1" aria-label={t("pageStatus", { page, totalPages, total })}>
            {pageItems.map((item, index) => item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-sm text-[var(--fg-muted)]">…</span>
            ) : item === page ? (
              <span key={item} aria-current="page" className="rounded-md bg-[var(--brand-primary)] px-2.5 py-1 text-sm font-medium text-white">{item}</span>
            ) : (
              <Link key={item} href={`/wiki?page=${item}`} aria-label={t("pageNumber", { page: item })} className="rounded-md px-2.5 py-1 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-page)] hover:text-[var(--fg-primary)]">{item}</Link>
            ))}
          </div>
          {page < totalPages ? (
            <Link href={`/wiki?page=${page + 1}`} className="rounded-md px-2 py-1 text-sm text-[var(--fg-primary)] hover:bg-[var(--bg-page)]">
              {t("next")}
            </Link>
          ) : (
            <span aria-disabled="true" className="px-2 py-1 text-sm text-[var(--fg-muted)]">{t("next")}</span>
          )}
        </nav>
      </section>
      {panelOpen ? (
        <aside className="hidden overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-[var(--shadow-soft)] lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">{t("panelLabel")}</p>
              <p className="mt-1 truncate font-medium text-[var(--fg-primary)]">{panelPage?.title ?? selectedPath}</p>
            </div>
            <button type="button" onClick={() => setSelectedPath(null)} aria-label={t("panelClose")} className="rounded-md px-2 py-1 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)]">
              {t("panelClose")}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {panelFailed ? <p role="alert" className="text-sm text-[var(--fg-secondary)]">{t("panelError")}</p> : null}
            {!panelFailed && !panelPage ? <p className="text-sm text-[var(--fg-secondary)]">{t("panelLoading")}</p> : null}
            {panelPage ? <article className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{panelPage.body}</ReactMarkdown></article> : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function paginationItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (page >= totalPages - 3) return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", totalPages];
}
