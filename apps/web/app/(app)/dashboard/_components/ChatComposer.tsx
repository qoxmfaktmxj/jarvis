"use client";
import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { CHAT_MESSAGE_MAX_CHARS } from "@jarvis/shared/constants/chat";

export function ChatComposer({
  name,
  role,
  onSend
}: {
  name: string;
  role: string;
  onSend: (body: string) => Promise<void>;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-surface-200 px-3 py-2">
      <textarea
        value={value}
        maxLength={CHAT_MESSAGE_MAX_CHARS}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("composerPlaceholder", { name, role })}
        rows={1}
        className="min-h-[36px] flex-1 resize-none rounded-md border border-surface-200 bg-card px-3 py-1.5 text-sm focus:border-isu-300 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending || value.trim().length === 0}
        className="rounded-md bg-isu-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-surface-300"
      >
        {t("send")}
      </button>
    </div>
  );
}
