import type { ColumnDef } from "@/components/grid/types";
import type { ProjectModuleRow } from "@jarvis/shared/validation/project";

/**
 * Hidden:0|1 SoT: legacy projectModuleMgr.jsp initdata1.Cols.
 * System columns (sNo, sDelete, sStatus) are omitted.
 * JSP SaveName "name" has no Drizzle/Zod field; sabun remains the visible employee identifier.
 */
export const moduleColumns: ColumnDef<ProjectModuleRow>[] = [
  { key: "sabun", label: "사번", type: "text", width: 80, editable: true, required: true },
  { key: "pjtNm", label: "프로젝트", type: "text", width: 180, editable: true, required: true },
  { key: "moduleCd", label: "모듈", type: "select", width: 120, editable: true, required: true }, // codeGroup: B20020
  { key: "pjtCd", label: "프로젝트 코드", type: "text", width: 120, editable: true },
  { key: "moduleNm", label: "모듈명", type: "text", width: 140, editable: true },
  { key: "legacyEnterCd", label: "레거시 회사코드", type: "text", width: 110, editable: false },
  { key: "legacySabun", label: "레거시 사번", type: "text", width: 100, editable: false },
  { key: "legacyPjtCd", label: "레거시 프로젝트", type: "text", width: 120, editable: false },
  { key: "legacyModuleCd", label: "레거시 모듈", type: "text", width: 110, editable: false },
  { key: "createdAt", label: "등록일자", type: "readonly", width: 150 },
  { key: "updatedAt", label: "수정일자", type: "readonly", width: 150 },
];

export const moduleVisibleColumns = moduleColumns.filter(
  (c) =>
    ![
      "pjtCd",
      "moduleNm",
      "legacyEnterCd",
      "legacySabun",
      "legacyPjtCd",
      "legacyModuleCd",
      "createdAt",
      "updatedAt",
    ].includes(c.key),
);
