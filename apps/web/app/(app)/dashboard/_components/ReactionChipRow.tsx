"use client";
import type { ReactionAggregate } from "@/lib/queries/chat";

export function ReactionChipRow({
  reactions,
  onToggle
}: {
  reactions: ReactionAggregate[];
  onToggle: (emoji: ReactionAggregate["emoji"]) => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          className={
            r.mine
              ? "inline-flex items-center gap-1 rounded-full border border-isu-300 bg-isu-50 px-2 py-0.5 text-xs text-isu-700"
              : "inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs text-surface-700"
          }
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
