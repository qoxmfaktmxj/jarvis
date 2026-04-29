"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChatMessageRow, ReactionAggregate } from "@/lib/queries/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";
import { ReactionPopover } from "./ReactionPopover";
import { ReactionChipRow } from "./ReactionChipRow";

export function ChatMessage({
  msg,
  reactions,
  isMine,
  canDelete,
  onReact,
  onDelete
}: {
  msg: ChatMessageRow;
  reactions: ReactionAggregate[];
  isMine: boolean;
  canDelete: boolean;
  onReact: (emoji: ChatReactionEmoji) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(msg.createdAt);
  const deleted = msg.deletedAt !== null;

  return (
    <li
      className="group relative flex gap-3 px-3 py-1.5 hover:bg-(--bg-surface)"
      onMouseLeave={() => setPopoverOpen(false)}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--bg-surface) text-xs font-semibold text-(--fg-primary)">
        {msg.userName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-(--fg-primary)">
            {msg.userName}
          </span>
          <span className="text-xs tabular-nums text-(--fg-muted)">{time}</span>
        </div>
        <p
          className={
            deleted
              ? "text-sm italic text-(--fg-muted)"
              : "whitespace-pre-wrap break-words text-sm text-(--fg-primary)"
          }
        >
          {deleted ? t("deleted") : msg.body}
        </p>
        {!deleted && (
          <ReactionChipRow
            reactions={reactions}
            onToggle={(e) => onReact(e)}
          />
        )}
      </div>
      {!deleted && (
        <div className="absolute right-3 top-1 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            className="rounded bg-(--bg-surface) px-2 py-0.5 text-xs shadow-sm hover:bg-(--bg-surface)"
            aria-label={t("addReaction")}
          >
            ＋
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded bg-(--bg-surface) px-2 py-0.5 text-xs text-(--fg-secondary) shadow-sm hover:bg-(--bg-surface)"
            >
              {t("delete")}
            </button>
          )}
        </div>
      )}
      {popoverOpen && (
        <div className="absolute right-3 top-8 z-10">
          <ReactionPopover
            onPick={(e) => {
              onReact(e);
              setPopoverOpen(false);
            }}
          />
        </div>
      )}
    </li>
  );
}
