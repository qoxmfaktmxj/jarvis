"use client";

/**
 * CommandPalette — ⌘K 글로벌 네비게이션 + 퀵 액션
 *
 * 트리거: ⌘K / Ctrl+K / "/" (검색박스 포커스 없을 때).
 * 섹션: Navigate / Actions / Recent.
 * 퍼지 매칭(간이): 소문자 포함 비교, 알파벳 순서 유지.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, ACTION_ITEMS, type NavItem, type ActionItem } from "@/lib/routes";

type PaletteItem = (NavItem | ActionItem) & {
  section: "navigate" | "actions";
};

function toPaletteItems(): PaletteItem[] {
  return [
    ...NAV_ITEMS.map((n) => ({ ...n, section: "navigate" as const })),
    ...ACTION_ITEMS.map((a) => ({ ...a, section: "actions" as const })),
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const router = useRouter();

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

  const items = useMemo(() => toPaletteItems(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [it.label, it.description ?? "", ...(it.keywords ?? [])]
        .join(" ").toLowerCase();
      return hay.includes(q);
    });
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

  const run = (it: PaletteItem) => {
    if (it.href) router.push(it.href);
    setOpen(false);
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && flat[activeIdx]) { e.preventDefault(); run(flat[activeIdx]); }
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
                          onClick={() => run(it)}
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
                          {it.description ? (
                            <span className="truncate text-xs text-surface-400">{it.description}</span>
                          ) : null}
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
              &quot;{query}&quot;에 해당하는 결과가 없습니다.
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-2 text-mono-xs text-surface-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-surface-200 bg-white px-1.5 py-0.5">↑</kbd>
              <kbd className="rounded border border-surface-200 bg-white px-1.5 py-0.5">↓</kbd>
              이동
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-surface-200 bg-white px-1.5 py-0.5">↵</kbd>
              선택
            </span>
          </div>
          <span>Jarvis Command</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
