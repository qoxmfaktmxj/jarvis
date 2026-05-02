import type { ColumnDef } from "@/components/grid/types";
import type { SalesCloudPeopleCalcRow } from "@jarvis/shared/validation/sales-people";

type Labels = Partial<Record<keyof SalesCloudPeopleCalcRow & string, string>>;

const label = (labels: Labels, key: keyof SalesCloudPeopleCalcRow & string) => labels[key] ?? key;

export function getCloudPeopleCalcColumns(labels: Labels): ColumnDef<SalesCloudPeopleCalcRow>[] {
  return [
    { key: "legacyEnterCd", label: label(labels, "legacyEnterCd"), type: "text", width: 80, editable: false },
    { key: "contYear", label: label(labels, "contYear"), type: "text", width: 70, editable: false },
    { key: "contNo", label: label(labels, "contNo"), type: "text", width: 90, editable: false },
    { key: "contNm", label: label(labels, "contNm"), type: "readonly", width: 220 },
    { key: "pjtCode", label: label(labels, "pjtCode"), type: "readonly", width: 90 },
    { key: "pjtNm", label: label(labels, "pjtNm"), type: "readonly", width: 150 },
    { key: "companyCd", label: label(labels, "companyCd"), type: "readonly", width: 90 },
    { key: "companyNm", label: label(labels, "companyNm"), type: "readonly", width: 140 },
    { key: "ym", label: label(labels, "ym"), type: "text", width: 90, editable: false, required: true },
    { key: "reflYn", label: label(labels, "reflYn"), type: "text", width: 80, editable: true },
    { key: "personType", label: label(labels, "personType"), type: "text", width: 90, editable: false, required: true },
    { key: "calcType", label: label(labels, "calcType"), type: "text", width: 90, editable: true, required: true },
    { key: "monthAmt", label: label(labels, "monthAmt"), type: "numeric", width: 110, editable: false },
    { key: "personCnt", label: label(labels, "personCnt"), type: "numeric", width: 110, editable: true },
    { key: "totalAmt", label: label(labels, "totalAmt"), type: "numeric", width: 110, editable: true },
    { key: "note", label: label(labels, "note"), type: "textarea", width: 180, editable: true },
    { key: "seq", label: label(labels, "seq"), type: "readonly", width: 70 },
    { key: "reflId", label: label(labels, "reflId"), type: "text", width: 100, editable: true },
    { key: "reflDate", label: label(labels, "reflDate"), type: "readonly", width: 160 },
    { key: "updatedBy", label: label(labels, "updatedBy"), type: "readonly", width: 110 },
    { key: "updatedAt", label: label(labels, "updatedAt"), type: "readonly", width: 160 },
  ];
}

export const cloudPeopleCalcVisibleExportColumns: ColumnDef<SalesCloudPeopleCalcRow>[] = [
  { key: "contNm", label: "계약명", type: "text" },
  { key: "pjtNm", label: "프로젝트명", type: "text" },
  { key: "companyNm", label: "고객사명", type: "text" },
  { key: "ym", label: "년월", type: "text" },
  { key: "reflYn", label: "전표 처리여부", type: "text" },
  { key: "personType", label: "인원구분", type: "text" },
  { key: "calcType", label: "계산구분", type: "text" },
  { key: "monthAmt", label: "월단가", type: "numeric" },
  { key: "personCnt", label: "인원수", type: "numeric" },
  { key: "totalAmt", label: "총금액", type: "numeric" },
  { key: "note", label: "비고", type: "text" },
];
