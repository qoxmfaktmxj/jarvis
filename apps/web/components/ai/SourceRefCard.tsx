import Link from "next/link";
import { buildCitationHref } from "@/lib/official-links";

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
  const href = buildCitationHref({
    canonicalUrl: source.canonicalUrl ?? null,
    wikiPath: source.wikiPath ?? null,
  });

  const content = (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-page)] p-3 text-sm">
      <p className="font-medium text-[var(--fg-primary)]">{source.title ?? source.label}</p>
      {source.locator ? (
        <p data-testid="citation-locator" className="mt-1 text-xs text-[var(--fg-secondary)]">
          {source.locator}
        </p>
      ) : null}
      {source.effectiveFrom ? <p className="mt-1 text-xs text-[var(--fg-muted)]">{source.effectiveFrom}</p> : null}
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

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
