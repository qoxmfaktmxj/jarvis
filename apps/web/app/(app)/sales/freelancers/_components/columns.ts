import type { ColumnDef } from "@/components/grid/types";
import type { SalesFreelancerRow } from "@jarvis/shared/validation/sales-people";

type Labels = Partial<Record<keyof SalesFreelancerRow & string, string>>;

const label = (labels: Labels, key: keyof SalesFreelancerRow & string) => labels[key] ?? key;

export function getFreelancerColumns(labels: Labels): ColumnDef<SalesFreelancerRow>[] {
  return [
    { key: "legacyEnterCd", label: label(labels, "legacyEnterCd"), type: "text", width: 80, editable: false },
    { key: "sabun", label: label(labels, "sabun"), type: "text", width: 70, editable: false, required: true },
    { key: "name", label: label(labels, "name"), type: "text", width: 90, editable: true, required: true },
    { key: "pjtCd", label: label(labels, "pjtCd"), type: "text", width: 90, editable: false },
    { key: "pjtNm", label: label(labels, "pjtNm"), type: "text", width: 180, editable: true },
    { key: "sdate", label: label(labels, "sdate"), type: "date", width: 110, editable: true },
    { key: "edate", label: label(labels, "edate"), type: "date", width: 110, editable: true },
    { key: "resNo", label: label(labels, "resNo"), type: "text", width: 130, editable: true, required: true },
    { key: "addr", label: label(labels, "addr"), type: "text", width: 220, editable: true },
    { key: "tel", label: label(labels, "tel"), type: "text", width: 120, editable: true },
    { key: "mailId", label: label(labels, "mailId"), type: "text", width: 150, editable: true },
    { key: "belongYm", label: label(labels, "belongYm"), type: "text", width: 90, editable: false, required: true },
    { key: "businessCd", label: label(labels, "businessCd"), type: "text", width: 120, editable: false, required: true },
    { key: "totMon", label: label(labels, "totMon"), type: "numeric", width: 110, editable: true, required: true },
    { key: "updatedBy", label: label(labels, "updatedBy"), type: "readonly", width: 110 },
    { key: "updatedAt", label: label(labels, "updatedAt"), type: "readonly", width: 160 },
  ];
}

export const freelancerVisibleExportColumns: ColumnDef<SalesFreelancerRow>[] = [
  { key: "sabun", label: "사번", type: "text" },
  { key: "name", label: "성명", type: "text" },
  { key: "pjtNm", label: "프로젝트", type: "text" },
  { key: "sdate", label: "계약기간 시작일", type: "text" },
  { key: "edate", label: "계약기간 종료일", type: "text" },
  { key: "resNo", label: "주민번호", type: "text" },
  { key: "addr", label: "주소", type: "text" },
  { key: "tel", label: "연락처", type: "text" },
  { key: "mailId", label: "메일주소", type: "text" },
  { key: "belongYm", label: "귀속년월", type: "text" },
  { key: "businessCd", label: "업종코드", type: "text" },
  { key: "totMon", label: "지급총액", type: "numeric" },
];
