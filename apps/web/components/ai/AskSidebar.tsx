"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AskConversation } from "@jarvis/db/schema/ask-conversation";
import { MAX_CONVERSATIONS_PER_USER } from "@jarvis/shared/constants/ask";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AskSidebarDateGroup } from "./AskSidebarDateGroup";
import { AskSidebarItem } from "./AskSidebarItem";

interface AskSidebarProps {
  conversations: AskConversation[];
  currentConversationId?: string;
  conversationCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Date grouping                                                              */
/* -------------------------------------------------------------------------- */

interface DateGroup {
  label: string;
  conversations: AskConversation[];
}

interface DateBuckets {
  today: AskConversation[];
  yesterday: AskConversation[];
  last7Days: AskConversation[];
  last30Days: AskConversation[];
  older: AskConversation[];
}

function groupByDate(conversations: AskConversation[], labels: {
  today: string;
  yesterday: string;
  last7Days: string;
  last30Days: string;
  older: string;
}): DateGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 86_400_000);
  const startOf30Days = new Date(startOfToday.getTime() - 30 * 86_400_000);

  const buckets: DateBuckets = {
    today: [],
    yesterday: [],
    last7Days: [],
    last30Days: [],
    older: [],
  };

  for (const conv of conversations) {
    const ts = conv.lastMessageAt ?? conv.createdAt;
    const d = typeof ts === "string" ? new Date(ts) : ts;

    if (d >= startOfToday) {
      buckets.today.push(conv);
    } else if (d >= startOfYesterday) {
      buckets.yesterday.push(conv);
    } else if (d >= startOf7Days) {
      buckets.last7Days.push(conv);
    } else if (d >= startOf30Days) {
      buckets.last30Days.push(conv);
    } else {
      buckets.older.push(conv);
    }
  }

  const result: DateGroup[] = [];
  if (buckets.today.length > 0) result.push({ label: labels.today, conversations: buckets.today });
  if (buckets.yesterday.length > 0) result.push({ label: labels.yesterday, conversations: buckets.yesterday });
  if (buckets.last7Days.length > 0) result.push({ label: labels.last7Days, conversations: buckets.last7Days });
  if (buckets.last30Days.length > 0) result.push({ label: labels.last30Days, conversations: buckets.last30Days });
  if (buckets.older.length > 0) result.push({ label: labels.older, conversations: buckets.older });

  return result;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AskSidebar({
  conversations,
  currentConversationId: currentConversationIdProp,
  conversationCount,
}: AskSidebarProps) {
  const t = useTranslations("Ask.sidebar");
  const pathname = usePathname();

  // Derive active conversation from URL: /ask/{conversationId}
  const currentConversationId = currentConversationIdProp ?? (() => {
    const match = pathname.match(/^\/ask\/([0-9a-f-]{36})$/);
    return match?.[1];
  })();

  const dateLabels = useMemo(() => ({
    today: t("today"),
    yesterday: t("yesterday"),
    last7Days: t("last7Days"),
    last30Days: t("last30Days"),
    older: t("older"),
  }), [t]);

  const groups = useMemo(
    () => groupByDate(conversations, dateLabels),
    [conversations, dateLabels],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // debounce 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") clearSearch();
    },
    [clearSearch],
  );

  const filteredGroups = useMemo(() => {
    if (!debouncedQuery.trim()) return groups;
    const q = debouncedQuery.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        conversations: g.conversations.filter((c) =>
          (c.title ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.conversations.length > 0);
  }, [groups, debouncedQuery]);

  const isAtLimit = conversationCount >= MAX_CONVERSATIONS_PER_USER;
  const isWarning = conversationCount >= 16;

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-surface-200 bg-surface-50">
      {/* New conversation button */}
      <div className="p-3">
        <Link
          href="/ask"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-300 px-3 py-2 text-sm font-medium text-surface-700 transition-colors duration-150 ease-out",
            "hover:border-isu-300 hover:bg-isu-50 hover:text-isu-700",
          )}
        >
          <Plus className="h-4 w-4" />
          {t("newConversation")}
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search")}
            aria-label={t("search")}
            className="w-full rounded-md border border-surface-200 bg-card py-1.5 pl-8 pr-7 text-xs text-surface-800 placeholder:text-muted-foreground focus:border-isu-400 focus:outline-none focus:ring-1 focus:ring-isu-300"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label={t("clearSearch")}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin" role="listbox">
        {filteredGroups.length === 0 ? (
          debouncedQuery.trim() ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("noSearchResults")}</p>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("emptyDescription")}</p>
            </div>
          )
        ) : (
          filteredGroups.map((group) => (
            <AskSidebarDateGroup key={group.label} label={group.label}>
              {group.conversations.map((conv) => (
                <AskSidebarItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === currentConversationId}
                />
              ))}
            </AskSidebarDateGroup>
          ))
        )}
      </div>

      {/* Counter footer */}
      <div>
        <Separator />
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageSquare
            className={cn(
              "h-3.5 w-3.5",
              isWarning ? "text-amber-600" : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs",
              isWarning ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            {conversationCount} / {MAX_CONVERSATIONS_PER_USER}
          </span>
          {isAtLimit && (
            <span className="text-xs text-amber-600">
              {t("limitWarning")}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
