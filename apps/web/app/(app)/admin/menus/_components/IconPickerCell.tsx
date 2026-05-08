"use client";
/**
 * apps/web/app/(app)/admin/menus/_components/IconPickerCell.tsx
 *
 * 메뉴 마스터 그리드의 아이콘 선택 셀.
 *
 * - 트리거 버튼은 현재 선택된 lucide 아이콘 미리보기 + 이름을 노출.
 * - Popover에 검색 가능한 그리드 형태로 lucide 아이콘 썸네일 + 이름을 표시.
 * - "지우기" 버튼으로 null로 되돌릴 수 있다 (필수 아닌 컬럼).
 *
 * 사유: 기본 `<select>`는 lucide 아이콘 시각 정보를 제공할 수 없어 운영자가
 * 어떤 아이콘인지 모른 채 이름만 보고 골라야 했다. 본 셀은 admin/menus 전용.
 * 향후 다른 도메인에서도 아이콘 선택이 필요해지면 `apps/web/components/grid/cells/`
 * 로 승격 가능.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { resolveIcon } from "@/components/layout/icon-map";

type IconOption = { value: string; label: string };

type Props = {
  value: string | null;
  options: IconOption[];
  onCommit: (next: string | null) => void;
};

export function IconPickerCell({ value, options, onCommit }: Props) {
  const t = useTranslations("Admin.Menus.masterSection.iconPicker");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const SelectedIcon = resolveIcon(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ?? t("empty")}
          className="flex h-full w-full items-center gap-1.5 px-2 text-left text-[13px] text-(--fg-primary) outline-none transition-shadow duration-150 focus:bg-(--bg-page) focus:ring-2 focus:ring-(--border-focus) focus:ring-inset"
        >
          <SelectedIcon
            className={`h-4 w-4 shrink-0 ${value ? "text-slate-700" : "text-slate-300"}`}
            aria-hidden
          />
          <span
            className={`truncate ${value ? "text-slate-900" : "text-slate-400"}`}
          >
            {value ?? t("empty")}
          </span>
          <ChevronDown
            className="ml-auto h-3 w-3 shrink-0 text-slate-400"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[300px] p-2"
        onOpenAutoFocus={(e) => {
          // Keep focus inside the popover but on the search input, not the trigger.
          e.preventDefault();
          const el = document.getElementById("icon-picker-search");
          if (el instanceof HTMLInputElement) el.focus();
        }}
      >
        <input
          id="icon-picker-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="mb-2 h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
        />
        <button
          type="button"
          onClick={() => {
            onCommit(null);
            setOpen(false);
          }}
          className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-600 transition-colors hover:bg-slate-100"
        >
          <span className="text-slate-400">—</span>
          <span>{t("clear")}</span>
        </button>
        <div className="max-h-[260px] overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-center text-[12px] text-slate-500">
              {t("noResults")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {filtered.map((opt) => {
                const Icon = resolveIcon(opt.value);
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onCommit(opt.value);
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-slate-100 ${
                      selected
                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                        : "text-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
