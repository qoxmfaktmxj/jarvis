"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";

type WikiPanelPage = { title: string; path: string; body: string };

export function AskWikiPanel({ path, onClose }: { path: string; onClose: () => void }) {
  const t = useTranslations("Ask.WikiPanel");
  const [page, setPage] = useState<WikiPanelPage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setFailed(false);
    void fetch(`/api/wiki/page?path=${encodeURIComponent(path)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("WIKI_PANEL_FETCH_FAILED");
        return response.json() as Promise<{ ok: boolean; page?: WikiPanelPage }>;
      })
      .then((result) => {
        if (!result.ok || !result.page) throw new Error("WIKI_PANEL_FETCH_FAILED");
        if (!cancelled) setPage(result.page);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <aside aria-label={t("panelLabel")} className="hidden min-h-0 w-1/2 flex-col border-l border-[var(--border-default)] lg:flex">
      <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
        <p className="truncate font-medium text-[var(--fg-primary)]">{page?.title ?? path}</p>
        <button type="button" onClick={onClose} aria-label={t("panelClose")} className="text-sm text-[var(--fg-secondary)]">
          {t("panelClose")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {failed ? <p role="alert" className="text-sm text-[var(--fg-secondary)]">{t("panelError")}</p> : null}
        {!failed && !page ? <p className="text-sm text-[var(--fg-secondary)]">{t("panelLoading")}</p> : null}
        {page ? <article className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{page.body}</ReactMarkdown></article> : null}
      </div>
    </aside>
  );
}
