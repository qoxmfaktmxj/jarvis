"use client";
import { useTranslations } from "next-intl";
import { MonthPicker } from "@/components/ui/MonthPicker";

const CATEGORIES = [
  { value: "H008", labelKey: "categories.h008" },
  { value: "H028", labelKey: "categories.h028" },
  { value: "H030", labelKey: "categories.h030" },
  { value: "H010", labelKey: "categories.h010" },
  { value: "H027", labelKey: "categories.h027" },
  { value: "H038", labelKey: "categories.h038" },
];

export interface ToolbarFilters {
  yyyymmFrom: string;
  yyyymmTo: string;
  categories: string[];
  cntRatio: number;
}

function toIso(yyyymm: string): string | null {
  if (!/^\d{6}$/.test(yyyymm)) return null;
  return `${yyyymm.substring(0, 4)}-${yyyymm.substring(4)}`;
}

function fromIso(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  return iso.replace("-", "");
}

interface Props {
  value: ToolbarFilters;
  onChange: (v: ToolbarFilters) => void;
}

export function StatsToolbar({ value, onChange }: Props) {
  const t = useTranslations("Maintenance.Stats.toolbar");
  const tCat = useTranslations("Maintenance.Stats");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <label className="flex items-center gap-2">
        <span>{t("from")}</span>
        <MonthPicker
          value={toIso(value.yyyymmFrom)}
          onChange={(next) =>
            onChange({ ...value, yyyymmFrom: fromIso(next, value.yyyymmFrom) })
          }
          ariaLabel={t("from")}
        />
      </label>
      <label className="flex items-center gap-2">
        <span>{t("to")}</span>
        <MonthPicker
          value={toIso(value.yyyymmTo)}
          onChange={(next) =>
            onChange({ ...value, yyyymmTo: fromIso(next, value.yyyymmTo) })
          }
          ariaLabel={t("to")}
        />
      </label>
      <fieldset className="flex items-center gap-1.5">
        <legend className="sr-only">{t("categories")}</legend>
        {CATEGORIES.map((c) => (
          <label key={c.value} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={value.categories.includes(c.value)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...value.categories, c.value]
                  : value.categories.filter((v) => v !== c.value);
                onChange({ ...value, categories: next });
              }}
            />
            <span>{tCat(c.labelKey)}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2">
        <span>{t("cntRatio", { value: value.cntRatio })}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.cntRatio}
          onChange={(e) => onChange({ ...value, cntRatio: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
