"use client";
/**
 * apps/web/app/(app)/admin/infra/licenses/_components/ModuleCheckboxGroup.tsx
 *
 * 22 모듈 boolean 컬럼 그룹 헤더 정의.
 * legacy ibSheet `licenseMgr.jsp` 의 `Header` 행 grouping을 재현.
 *
 * 본 헬퍼는 grid의 "추가 헤더 행"으로 렌더되는 group label 메타데이터만 제공.
 * 실제 셀은 InfraLicensesGrid가 EditableBooleanCell로 직접 렌더한다.
 *
 * 그룹핑 근거:
 *   사용자/관리      : emp / hr / org / edu
 *   급여/근태/복지    : pap / car / cpn / tim / ben
 *   포털/시스템       : app / eis / sys / year / board / wl / pds
 *   협업/보안/IDP    : idp / abhr / work / sec / doc / dis
 */
import type { ModuleBooleanKey } from "./useInfraLicensesGridState";

export type ModuleColumn = {
  key: ModuleBooleanKey;
  label: string;
};

export type ModuleGroup = {
  /** 그룹 헤더에 표시할 라벨 */
  label: string;
  /** 그룹에 속한 모듈 컬럼들 (순서가 그리드 표시 순서) */
  columns: ModuleColumn[];
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "사용자/관리",
    columns: [
      { key: "empYn", label: "직원" },
      { key: "hrYn", label: "인사" },
      { key: "orgYn", label: "조직" },
      { key: "eduYn", label: "교육" },
    ],
  },
  {
    label: "급여/근태/복지",
    columns: [
      { key: "papYn", label: "급여" },
      { key: "carYn", label: "차량" },
      { key: "cpnYn", label: "쿠폰" },
      { key: "timYn", label: "근태" },
      { key: "benYn", label: "복지" },
    ],
  },
  {
    label: "포털/시스템",
    columns: [
      { key: "appYn", label: "앱" },
      { key: "eisYn", label: "EIS" },
      { key: "sysYn", label: "시스템" },
      { key: "yearYn", label: "연말" },
      { key: "boardYn", label: "게시판" },
      { key: "wlYn", label: "WF" },
      { key: "pdsYn", label: "PDS" },
    ],
  },
  {
    label: "협업/보안/IDP",
    columns: [
      { key: "idpYn", label: "IDP" },
      { key: "abhrYn", label: "ABHR" },
      { key: "workYn", label: "워크" },
      { key: "secYn", label: "보안" },
      { key: "docYn", label: "문서" },
      { key: "disYn", label: "파견" },
    ],
  },
];

/** 22 모듈 컬럼을 평탄화한 순서 보장 리스트. */
export const MODULE_COLUMNS_FLAT: ModuleColumn[] = MODULE_GROUPS.flatMap((g) => g.columns);
