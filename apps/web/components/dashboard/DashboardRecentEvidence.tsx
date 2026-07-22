import Link from "next/link";
import { ArrowUpRight, BookOpenText, Clock3 } from "lucide-react";
import type { WikiListItem } from "@/lib/server/wiki-page-loader";
import { wikiPathToRoute } from "@/lib/server/wiki-page-loader";
import { formatDateTimeKst } from "@/lib/format-date-time";

type EvidenceRow = WikiListItem & { typeLabel: string };

export function DashboardRecentEvidence({
  rows,
  title,
  emptyLabel,
}: {
  rows: EvidenceRow[];
  title: string;
  emptyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center gap-2">
        <BookOpenText aria-hidden="true" className="h-4 w-4 text-[var(--brand-primary)]" />
        <h2 className="font-semibold text-[var(--fg-primary)]">{title}</h2>
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-default)]">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={wikiPathToRoute(row.path)}
              className="group flex items-center gap-3 py-3 first:pt-1 last:pb-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--fg-primary)] group-hover:text-[var(--brand-primary)]">
                  {row.title}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                  <span>{row.typeLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1">
                    <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                    {formatDateTimeKst(row.updatedAt)}
                  </span>
                </span>
              </span>
              <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--fg-muted)] group-hover:text-[var(--brand-primary)]" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-[var(--fg-secondary)]">{emptyLabel}</p>
      )}
    </section>
  );
}
