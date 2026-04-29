"use client";

import { useState, useEffect } from "react";
import type { SourceRef } from "@jarvis/ai/types";
import { ClaimBadge } from "./ClaimBadge";
import { useWikiPanel } from "./WikiPanelContext";

export function WikiLink({
  workspaceId,
  slug,
  className,
  children,
}: {
  workspaceId: string;
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const panel = useWikiPanel();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLargeScreen(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  const href = `/wiki/${workspaceId}/${encodeURIComponent(slug)}`;
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!isLargeScreen || !panel.hasProvider) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        panel.open({ slug });
      }}
    >
      {children}
    </a>
  );
}

interface AnswerBodyProps {
  text: string;
  sources: SourceRef[];
  workspaceId: string;
}

/**
 * Single citation renderer used by both live streaming (AskPanel) and
 * history rendering (AnswerCard). Handles two formats:
 *   [source:N]   — legacy 1-based index
 *   [[slug]]     — Phase B3/B4 agent format, resolved against wiki-page sources
 */
export function AnswerBody({ text, sources, workspaceId }: AnswerBodyProps) {
  const slugToIndex = new Map<string, number>();
  sources.forEach((s, i) => {
    if (s.kind === "wiki-page") {
      slugToIndex.set(s.slug, i + 1);
    }
  });

  const parts = text.split(/(\[source:\d+\]|\[\[[^\]]+\]\])/g);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[--fg-primary]">
      {parts.map((part, index) => {
        const legacyMatch = part.match(/^\[source:(\d+)\]$/);
        if (legacyMatch?.[1]) {
          return (
            <ClaimBadge
              key={index}
              sourceNumber={parseInt(legacyMatch[1], 10)}
              sources={sources}
            />
          );
        }
        const wikilinkMatch = part.match(/^\[\[([^\]]+)\]\]$/);
        if (wikilinkMatch?.[1]) {
          const slug = wikilinkMatch[1];
          const sourceNumber = slugToIndex.get(slug);
          if (sourceNumber !== undefined) {
            return (
              <ClaimBadge
                key={index}
                sourceNumber={sourceNumber}
                sources={sources}
              />
            );
          }
          return (
            <WikiLink
              key={index}
              workspaceId={workspaceId}
              slug={slug}
              className="text-[--brand-primary-text] underline decoration-[--brand-primary-bg] underline-offset-2 hover:decoration-[--brand-primary]"
            >
              {slug}
            </WikiLink>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}
