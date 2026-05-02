import type { ColumnDef } from "@/components/grid/types";
import type { ProjectHistoryRow } from "@jarvis/shared/validation/project";

/**
 * Hidden:0|1 SoT: legacy projectHisMgr.jsp initdata1.Cols.
 * System columns (sNo, sDelete, sStatus) are omitted.
 *
 * etc1~etc5 — legacy free-form columns retained in the schema for round-trip
 * fidelity but removed from the grid (33 visible columns was beyond reasonable
 * UX). Power users can still query/edit via SQL or admin tooling. If a real
 * use case emerges, restore the rows below.
 *
 * workHours (DB: work_hours) — was named `bigo` in legacy Oracle TBIZ011 but
 * always carried "근무시간" semantics in JSP, verified by dump samples
 * ('08:00~17:00' …). Renamed at the schema level in migration 0067.
 *
 * JSP SaveName gaps:
 * - name has no row field; sabun remains the visible employee identifier.
 * - duration is derived in JSP; this grid keeps sdate/edate as editable source fields.
 * - mlist has no row field; module is the closest persisted text field.
 */
export const historyColumns: ColumnDef<ProjectHistoryRow>[] = [
  { key: "sabun", label: "사번", type: "text", width: 80, editable: true, required: true },
  { key: "orgCd", label: "소속", type: "select", width: 110, editable: true, required: true }, // codeGroup: ORG type 35
  { key: "custNm", label: "고객사명", type: "text", width: 160, editable: true },
  { key: "pjtNm", label: "프로젝트", type: "text", width: 180, editable: true, required: true },
  { key: "sdate", label: "시작일", type: "date", width: 110, editable: true },
  { key: "edate", label: "종료일", type: "date", width: 110, editable: true },
  { key: "statusCd", label: "수행상태", type: "select", width: 110, editable: true, required: true }, // codeGroup: B20010
  { key: "regNm", label: "지역", type: "text", width: 110, editable: true },
  { key: "roleCd", label: "역할", type: "select", width: 110, editable: true }, // codeGroup: B20000
  { key: "module", label: "모듈", type: "text", width: 150, editable: true },
  { key: "jobNm", label: "직무", type: "text", width: 120, editable: true },
  { key: "workHours", label: "근무시간", type: "textarea", width: 120, editable: true },
  { key: "memo", label: "특이사항", type: "textarea", width: 160, editable: true },
  { key: "custCd", label: "고객사코드", type: "text", width: 100, editable: true },
  { key: "pjtCd", label: "프로젝트 코드", type: "text", width: 110, editable: true },
  { key: "regCd", label: "지역 코드", type: "select", width: 100, editable: true }, // codeGroup: H20280
  { key: "deReg", label: "세부지역", type: "text", width: 110, editable: true },
  { key: "flist", label: "정규직", type: "text", width: 100, editable: true },
  { key: "plist", label: "외주", type: "text", width: 100, editable: true },
  {
    key: "rewardYn",
    label: "보상연차",
    type: "select",
    width: 100,
    editable: true,
    options: [
      { value: "Y", label: "Y" },
      { value: "N", label: "N" },
    ],
  },
  { key: "roleNm", label: "역할명", type: "text", width: 100, editable: true },
  { key: "jobCd", label: "직무코드", type: "text", width: 100, editable: true },
  { key: "beaconMcd", label: "비콘", type: "text", width: 120, editable: true },
  { key: "legacyEnterCd", label: "레거시 회사코드", type: "text", width: 110, editable: false },
  { key: "legacySabun", label: "레거시 사번", type: "text", width: 100, editable: false },
  { key: "legacyOrgCd", label: "레거시 소속", type: "text", width: 100, editable: false },
  { key: "legacyPjtCd", label: "레거시 프로젝트", type: "text", width: 120, editable: false },
  { key: "createdAt", label: "등록일자", type: "readonly", width: 150 },
  { key: "updatedAt", label: "수정일자", type: "readonly", width: 150 },
];

export const historyVisibleColumns = historyColumns.filter(
  (c) =>
    ![
      "custCd",
      "pjtCd",
      "regCd",
      "deReg",
      "flist",
      "plist",
      "rewardYn",
      "roleNm",
      "jobCd",
      "beaconMcd",
      "legacyEnterCd",
      "legacySabun",
      "legacyOrgCd",
      "legacyPjtCd",
      "createdAt",
      "updatedAt",
    ].includes(c.key),
);
