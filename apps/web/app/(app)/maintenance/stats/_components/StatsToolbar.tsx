"use client";
import { useTranslations } from "next-intl";

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

function fmtMonthInput(yyyymm: string): string {
  return `${yyyymm.substring(0, 4)}-${yyyymm.substring(4)}`;
}

function parseMonthInput(v: string): string {
  return v.replace("-", "");
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
        <input
          type="month"
          value={fmtMonthInput(value.yyyymmFrom)}
          onChange={(e) => onChange({ ...value, yyyymmFrom: parseMonthInput(e.target.value) })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2">
        <span>{t("to")}</span>
        <input
          type="month"
          value={fmtMonthInput(value.yyyymmTo)}
          onChange={(e) => onChange({ ...value, yyyymmTo: parseMonthInput(e.target.value) })}
          className="rounded border border-slate-300 px-2 py-1"
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
