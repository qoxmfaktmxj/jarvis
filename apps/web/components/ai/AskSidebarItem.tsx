"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AskConversation } from "@jarvis/db/schema/ask-conversation";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { deleteConversation, renameConversation } from "@/app/(app)/ask/actions";

interface AskSidebarItemProps {
  conversation: AskConversation;
  isActive: boolean;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
}

export function AskSidebarItem({
  conversation,
  isActive,
  onDelete,
  onRename,
}: AskSidebarItemProps) {
  const t = useTranslations("Ask.sidebar");
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "confirmDelete">("idle");
  const [renameValue, setRenameValue] = useState(conversation.title);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-cancel delete confirmation after 3 seconds
  useEffect(() => {
    if (mode === "confirmDelete") {
      timerRef.current = setTimeout(() => setMode("idle"), 3000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [mode]);

  // Focus input on rename
  useEffect(() => {
    if (mode === "rename") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode]);

  function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === conversation.title) {
      setMode("idle");
      setRenameValue(conversation.title);
      return;
    }
    startTransition(async () => {
      await renameConversation(conversation.id, trimmed);
      onRename?.(conversation.id, trimmed);
      setMode("idle");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteConversation(conversation.id);
      onDelete?.(conversation.id);
      if (isActive) {
        router.push("/ask");
      }
    });
  }

  // Inline delete confirmation
  if (mode === "confirmDelete") {
    return (
      <div
        role="alertdialog"
        className="mx-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
      >
        <p className="text-xs text-red-700">{t("deleteConfirm")}</p>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("idle")}
            className="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            {t("delete")}
          </button>
        </div>
      </div>
    );
  }

  // Inline rename mode
  if (mode === "rename") {
    return (
      <div className="mx-2 rounded-lg px-3 py-1.5">
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") {
              setMode("idle");
              setRenameValue(conversation.title);
            }
          }}
          onBlur={handleRenameSubmit}
          maxLength={200}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
          disabled={isPending}
        />
      </div>
    );
  }

  // Normal item
  const timestamp = conversation.lastMessageAt ?? conversation.createdAt;
  const timeLabel = formatRelativeTime(timestamp);

  return (
    <div className="group relative mx-1">
      <Link
        href={`/ask/${conversation.id}`}
        className={cn(
          "flex items-start gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out",
          isActive
            ? "bg-slate-200/70 font-medium"
            : "hover:bg-slate-100",
        )}
        aria-selected={isActive}
        aria-label={`${t("conversationLabel")}: ${conversation.title}, ${timeLabel}`}
      >
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{conversation.title}</p>
          <p className="text-[11px] text-muted-foreground">{timeLabel}</p>
        </div>
      </Link>

      {/* More menu - fade in on hover */}
      <div className="absolute right-1 top-1.5 opacity-0 transition-opacity duration-100 ease-out group-hover:opacity-100">
        <DropdownMenu
          align="end"
          trigger={
            <span className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-200">
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          }
        >
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(conversation.title);
              setMode("rename");
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setMode("confirmDelete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Relative time formatting                                                   */
/* -------------------------------------------------------------------------- */

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffHours < 48) {
    return "\uC5B4\uC81C"; // "어제"
  }
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
