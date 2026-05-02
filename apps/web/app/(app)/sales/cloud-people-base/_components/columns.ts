import type { ColumnDef } from "@/components/grid/types";
import type { SalesCloudPeopleBaseRow } from "@jarvis/shared/validation/sales-people";

type Labels = Partial<Record<keyof SalesCloudPeopleBaseRow & string, string>>;

const label = (labels: Labels, key: keyof SalesCloudPeopleBaseRow & string) => labels[key] ?? key;

export function getCloudPeopleBaseColumns(labels: Labels): ColumnDef<SalesCloudPeopleBaseRow>[] {
  return [
    { key: "legacyEnterCd", label: label(labels, "legacyEnterCd"), type: "text", width: 80, editable: false },
    { key: "contYear", label: label(labels, "contYear"), type: "text", width: 70, editable: false },
    { key: "contNo", label: label(labels, "contNo"), type: "text", width: 90, editable: false },
    { key: "contNm", label: label(labels, "contNm"), type: "readonly", width: 220 },
    { key: "pjtCode", label: label(labels, "pjtCode"), type: "text", width: 90, editable: false },
    { key: "pjtNm", label: label(labels, "pjtNm"), type: "readonly", width: 170 },
    { key: "companyCd", label: label(labels, "companyCd"), type: "text", width: 90, editable: false },
    { key: "companyNm", label: label(labels, "companyNm"), type: "readonly", width: 140 },
    { key: "personType", label: label(labels, "personType"), type: "text", width: 90, editable: true, required: true },
    { key: "calcType", label: label(labels, "calcType"), type: "text", width: 90, editable: true, required: true },
    { key: "sdate", label: label(labels, "sdate"), type: "date", width: 110, editable: false, required: true },
    { key: "edate", label: label(labels, "edate"), type: "date", width: 110, editable: false },
    { key: "monthAmt", label: label(labels, "monthAmt"), type: "numeric", width: 110, editable: true },
    { key: "note", label: label(labels, "note"), type: "textarea", width: 220, editable: true },
    { key: "seq", label: label(labels, "seq"), type: "readonly", width: 70 },
    { key: "updatedBy", label: label(labels, "updatedBy"), type: "readonly", width: 110 },
    { key: "updatedAt", label: label(labels, "updatedAt"), type: "readonly", width: 160 },
  ];
}

export const cloudPeopleBaseVisibleExportColumns: ColumnDef<SalesCloudPeopleBaseRow>[] = [
  { key: "contNm", label: "계약명", type: "text" },
  { key: "pjtCode", label: "프로젝트코드", type: "text" },
  { key: "pjtNm", label: "프로젝트명", type: "text" },
  { key: "companyCd", label: "고객코드", type: "text" },
  { key: "companyNm", label: "고객사명", type: "text" },
  { key: "personType", label: "인원구분", type: "text" },
  { key: "calcType", label: "계산구분", type: "text" },
  { key: "sdate", label: "계약시작일", type: "text" },
  { key: "edate", label: "계약종료일", type: "text" },
  { key: "monthAmt", label: "월단가", type: "numeric" },
  { key: "note", label: "비고", type: "text" },
];
