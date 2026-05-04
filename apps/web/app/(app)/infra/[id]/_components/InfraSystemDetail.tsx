/**
 * apps/web/app/(app)/infra/[id]/_components/InfraSystemDetail.tsx
 *
 * 인프라 시스템 자산 정보 카드 (RSC).
 * Grid의 11+컬럼을 그대로 카드 형태로 보여준다.
 */
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { InfraSystemListItem } from "@/lib/queries/infra-system";

type Props = { row: InfraSystemListItem };

const ENV_LABELS: Record<string, string> = {
  prod: "운영",
  staging: "스테이징",
  dev: "개발",
  dr: "DR",
};

export async function InfraSystemDetail({ row }: Props) {
  const t = await getTranslations("Infra");

  const fields: { label: string; value: string | number | null }[] = [
    { label: t("columns.company"), value: row.companyName },
    { label: t("columns.systemName"), value: row.systemName },
    {
      label: t("columns.envType"),
      value: row.envType ? ENV_LABELS[row.envType] ?? row.envType : null,
    },
    { label: t("columns.dbType"), value: row.dbType },
    { label: t("columns.dbVersion"), value: row.dbVersion },
    { label: t("columns.osType"), value: row.osType },
    { label: t("columns.osVersion"), value: row.osVersion },
    { label: t("columns.domainAddr"), value: row.domainAddr },
    { label: t("columns.port"), value: row.port },
    { label: t("columns.connectMethod"), value: row.connectMethod },
    { label: t("columns.deployMethod"), value: row.deployMethod },
    { label: t("columns.deployFolder"), value: row.deployFolder },
    { label: t("columns.ownerName"), value: row.ownerName },
    { label: t("columns.ownerContact"), value: row.ownerContact },
    { label: t("columns.note"), value: row.note },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("Detail.asset")}
        </h2>
        {row.companyId ? (
          <Link
            href={`/admin/companies/${row.companyId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            {row.companyName ?? row.companyId}
          </Link>
        ) : null}
      </header>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {f.label}
            </dt>
            <dd className="mt-1 text-sm text-slate-900">
              {f.value !== null && f.value !== undefined && f.value !== ""
                ? String(f.value)
                : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
