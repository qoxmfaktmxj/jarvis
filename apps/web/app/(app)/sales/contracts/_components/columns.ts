/**
 * apps/web/app/(app)/sales/contracts/_components/columns.ts
 *
 * ColumnDef[] for salesContract (TBIZ030).
 *
 * Hidden:0|1 SoT: legacy bizContractMgr.jsp initdata1.Cols array.
 * JSP system rows (sNo, sDelete, sStatus) and Image popup columns
 * (detailPop, mmDetailPop) are omitted — PR-1A skips popup launchers.
 *
 * Columns whose SaveName does not exist in SalesContractRow (e.g.
 * chkdate, contAmt, register, businessUnit) are mapped to the closest
 * schema equivalent (updatedAt, createdBy) or omitted when no mapping
 * exists. All remaining SalesContractRow fields are included as
 * Hidden:1 (detail-panel fields not visible in the list grid by default).
 */
import type { ColumnDef } from "@/components/grid/types";
import type { SalesContractRow } from "@jarvis/shared/validation/sales-contract";

// ---------------------------------------------------------------------------
// JSP SaveName → SalesContractRow key mapping
// Hidden:0 = visible by default (matches JSP Hidden:0)
// Hidden:1 = hidden by default  (matches JSP Hidden:1 or detail-panel only)
// ---------------------------------------------------------------------------

export const contractsColumns: ColumnDef<SalesContractRow>[] = [
  // ---- JSP Hidden:1 -------------------------------------------------------
  {
    key: "legacyContNo",
    label: "계약번호",       // JSP: contNo → Hidden:1
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "docNo",
    label: "그룹웨어 문서번호", // JSP: docNo → Hidden:1
    type: "text",
    width: 100,
    editable: true,
  },

  // ---- JSP Hidden:0 (visible) ---------------------------------------------
  {
    key: "newYn",
    label: "신규구분",       // JSP: newYn → CheckBox → Hidden:0
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "contGbCd",
    label: "계약구분",       // JSP: contGbCd → Combo → Hidden:0, SALES_CONT_GB
    type: "select",
    width: 80,
    editable: false,
  },
  {
    key: "mainContType",
    label: "계약형태",       // JSP: mainContType → Combo → Hidden:0, SALES_MAIN_CONT_TYPE
    type: "select",
    width: 80,
    editable: false,
  },
  {
    key: "companyNm",
    label: "고객명",         // JSP: companyNm → Popup → Hidden:0 (PR-1A: text readonly)
    type: "text",
    width: 150,
    editable: false,
  },
  {
    key: "contNm",
    label: "계약명",         // JSP: contNm → Text → Hidden:0
    type: "text",
    width: 300,
    editable: false,
  },
  {
    key: "updatedAt",
    label: "수정일자",       // JSP: chkdate (computed) → Hidden:0 → mapped to updatedAt
    type: "readonly",
    width: 150,
  },
  {
    key: "companyNo",
    label: "고객 사업자번호", // JSP: companyNo → Text → Hidden:0
    type: "text",
    width: 110,
    editable: false,
  },
  {
    key: "companyCd",
    label: "고객코드",       // JSP: companyCd → Text → Hidden:0
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "companyGrpNm",
    label: "고객그룹명",     // JSP: companyGrpNm → Text → Hidden:0
    type: "text",
    width: 150,
    editable: true,
  },
  {
    key: "companyType",
    label: "기업분류",       // JSP: companyType → Combo → Hidden:0, SALES_COMPANY_TYPE
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "inOutType",
    label: "내외구분",       // JSP: inOutType → Combo → Hidden:0, SALES_IN_OUT_TYPE
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "customerNo",
    label: "담당자번호",     // JSP: customerNo → Text → Hidden:0
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "customerEmail",
    label: "담당자이메일",   // JSP: customerEmail → Popup → Hidden:0 (PR-1A: text)
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "custNm",
    label: "거래처",         // JSP: custNm → Text → Hidden:0
    type: "text",
    width: 100,
    editable: false,
  },
  {
    key: "legacyContYear",
    label: "귀속년도",       // JSP: contYear → Text → Hidden:0
    type: "text",
    width: 70,
    editable: false,
  },
  {
    key: "contYmd",
    label: "계약일자",       // JSP: contYmd → Date → Hidden:0
    type: "date",
    width: 80,
    editable: false,
  },
  {
    key: "contSymd",
    label: "계약시작일",     // JSP: contSymd → Date → Hidden:0
    type: "date",
    width: 80,
    editable: false,
  },
  {
    key: "contEymd",
    label: "계약종료일",     // JSP: contEymd → Date → Hidden:0
    type: "date",
    width: 80,
    editable: false,
  },
  {
    key: "contInitYn",
    label: "계약갱신완료여부", // JSP: contInitYn → CheckBox → Hidden:0
    type: "boolean",
    width: 80,
    editable: false,
  },
  {
    key: "createdBy",
    label: "계약등록자",     // JSP: register → Hidden:0 → mapped to createdBy
    type: "readonly",
    width: 80,
  },
  {
    key: "createdAt",
    label: "계약등록일자",   // JSP: registYmd → Hidden:0 → mapped to createdAt
    type: "readonly",
    width: 80,
  },

  // ---- Schema-only fields (detail-panel, Hidden:1 in list grid) -----------
  {
    key: "legacyEnterCd",
    label: "레거시 입력코드",
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "companyAddr",
    label: "회사주소",
    type: "text",
    width: 200,
    editable: true,
  },
  {
    key: "companyOner",
    label: "회사대표자",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "sucProb",
    label: "수주예상",       // SALES_SUC_PROB
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "startAmt",
    label: "착수금",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "startAmtRate",
    label: "착수금비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmt1",
    label: "중도금1차",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "interimAmtRate1",
    label: "중도금1차비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmt2",
    label: "중도금2차",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "interimAmtRate2",
    label: "중도금2차비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmt3",
    label: "중도금3차",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "interimAmtRate3",
    label: "중도금3차비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmt4",
    label: "중도금4차",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "interimAmtRate4",
    label: "중도금4차비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmt5",
    label: "중도금5차",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "interimAmtRate5",
    label: "중도금5차비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "remainAmt",
    label: "잔금",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "remainAmtRate",
    label: "잔금비율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "contImplYn",
    label: "계약이행여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "contPublYn",
    label: "계약공시여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "contGrtRate",
    label: "계약보증율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "advanImplYn",
    label: "선금이행여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "advanPublYn",
    label: "선금공시여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "advanGrtRate",
    label: "선금보증율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "defectImplYn",
    label: "하자이행여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "defectPublYn",
    label: "하자공시여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "defectGrtRate",
    label: "하자보증율",
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "defectEymd",
    label: "하자종료일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "inspecConfYmd",
    label: "검사확인일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "startAmtPlanYmd",
    label: "착수금계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "startAmtPublYn",
    label: "착수금공시여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPlanYmd1",
    label: "중도금1차계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPublYn1",
    label: "중도금1차공시",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPlanYmd2",
    label: "중도금2차계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPublYn2",
    label: "중도금2차공시",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPlanYmd3",
    label: "중도금3차계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPublYn3",
    label: "중도금3차공시",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPlanYmd4",
    label: "중도금4차계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPublYn4",
    label: "중도금4차공시",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPlanYmd5",
    label: "중도금5차계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "interimAmtPublYn5",
    label: "중도금5차공시",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "remainAmtPlanYmd",
    label: "잔금계획일",
    type: "date",
    width: 80,
    editable: true,
  },
  {
    key: "remainAmtPublYn",
    label: "잔금공시여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "befContNo",
    label: "이전계약번호",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "contCancelYn",
    label: "계약취소여부",
    type: "boolean",
    width: 80,
    editable: true,
  },
  {
    key: "fileSeq",
    label: "첨부파일",
    type: "readonly",
    width: 80,
  },
  {
    key: "memo",
    label: "메모",
    type: "textarea",
    width: 200,
    editable: true,
  },
];

// Visible columns only (JSP Hidden:0 equivalent) — used by export
export const contractsVisibleColumns = contractsColumns.filter(
  (c) =>
    ![
      "legacyEnterCd",
      "legacyContNo",
      "docNo",
      "companyAddr",
      "companyOner",
      "sucProb",
      "startAmt",
      "startAmtRate",
      "interimAmt1",
      "interimAmtRate1",
      "interimAmt2",
      "interimAmtRate2",
      "interimAmt3",
      "interimAmtRate3",
      "interimAmt4",
      "interimAmtRate4",
      "interimAmt5",
      "interimAmtRate5",
      "remainAmt",
      "remainAmtRate",
      "contImplYn",
      "contPublYn",
      "contGrtRate",
      "advanImplYn",
      "advanPublYn",
      "advanGrtRate",
      "defectImplYn",
      "defectPublYn",
      "defectGrtRate",
      "defectEymd",
      "inspecConfYmd",
      "startAmtPlanYmd",
      "startAmtPublYn",
      "interimAmtPlanYmd1",
      "interimAmtPublYn1",
      "interimAmtPlanYmd2",
      "interimAmtPublYn2",
      "interimAmtPlanYmd3",
      "interimAmtPublYn3",
      "interimAmtPlanYmd4",
      "interimAmtPublYn4",
      "interimAmtPlanYmd5",
      "interimAmtPublYn5",
      "remainAmtPlanYmd",
      "remainAmtPublYn",
      "befContNo",
      "contCancelYn",
      "fileSeq",
      "memo",
    ].includes(c.key),
);
