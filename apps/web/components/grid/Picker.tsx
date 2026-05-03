"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Generic combobox/picker baseline.
 *
 * EmployeePicker / CompanyPicker / future XxxPicker 들이 이 컴포넌트의
 * thin wrapper로 동작한다. 도메인 별로 search shape, item key, render,
 * commit-on-select 후 input 텍스트를 어떻게 채울지(displayValueOf)만
 * 다르며, 키보드/포커스/debounce/listbox 마크업은 모두 이 baseline에서 처리.
 *
 * 새 picker를 추가할 때:
 *   1) 도메인 hit 타입 정의 (예: ProjectHit)
 *   2) `<Picker<ProjectHit> ... />` wrapper 컴포넌트 export
 *   3) `itemKey`, `renderItem`, `displayValueOf` 3개 prop만 도메인 맞춤
 */
export type PickerProps<T> = {
  value: string;
  onSelect: (hit: T) => void;
  search: (q: string, limit: number) => Promise<T[]>;
  /** 각 hit의 unique key (React list key 용) */
  itemKey: (hit: T) => string;
  /** listbox row 렌더링 */
  renderItem: (hit: T) => ReactNode;
  /** select 후 input 텍스트로 채울 값 */
  displayValueOf: (hit: T) => string;
  placeholder?: string;
  /** 검색을 시작하는 최소 글자수 (기본 2). EmployeePicker = 2, CompanyPicker = 1 */
  minChars?: number;
  /** debounce ms (기본 250) */
  debounceMs?: number;
  /** listbox id prefix (a11y 충돌 방지). 미지정 시 자동 생성 */
  listboxIdPrefix?: string;
};

export function Picker<T>({
  value,
  onSelect,
  search,
  itemKey,
  renderItem,
  displayValueOf,
  placeholder,
  minChars = 2,
  debounceMs = 250,
  listboxIdPrefix = "picker",
}: PickerProps<T>) {
  const [text, setText] = useState(value);
  const [hits, setHits] = useState<T[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactId = useId();
  const listboxId = `${listboxIdPrefix}-listbox-${reactId}`;

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setText(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < minChars) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await search(q, 10);
      setHits(r);
      setOpen(r.length > 0);
      setActive(-1);
    }, debounceMs);
  }

  function commit(hit: T) {
    onSelect(hit);
    setOpen(false);
    setText(displayValueOf(hit));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = active < 0 ? 0 : active;
      const hit = hits[idx];
      if (hit) commit(hit);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${listboxId}-opt-${active}` : undefined
        }
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
              key={itemKey(h)}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "cursor-pointer px-2 py-1 text-[13px]",
                i === active && "bg-blue-100",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(h);
              }}
            >
              {renderItem(h)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
