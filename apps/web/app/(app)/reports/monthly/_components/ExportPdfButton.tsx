"use client";
import { useTranslations } from "next-intl";

interface Props {
  companyCd: string;
  ym: string;
  disabled?: boolean;
}

export function ExportPdfButton({ companyCd, ym, disabled }: Props) {
  const t = useTranslations("Reports.Monthly.pdf");
  const href = `/api/reports/monthly/${encodeURIComponent(companyCd)}/pdf?ym=${ym}`;

  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-400">
        {t("button")}
      </span>
    );
  }

  return (
    <a
      href={href}
      download
      className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
    >
      {t("button")}
    </a>
  );
}
