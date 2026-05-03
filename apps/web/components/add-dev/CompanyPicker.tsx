"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CompanyHit } from "@/lib/server/companies";

export type { CompanyHit };

type Props = {
  value: string; // 표시 텍스트
  onSelect: (hit: CompanyHit) => void;
  search: (q: string, limit: number) => Promise<CompanyHit[]>;
  placeholder?: string;
};

export function CompanyPicker({ value, onSelect, search, placeholder }: Props) {
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactId = useId();
  const listboxId = `company-listbox-${reactId}`;

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setText(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setHits([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await search(q, 10);
      setHits(r); setOpen(r.length > 0); setActive(-1);
    }, 250);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const idx = active < 0 ? 0 : active;
      const hit = hits[idx];
      if (hit) { onSelect(hit); setOpen(false); setText(hit.code); }
    } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listboxId}-opt-${active}` : undefined}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-7 w-full rounded border border-(--border-default) px-2 text-[13px]"
      />
      {open && hits.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border border-(--border-default) bg-(--bg-page) shadow-lg"
        >
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn("cursor-pointer px-2 py-1 text-[13px]", i === active && "bg-blue-100")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); onSelect(h); setOpen(false); setText(h.code); }}
            >
              <span className="font-mono">{h.code}</span>
              {" · "}
              <span>{h.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
