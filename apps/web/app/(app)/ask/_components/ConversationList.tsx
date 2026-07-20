import Link from "next/link";
import type { ConversationSummary } from "@/lib/server/conversation-repository";

export function ConversationList({ rows }: { rows: ConversationSummary[] }) {
  return (
    <aside className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]">
      <Link href="/ask" className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-[var(--bg-surface)]">
        새 대화
      </Link>
      {rows.map((row) => (
        <Link key={row.id} href={`/ask/${row.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-surface)]">
          {row.title ?? "제목 없음"}
        </Link>
      ))}
    </aside>
  );
}
