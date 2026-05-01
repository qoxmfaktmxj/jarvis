"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type CodeGroupItem = {
  code: string;
  label: string;
};

export type CodeGroupPopupLauncherProps = {
  triggerLabel: string;
  items: readonly CodeGroupItem[];
  onSelect: (item: CodeGroupItem) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

export function CodeGroupPopupLauncher({
  triggerLabel,
  items,
  onSelect,
  searchable = false,
  searchPlaceholder = "Search",
  emptyLabel = "No results",
}: CodeGroupPopupLauncherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered =
    searchable && query
      ? items.filter(
          (it) =>
            it.label.toLowerCase().includes(query.toLowerCase()) ||
            it.code.toLowerCase().includes(query.toLowerCase()),
        )
      : items;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => {
            setOpen(false);
            setQuery("");
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={triggerLabel}
            className="max-h-[60vh] w-80 overflow-auto rounded bg-white p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {searchable ? (
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-xs"
              />
            ) : null}
            <ul className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-slate-500">
                  {emptyLabel}
                </li>
              ) : (
                filtered.map((it) => (
                  <li key={it.code}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="block w-full justify-start text-left h-auto py-1.5 px-2"
                      onClick={() => {
                        onSelect(it);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="font-medium text-slate-900">
                        {it.label}
                      </span>
                      <span className="ml-2 text-slate-500">{it.code}</span>
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
