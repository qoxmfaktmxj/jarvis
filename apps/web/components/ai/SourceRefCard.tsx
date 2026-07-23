"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { buildCitationHref } from "@/lib/official-links";
import { WikiCitationLink } from "./AnswerBody";

export type SourceRef = {
  kind: "wiki" | "source";
  label: string;
  title?: string;
  wikiPath?: string | null;
  canonicalUrl?: string | null;
  locator?: string;
  effectiveFrom?: string | null;
};

export function SourceRefCard({ source }: { source: SourceRef }) {
  const t = useTranslations("Ask.Sources");
  const href = source.wikiPath
    ? buildCitationHref({ canonicalUrl: null, wikiPath: source.wikiPath })
    : buildCitationHref({ canonicalUrl: source.canonicalUrl ?? null, wikiPath: null });

  const content = (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] p-3 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]">
        {source.kind === "wiki" ? t("wikiDocument") : t("sourceDocument")}
      </p>
      <p className="font-medium text-[var(--fg-primary)]">{source.title ?? source.label}</p>
      <p className="mt-1 text-xs text-[var(--fg-secondary)]">
        {source.effectiveFrom ? t("effectiveFrom", { date: formatDate(source.effectiveFrom) }) : t("openDocument")}
      </p>
      {href ? <p className="mt-2 text-xs font-medium text-[var(--brand-primary)]">{t("openDocument")} →</p> : null}
    </div>
  );

  if (!href) {
    return content;
  }

  if (href.startsWith("http")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {content}
      </a>
    );
  }

  if (source.wikiPath) {
    return <WikiCitationLink path={source.wikiPath} className="block">{content}</WikiCitationLink>;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${year}. ${month}. ${day}.`;
}
