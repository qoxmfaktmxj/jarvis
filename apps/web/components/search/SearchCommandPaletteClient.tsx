"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from "lucide-react";
import type { EvidenceSearchHit } from "@jarvis/search";
import { buildCitationHref } from "@/lib/official-links";

const OPEN_SEARCH_EVENT = "jarvis:open-search";
const SEARCH_DELAY_MS = 180;
const SEARCH_LIMIT = 8;

export type SearchCommandLabels = {
  dialogLabel: string;
  inputLabel: string;
  placeholder: string;
  empty: string;
  loading: string;
  results: string;
  close: string;
  shortcut: string;
  keyboardHint: string;
};

function resultHref(row: EvidenceSearchHit): string | null {
  return row.resourceType === "wiki" && row.path
    ? `/wiki/${row.path.replace(/\.md$/, "")}`
    : buildCitationHref({ canonicalUrl: row.canonicalUrl, wikiPath: row.path });
}

export function SearchCommandTrigger({ labels }: { labels: Pick<SearchCommandLabels, "inputLabel" | "shortcut"> }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      aria-label={labels.inputLabel}
      className="hidden h-9 w-80 items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] px-3 text-left text-[13px] text-[var(--fg-muted)] hover:border-[var(--border-focus)] md:flex"
    >
      <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{labels.inputLabel}</span>
      <kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] text-[var(--fg-secondary)]">{labels.shortcut}</kbd>
    </button>
  );
}

export function SearchCommandPaletteClient({ labels }: { labels: SearchCommandLabels }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<EvidenceSearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRows([]);
    setActiveIndex(0);
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, openPalette);
    };
  }, [openPalette]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=${SEARCH_LIMIT}`, {
          signal: controller.signal,
        });
        const payload = await response.json() as { rows?: EvidenceSearchHit[] };
        if (!response.ok) throw new Error("SEARCH_FAILED");
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setActiveIndex(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRows([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const openResult = useCallback((row: EvidenceSearchHit) => {
    const href = resultHref(row);
    if (!href) return;
    close();
    if (href.startsWith("http")) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  }, [close, router]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) openResult(row);
    }
  };

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      style={{ backgroundColor: "color-mix(in srgb, var(--fg-primary) 18%, transparent)" }}
      onMouseDown={close}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogLabel}
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-4 py-3">
          <Search aria-hidden="true" className="h-5 w-5 text-[var(--fg-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            aria-label={labels.inputLabel}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)]"
          />
          <button type="button" onClick={close} aria-label={labels.close} className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(58vh,34rem)] overflow-y-auto p-2">
          {query.trim() && isLoading ? <p className="px-3 py-5 text-sm text-[var(--fg-secondary)]">{labels.loading}</p> : null}
          {query.trim() && !isLoading && rows.length === 0 ? <p className="px-3 py-5 text-sm text-[var(--fg-secondary)]">{labels.empty}</p> : null}
          {rows.length > 0 ? (
            <ul role="listbox" aria-label={labels.results} className="space-y-1">
              {rows.map((row, index) => (
                <li key={`${row.resourceType}-${row.id}`} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onClick={() => openResult(row)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left ${index === activeIndex ? "bg-[var(--brand-primary-bg)]" : "hover:bg-[var(--bg-surface)]"}`}
                  >
                    <span className="block truncate text-sm font-medium text-[var(--fg-primary)]">{row.title}</span>
                    <span className="mt-1 block line-clamp-2 text-[12px] text-[var(--fg-secondary)]">{row.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--border-default)] px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          <span className="inline-flex items-center gap-1"><ArrowUp aria-hidden="true" className="h-3 w-3" /><ArrowDown aria-hidden="true" className="h-3 w-3" /><CornerDownLeft aria-hidden="true" className="ml-1 h-3 w-3" />{labels.keyboardHint}</span>
          <kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5">Esc</kbd>
        </footer>
      </section>
    </div>
  );
}
