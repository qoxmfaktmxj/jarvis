import Link from "next/link";
import { Clock3, MessageSquareText } from "lucide-react";
import type { ConversationSummary } from "@/lib/server/conversation-repository";
import { formatDateTimeKst } from "@/lib/format-date-time";

export function DashboardRecentConversations({
  rows,
  title,
  emptyLabel,
}: {
  rows: ConversationSummary[];
  title: string;
  emptyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquareText aria-hidden="true" className="h-4 w-4 text-[var(--brand-primary)]" />
        <h2 className="font-semibold text-[var(--fg-primary)]">{title}</h2>
      </div>
      {rows.length > 0 ? (
        <div className="divide-y divide-[var(--border-default)]">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/ask/${row.id}`}
              className="group flex items-center gap-3 py-3 first:pt-1 last:pb-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg-primary)] group-hover:text-[var(--brand-primary)]">
                {row.title || emptyLabel}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--fg-muted)]">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                {formatDateTimeKst(row.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-[var(--fg-secondary)]">{emptyLabel}</p>
      )}
    </section>
  );
}
