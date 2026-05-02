import type { ColumnDef } from "@/components/grid/types";
import type { SalesPlanPerfRow } from "@jarvis/shared/validation/sales-charts";

type Labels = Partial<Record<keyof SalesPlanPerfRow & string, string>>;
const label = (labels: Labels, key: keyof SalesPlanPerfRow & string) => labels[key] ?? key;

export function getPlanPerfUploadColumns(labels: Labels): ColumnDef<SalesPlanPerfRow>[] {
  return [
    { key: "ym", label: label(labels, "ym"), type: "text", width: 90, editable: true, required: true },
    { key: "orgCd", label: label(labels, "orgCd"), type: "text", width: 100, editable: true, required: true },
    { key: "orgNm", label: label(labels, "orgNm"), type: "text", width: 160, editable: true, required: true },
    { key: "gubunCd", label: label(labels, "gubunCd"), type: "text", width: 110, editable: true, required: true },
    { key: "trendGbCd", label: label(labels, "trendGbCd"), type: "text", width: 130, editable: true, required: true },
    { key: "amt", label: label(labels, "amt"), type: "numeric", width: 130, editable: true, required: true },
    { key: "note", label: label(labels, "note"), type: "text", width: 220, editable: true },
    { key: "updatedBy", label: label(labels, "updatedBy"), type: "readonly", width: 100 },
    { key: "updatedAt", label: label(labels, "updatedAt"), type: "readonly", width: 160 },
  ];
}
