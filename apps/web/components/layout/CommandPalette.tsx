"use client";

/**
 * CommandPalette — ⌘K 글로벌 네비게이션 + 퀵 액션
 *
 * 트리거: ⌘K / Ctrl+K / "/" (검색박스 포커스 없을 때).
 * 섹션: Navigate / Actions.
 * 퍼지 매칭(간이): 소문자 포함 비교.
 *
 * 데이터 소스: 상위 RSC(AppShell → Topbar)에서 `getVisibleMenuTree(session, "menu")`와
 * `getVisibleMenuTree(session, "action")` 결과를 props로 받는다. RBAC 필터링은 서버에서
 * 이미 완료된 상태이므로 여기서는 검색 필터링만 수행한다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveIcon } from "./icon-map";
import { useTabContext } from "./tabs/TabContext";
import { MAX_TABS } from "./tabs/tab-types";
import { isSafeInternalPath } from "@/lib/url";
import type { MenuTreeNode } from "@/lib/server/menu-tree";

type PaletteItem = {
  id: string;
  href: string;
  label: string;
  icon: ReturnType<typeof resolveIcon>;
  section: "navigate" | "actions";
  /**
   * Lower-cased "haystack" of [label, ...keywords] used by fuzzy filter.
   * Pre-joined so the filter avoids re-allocating per keystroke.
   */
  searchHaystack: string;
};

// `isSafeInternalPath` is imported from `@/lib/url` — the single source of
// truth for path safety, mirroring Sidebar.toRenderItem. Defense-in-depth
// against `javascript:` / `data:` URI injection via `menu_item.routePath`.

function toPaletteItem(node: MenuTreeNode, section: "navigate" | "actions"): PaletteItem | null {
  if (!isSafeInternalPath(node.routePath)) {
    if (node.routePath && process.env.NODE_ENV !== "production") {
      console.warn(
        `[CommandPalette] dropping action with unsafe routePath: code=${node.code} routePath=${JSON.stringify(node.routePath)}`,
      );
    }
    return null;
  }
  // Build a single lower-cased haystack from label + keywords. `\u0001` is a
  // non-printable separator that user input can't realistically contain, so
  // it prevents accidental cross-term matches (e.g. "ab" hitting label "a"
  // adjacent to keyword "b").
  const keywords = Array.isArray(node.keywords) ? node.keywords : [];
  const searchHaystack = [node.label, ...keywords]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\u0001")
    .toLowerCase();
  return {
    id: node.code,
    href: node.routePath,
    label: node.label,
    icon: resolveIcon(node.icon),
    section,
    searchHaystack,
  };
}

function flattenForPalette(
  nodes: MenuTreeNode[],
  section: "navigate" | "actions",
  out: PaletteItem[],
) {
  for (const n of nodes) {
    const item = toPaletteItem(n, section);
    if (item) out.push(item);
    if (n.children.length > 0) {
      flattenForPalette(n.children, section, out);
    }
  }
}

type Props = {
  menus: MenuTreeNode[];
  actions: MenuTreeNode[];
};

export function CommandPalette({ menus, actions }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const router = useRouter();
  const { openTab } = useTabContext();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMetaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash =
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement | null)?.isContentEditable;
      if (isMetaK || isSlash) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    flattenForPalette(menus, "navigate", out);
    flattenForPalette(actions, "actions", out);
    return out;
  }, [menus, actions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Match against label + keywords (pre-joined haystack). Items without
    // keywords still match by label because label is part of the haystack.
    return items.filter((it) => it.searchHaystack.includes(q));
  }, [items, query]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const bySection = useMemo(() => {
    const groups: Record<"navigate" | "actions", PaletteItem[]> = {
      navigate: [],
      actions: [],
    };
    filtered.forEach((it) => groups[it.section].push(it));
    return groups;
  }, [filtered]);

  const flat = useMemo(() => [...bySection.navigate, ...bySection.actions], [bySection]);

  /**
   * Client action dispatcher — handles routePaths of the shape `/_action/<id>`.
   *
   * Convention: the `_action` prefix is reserved (Next.js underscore convention
   * blocks the segment from being a real route), and isSafeInternalPath()
   * accepts it because it starts with `/`. Seed `menu_item.route_path` to
   * `/_action/logout` etc. to expose a non-route command in the palette.
   */
  const handleClientAction = useCallback(
    async (id: string) => {
      switch (id) {
        case "logout": {
          await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
          // Hard navigate so any in-memory cache (RSC, swr) is cleared.
          window.location.href = "/login";
          return;
        }
        case "reload": {
          router.refresh();
          return;
        }
        default: {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.warn(`[CommandPalette] unknown client action: ${id}`);
          }
        }
      }
    },
    [router],
  );

  const run = async (it: PaletteItem) => {
    setOpen(false);
    if (it.href.startsWith("/_action/")) {
      const id = it.href.slice("/_action/".length);
      await handleClientAction(id);
      return;
    }
    const ok = await openTab(it.href, it.label);
    if (ok) {
      router.push(it.href);
    } else if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[CommandPalette] openTab refused for ${it.href} — likely all ${MAX_TABS} tabs are pinned.`,
      );
    }
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && flat[activeIdx]) {
      e.preventDefault();
      const target = flat[activeIdx];
      if (target) void run(target);
    }
  };

  let runningIdx = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>

        <div className="flex items-center gap-3 border-b border-surface-200 px-4 py-3.5">
          <Search className="h-4 w-4 text-surface-400" aria-hidden />
          <input
            ref={(el) => {
              if (open && el) el.focus();
            }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDownList}
            placeholder="어디로 갈까요? 뭘 할까요?"
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {(["navigate", "actions"] as const).map((section) => {
            const list = bySection[section];
            if (list.length === 0) return null;
            return (
              <div key={section} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-surface-400">
                  {section === "navigate" ? "이동" : "빠른 작업"}
                </p>
                <ul>
                  {list.map((it) => {
                    runningIdx += 1;
                    const active = runningIdx === activeIdx;
                    const Icon = it.icon;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIdx(flat.indexOf(it))}
                          onClick={() => void run(it)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                            active ? "bg-isu-100 text-isu-900" : "text-surface-700 hover:bg-surface-50"
                          )}
                        >
                          <Icon
                            className={cn("h-4 w-4 shrink-0", active ? "text-isu-600" : "text-surface-400")}
                            aria-hidden
                          />
                          <span className="flex-1 text-sm font-medium">{it.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {flat.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-surface-500">
              {query.trim().length > 0
                ? <>&quot;{query}&quot;에 해당하는 결과가 없습니다.</>
                : "표시할 항목이 없습니다."}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-2 text-mono-xs text-surface-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-(--border-default) bg-(--bg-page) px-1.5 py-0.5">↑</kbd>
              <kbd className="rounded border border-(--border-default) bg-(--bg-page) px-1.5 py-0.5">↓</kbd>
              이동
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-(--border-default) bg-(--bg-page) px-1.5 py-0.5">↵</kbd>
              선택
            </span>
          </div>
          <span>Jarvis Command</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
