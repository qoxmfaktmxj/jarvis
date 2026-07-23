"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useAskWikiPanel } from "./AskWikiPanelContext";
import { buildCitationHref } from "@/lib/official-links";

const WIKI_CITATION = /\[\[[a-z0-9-]{1,240}\]\]/gi;
const INTERNAL_SOURCE_CITATION = /(^|\s)(?:[a-z0-9][a-z0-9._-]{2,240}\s+)?\[source:[^\]\r\n]+\]/gim;
const INTERNAL_FACT_ID = /\s*\b(?:[a-z][a-z0-9]+(?:-[a-z0-9]+){2,}-f-[a-z0-9]+|fact-f-[a-z0-9]+)\b/gi;

export function stripInternalSourceCitations(text: string): string {
  return text
    .replace(INTERNAL_SOURCE_CITATION, "$1")
    .replace(WIKI_CITATION, "")
    .replace(INTERNAL_FACT_ID, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trimEnd();
}

export function AnswerBody({ text }: { text: string }) {
  return (
    <div data-testid="answer-text" className="space-y-3 whitespace-pre-wrap text-sm text-[var(--fg-primary)]">
      {stripInternalSourceCitations(text)}
    </div>
  );
}

export function WikiCitationLink({ path, className, children }: { path: string; className?: string; children: ReactNode }) {
  const panel = useAskWikiPanel();
  const [isDesktop, setIsDesktop] = useState(false);
  const href = buildCitationHref({ canonicalUrl: null, wikiPath: path });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!href) return <>{children}</>;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isDesktop || !panel.hasProvider || event.detail !== 1 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    panel.open(path);
  };
  return <Link href={href} className={className} onClick={onClick}>{children}</Link>;
}
