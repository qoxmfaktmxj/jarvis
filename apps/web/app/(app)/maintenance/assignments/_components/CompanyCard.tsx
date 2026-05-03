"use client";

import { useTranslations } from "next-intl";
import type { MaintenanceAssignmentRow } from "@jarvis/shared/validation/maintenance";

type Props = {
  assignment: MaintenanceAssignmentRow;
};

export function CompanyCard({ assignment }: Props) {
  const t = useTranslations("Maintenance.Assignments.columns");

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-(--border-default) bg-(--bg-page) p-4 transition-shadow hover:shadow-(--shadow-flat)">
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-(--fg-primary)">
          {assignment.companyName ?? "—"}
        </h3>
        {assignment.contractType ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            {assignment.contractType}
          </span>
        ) : null}
      </header>

      <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-[12px]">
        {assignment.contractNumber ? (
          <>
            <dt className="text-(--fg-secondary)">{t("contractNumber")}</dt>
            <dd className="text-(--fg-primary)">{assignment.contractNumber}</dd>
          </>
        ) : null}
        <dt className="text-(--fg-secondary)">{t("startDate")}</dt>
        <dd className="text-(--fg-primary)">
          {assignment.startDate} ~ {assignment.endDate}
        </dd>
      </dl>

      {assignment.note ? (
        <p className="line-clamp-3 text-[12px] text-(--fg-secondary)">{assignment.note}</p>
      ) : null}
    </article>
  );
}
