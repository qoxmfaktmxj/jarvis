"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// `userId` is the user table PK (uuid). Sales edit forms need it to populate
// uuid columns like `insUserId` / `attendeeUserId`. Without it the picker
// would only expose sabun (varchar) which would fail server-side uuid parsing.
export type EmployeeHit = { userId: string; sabun: string; name: string; email: string };

type Props = {
  value: string;
  onSelect: (hit: EmployeeHit) => void;
  search: (q: string, limit: number) => Promise<EmployeeHit[]>;
  placeholder?: string;
};

export function EmployeePicker({ value, onSelect, search, placeholder }: Props) {
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactId = useId();
  const listboxId = `employee-listbox-${reactId}`;

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
      if (hit) { onSelect(hit); setOpen(false); setText(hit.sabun); }
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
              key={h.sabun}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn("cursor-pointer px-2 py-1 text-[13px]", i === active && "bg-blue-100")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); onSelect(h); setOpen(false); setText(h.sabun); }}
            >
              <span className="font-mono">{h.sabun}</span>
              {" · "}
              <span>{h.name}</span>
              {" "}
              <span className="text-(--fg-muted)">({h.email})</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
