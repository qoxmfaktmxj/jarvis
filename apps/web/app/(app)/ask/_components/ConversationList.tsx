import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ConversationSummary } from "@/lib/server/conversation-repository";

export async function ConversationList({
  rows,
  activeConversationId,
}: {
  rows: ConversationSummary[];
  activeConversationId?: string;
}) {
  const t = await getTranslations("Ask.Conversations");

  return (
    <aside className="hidden min-h-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-page)] md:flex">
      <div className="border-b border-[var(--border-default)] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">{t("title")}</p>
        <Link href="/ask" className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-[var(--bg-surface)]">
          {t("new")}
        </Link>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/ask/${row.id}`}
            aria-current={row.id === activeConversationId ? "page" : undefined}
            className={`block truncate rounded-md px-3 py-2 text-sm transition-colors ${
              row.id === activeConversationId
                ? "bg-[var(--bg-surface)] text-[var(--brand-primary)]"
                : "hover:bg-[var(--bg-surface)]"
            }`}
          >
            {row.title ?? t("untitled")}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
