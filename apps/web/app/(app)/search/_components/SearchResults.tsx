import Link from "next/link";
import type { EvidenceSearchHit } from "@jarvis/search";
import { buildCitationHref } from "@/lib/official-links";

export function SearchResults({ rows }: { rows: EvidenceSearchHit[] }) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => {
        const href =
          row.resourceType === "wiki" && row.path
            ? `/wiki/${row.path.replace(/\.md$/, "")}`
            : buildCitationHref({ canonicalUrl: row.canonicalUrl, wikiPath: row.path });

        const content = (
          <article className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]">
            <h2 className="font-medium">{row.title}</h2>
            <p className="mt-2 text-sm text-[var(--fg-secondary)]">{row.snippet}</p>
          </article>
        );

        if (!href) {
          return <div key={`${row.resourceType}-${row.id}`}>{content}</div>;
        }

        if (href.startsWith("http")) {
          return (
            <a
              key={`${row.resourceType}-${row.id}`}
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={row.title}
            >
              {content}
            </a>
          );
        }

        return (
          <Link key={`${row.resourceType}-${row.id}`} href={href} aria-label={row.title}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
