"use client";
import { useTranslations } from "next-intl";
import {
  CHAT_REACTION_EMOJIS,
  type ChatReactionEmoji
} from "@jarvis/shared/constants/chat";

export function ReactionPopover({
  onPick
}: {
  onPick: (emoji: ChatReactionEmoji) => void;
}) {
  const t = useTranslations("Dashboard.lounge");
  return (
    <div
      role="menu"
      aria-label={t("addReaction")}
      className="flex gap-1 rounded-lg border border-(--border-default) bg-(--bg-surface) px-2 py-1 shadow-sm"
    >
      {CHAT_REACTION_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="rounded px-1.5 py-0.5 text-base hover:bg-(--bg-surface)"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
