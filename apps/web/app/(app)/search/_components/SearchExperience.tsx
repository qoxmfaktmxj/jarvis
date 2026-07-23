"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { EvidenceSearchHit } from "@jarvis/search";
import { SearchResults } from "./SearchResults";

const SEARCH_DELAY_MS = 180;

export type SearchExperienceLabels = {
  inputLabel: string;
  placeholder: string;
  clear: string;
  loading: string;
  empty: string;
};

export function SearchExperience(props: {
  initialQuery: string;
  initialRows: EvidenceSearchHit[];
  labels: SearchExperienceLabels;
}) {
  const initialQuery = props.initialQuery.trim();
  const seededQuery = useRef(initialQuery);
  const [query, setQuery] = useState(props.initialQuery);
  const [rows, setRows] = useState(props.initialRows);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    if (seededQuery.current === term) {
      seededQuery.current = "";
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=20`, {
          signal: controller.signal,
        });
        const payload = await response.json() as { rows?: EvidenceSearchHit[] };
        if (!response.ok) throw new Error("SEARCH_FAILED");
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        const url = new URL(window.location.href);
        url.searchParams.set("q", term);
        window.history.replaceState(null, "", url);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] px-4 py-3 shadow-[var(--shadow-soft)] focus-within:border-[var(--border-focus)]">
        <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--fg-muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={props.labels.placeholder}
          aria-label={props.labels.inputLabel}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)]"
          autoFocus
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label={props.labels.clear} className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-[var(--fg-secondary)]">{props.labels.loading}</p> : null}
      {!isLoading && query.trim() && rows.length === 0 ? <p className="text-sm text-[var(--fg-secondary)]">{props.labels.empty}</p> : null}
      {rows.length > 0 ? <SearchResults rows={rows} /> : null}
    </div>
  );
}
