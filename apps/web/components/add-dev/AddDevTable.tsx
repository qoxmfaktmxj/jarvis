"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type AddDevRow = {
  id: string;
  requestYearMonth: string | null;
  projectName: string | null;
  customerCompanyName: string | null;
  part: string | null;
  requesterName: string | null;
  status: string;
  contractAmount: string | null;
  pmId: string | null;
  pmName: string | null;
  pmSabun: string | null;
  updatedAt: Date;
};

const statusVariant = (status: string): "success" | "warning" | "outline" => {
  if (status === "완료") return "success";
  if (status === "보류") return "warning";
  return "outline";
};

export function AddDevTable({ data }: { data: AddDevRow[] }) {
  const t = useTranslations("AdditionalDev.fields");
  const tRoot = useTranslations("AdditionalDev");

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-surface-500">{tRoot("empty")}</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-surface-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-[13px] text-surface-600">
          <tr>
            <th className="px-3 py-2 text-left">{t("requestYearMonth")}</th>
            <th className="px-3 py-2 text-left">{t("customerCompany")}</th>
            <th className="px-3 py-2 text-left">{t("projectName")}</th>
            <th className="px-3 py-2 text-left">{t("part")}</th>
            <th className="px-3 py-2 text-left">{t("requesterName")}</th>
            <th className="px-3 py-2 text-left">{t("status")}</th>
            <th className="px-3 py-2 text-right">{t("contractAmount")}</th>
            <th className="px-3 py-2 text-left">{t("pm")}</th>
            <th className="px-3 py-2 text-left">{t("updatedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50">
              <td className="px-3 py-2 font-mono text-xs">{r.requestYearMonth ?? "—"}</td>
              <td className="px-3 py-2">{r.customerCompanyName ?? "—"}</td>
              <td className="px-3 py-2">
                <Link href={`/add-dev/${r.id}`} className="text-isu-600 hover:underline">
                  {r.projectName ?? "—"}
                </Link>
              </td>
              <td className="px-3 py-2">{r.part ?? "—"}</td>
              <td className="px-3 py-2">{r.requesterName ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
              </td>
              <td className="px-3 py-2 text-right text-xs">
                {r.contractAmount
                  ? new Intl.NumberFormat("ko-KR").format(Number(r.contractAmount))
                  : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {r.pmName ? `${r.pmSabun} · ${r.pmName}` : (r.pmId ?? "—")}
              </td>
              <td className="px-3 py-2 text-xs text-surface-500">
                {new Intl.DateTimeFormat("ko-KR", { dateStyle: "short" }).format(
                  new Date(r.updatedAt),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
