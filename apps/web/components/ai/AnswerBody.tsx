"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useAskWikiPanel } from "./AskWikiPanelContext";
import { buildCitationHref } from "@/lib/official-links";

const CITE = /\[\[([a-z0-9-]{1,240})\]\]/gi;

export function AnswerBody({ text, slugToPath }: { text: string; slugToPath: Record<string, string> }) {
  const parts = text.split(CITE);
  return (
    <div data-testid="answer-text" className="space-y-3 whitespace-pre-wrap text-sm text-[var(--fg-primary)]">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          const path = slugToPath[part];
          return path ? (
            <WikiCitationLink key={`${part}-${index}`} path={path} className="font-medium text-[var(--brand-primary)] underline">
              {part}
            </WikiCitationLink>
          ) : (
            `[[${part}]]`
          );
        }
        return <span key={index}>{part}</span>;
      })}
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
