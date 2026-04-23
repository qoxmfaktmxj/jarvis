"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { ChatMessageRow, ReactionAggregate } from "@/lib/queries/chat";
import type { ChatReactionEmoji } from "@jarvis/shared/constants/chat";
import { sendMessage, deleteMessage, toggleReaction } from "@/app/actions/chat";
import { ChatMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";

type Message = ChatMessageRow & { reactions: ReactionAggregate[] };

export function LoungeChat({
  initial,
  viewerId,
  viewerName,
  viewerRole,
  isAdmin
}: {
  initial: Message[];
  viewerId: string;
  viewerName: string;
  viewerRole: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("Dashboard.lounge");
  const [messages, setMessages] = useState<Message[]>(initial);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: onlineData } = useSWR<{
    status: string;
    data: { count: number };
  }>("/api/chat/online", (u: string) => fetch(u).then((r) => r.json()), {
    refreshInterval: 30_000
  });
  const online = onlineData?.data?.count ?? 0;

  // SSE subscription
  useEffect(() => {
    const es = new EventSource("/api/chat/stream");
    es.addEventListener("message", (ev) => {
      const raw = JSON.parse(ev.data) as Omit<ChatMessageRow, "createdAt" | "deletedAt"> & {
        createdAt: string;
        deletedAt: string | null;
      };
      const row: ChatMessageRow = {
        ...raw,
        createdAt: new Date(raw.createdAt),
        deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : null
      };
      setMessages((prev) =>
        prev.some((m) => m.id === row.id)
          ? prev
          : [...prev, { ...row, reactions: [] }]
      );
    });
    es.addEventListener(
      "reaction",
      (ev) => {
        const { messageId, reactions } = JSON.parse(ev.data) as {
          messageId: string;
          reactions: ReactionAggregate[];
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
        );
      }
    );
    es.addEventListener("delete", (ev) => {
      const { id } = JSON.parse(ev.data) as { id: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, deletedAt: new Date() } : m
        )
      );
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function onSend(body: string) {
    await sendMessage({ body });
  }
  async function onReact(id: string, emoji: ChatReactionEmoji) {
    await toggleReaction({ messageId: id, emoji });
  }
  async function onDelete(id: string) {
    if (!confirm(t("delete") + "?")) return;
    await deleteMessage({ messageId: id });
  }

  return (
    <section className="flex h-[520px] flex-col rounded-xl border border-surface-200 bg-card">
      <header className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-surface-800">
            {t("title")}
          </div>
          <div className="text-xs text-surface-500">
            {t("subtitle", { online })}
          </div>
        </div>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-sm text-surface-500">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                msg={m}
                reactions={m.reactions}
                isMine={m.userId === viewerId}
                canDelete={m.userId === viewerId || isAdmin}
                onReact={(e) => void onReact(m.id, e)}
                onDelete={() => void onDelete(m.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <ChatComposer name={viewerName} role={viewerRole} onSend={onSend} />
    </section>
  );
}
