import type { ColumnDef } from "@/components/grid/types";
import type { ProjectBeaconRow } from "@jarvis/shared/validation/project";

/**
 * Hidden:0|1 SoT: legacy beaconMgr.jsp initdata1.Cols.
 * System columns (sNo, sDelete, sStatus) are omitted.
 * JSP SaveName "name" has no Drizzle/Zod field; the UI keeps sabun visible as the owner handle.
 */
export const beaconColumns: ColumnDef<ProjectBeaconRow>[] = [
  { key: "beaconMcd", label: "비콘관리번호", type: "text", width: 120, editable: true, required: true },
  { key: "beaconSer", label: "비콘제품번호", type: "text", width: 140, editable: true, required: true },
  { key: "pjtNm", label: "반출프로젝트", type: "text", width: 180, editable: true },
  { key: "sdate", label: "시작일자", type: "date", width: 110, editable: true },
  { key: "edate", label: "종료일자", type: "date", width: 110, editable: true },
  { key: "sabun", label: "담당자/사번", type: "text", width: 110, editable: true, required: true },
  {
    key: "outYn",
    label: "반출여부",
    type: "select",
    width: 100,
    editable: true,
    required: true,
    options: [
      { value: "Y", label: "Y" },
      { value: "N", label: "N" },
    ],
  },
  { key: "bigo", label: "비고", type: "textarea", width: 180, editable: true },
  { key: "pjtCd", label: "반출프로젝트 코드", type: "text", width: 120, editable: true },
  { key: "legacyEnterCd", label: "레거시 회사코드", type: "text", width: 110, editable: false },
  { key: "legacyBeaconMcd", label: "레거시 비콘관리번호", type: "text", width: 140, editable: false },
  { key: "legacyBeaconSer", label: "레거시 비콘제품번호", type: "text", width: 140, editable: false },
  { key: "createdAt", label: "등록일자", type: "readonly", width: 150 },
  { key: "updatedAt", label: "수정일자", type: "readonly", width: 150 },
];

export const beaconVisibleColumns = beaconColumns.filter(
  (c) =>
    ![
      "pjtCd",
      "legacyEnterCd",
      "legacyBeaconMcd",
      "legacyBeaconSer",
      "createdAt",
      "updatedAt",
    ].includes(c.key),
);
