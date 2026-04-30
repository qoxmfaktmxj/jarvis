"use client";
import { useTranslations } from "next-intl";

export type CompaniesFilters = {
  q?: string;
  objectDiv?: string;
  groupCode?: string;
  industryCode?: string;
  representCompany?: boolean;
};

export type Option = { value: string; label: string };

type Props = {
  filters: CompaniesFilters;
  onChange: (next: CompaniesFilters) => void;
  objectDivOptions: Option[];
  groupOptions: Option[];
  industryOptions: Option[];
};

export function ColumnFilterRow({
  filters,
  onChange,
  objectDivOptions,
  groupOptions,
  industryOptions,
}: Props) {
  const t = useTranslations("Admin.Companies.filters");
  return (
    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
      {/* No */}
      <td className="px-2 py-1" />
      {/* Delete checkbox column */}
      <td />
      {/* Status badge column */}
      <td />
      {/* objectDiv */}
      <td className="px-2 py-1">
        <select
          className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:ring-inset"
          value={filters.objectDiv ?? ""}
          onChange={(e) => onChange({ ...filters, objectDiv: e.target.value || undefined })}
        >
          <option value="">{t("all")}</option>
          {objectDivOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      {/* groupCode */}
      <td className="px-2 py-1">
        <select
          className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:ring-inset"
          value={filters.groupCode ?? ""}
          onChange={(e) => onChange({ ...filters, groupCode: e.target.value || undefined })}
        >
          <option value="">{t("all")}</option>
          {groupOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      {/* code + name combined search (q) */}
      <td colSpan={2} className="px-2 py-1">
        <input
          className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:ring-inset"
          placeholder="코드/회사명"
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        />
      </td>
      {/* representCompany */}
      <td className="px-2 py-1">
        <select
          className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:ring-inset"
          value={
            filters.representCompany === undefined
              ? ""
              : filters.representCompany
                ? "1"
                : "0"
          }
          onChange={(e) =>
            onChange({
              ...filters,
              representCompany:
                e.target.value === "" ? undefined : e.target.value === "1",
            })
          }
        >
          <option value="">{t("all")}</option>
          <option value="1">{t("representCompanyTrue")}</option>
          <option value="0">{t("representCompanyFalse")}</option>
        </select>
      </td>
      {/* startDate — no filter */}
      <td />
      {/* industryCode */}
      <td className="px-2 py-1">
        <select
          className="w-full bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:ring-inset"
          value={filters.industryCode ?? ""}
          onChange={(e) => onChange({ ...filters, industryCode: e.target.value || undefined })}
        >
          <option value="">{t("all")}</option>
          {industryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      {/* zip — no filter */}
      <td />
    </tr>
  );
}
