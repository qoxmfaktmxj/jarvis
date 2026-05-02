/**
 * apps/web/app/(app)/sales/contract-services/_components/columns.ts
 *
 * ColumnDef[] for salesContractService (TBIZ010).
 *
 * Hidden:0|1 SoT: legacy contractServMgr.jsp initdata1.Cols array.
 * JSP system rows (sNo, sDelete, sStatus) are omitted.
 * Popup columns (pjtNm) rendered as text — PR-1A skips popup launchers.
 *
 * JSP visible (Hidden:0): orgCd, manager, pjtNm, servSabun, servName,
 *   birYmd, cpyGbCd, cpyName, econtAmt, econtCnt, symd, eymd,
 *   eperiod(computed/readonly), estatus(computed/readonly), etc1
 * JSP hidden (Hidden:1): pjtCd
 * Schema-only (not in JSP, Hidden:1 in list): job, tel, mail, addr,
 *   attendCd, skillCd, cmmncCd, rsponsCd, memo1-3, etc2-10,
 *   legacyEnterCd, legacySymd, legacyServSabun
 *
 * Code group mappings:
 *   orgCd   → SALES_ATTEND_CD (org combo from server, text fallback)
 *   cpyGbCd → SALES_CPY_GB
 *   attendCd → SALES_ATTEND_CD
 *   skillCd  → SALES_SKILL_CD
 *   cmmncCd  → SALES_CMMNC_CD
 *   rsponsCd → SALES_RSPONS_CD
 */
import type { ColumnDef } from "@/components/grid/types";
import type { SalesContractServiceRow } from "@jarvis/shared/validation/sales-contract";

// ---------------------------------------------------------------------------
// JSP SaveName → SalesContractServiceRow key mapping
// Hidden:0 = visible by default (matches JSP Hidden:0)
// Hidden:1 = hidden by default  (matches JSP Hidden:1 or schema-only)
// ---------------------------------------------------------------------------

export const contractServicesColumns: ColumnDef<SalesContractServiceRow>[] = [
  // ---- JSP Hidden:0 (visible) ---------------------------------------------
  {
    key: "orgCd",
    label: "담당팀명",         // JSP: orgCd → Combo → Hidden:0
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "manager",
    label: "대표담당자",       // JSP: manager → Text → Hidden:0
    type: "text",
    width: 70,
    editable: true,
  },
  {
    key: "pjtNm",
    label: "프로젝트",         // JSP: pjtNm → Popup → Hidden:0 (PR-1A: text)
    type: "text",
    width: 150,
    editable: true,
  },
  {
    key: "servSabun",
    label: "사번",             // JSP: servSabun → Text → Hidden:0
    type: "text",
    width: 70,
    editable: true,
  },
  {
    key: "servName",
    label: "이름",             // JSP: servName → Text → Hidden:0
    type: "text",
    width: 70,
    editable: true,
  },
  {
    key: "birYmd",
    label: "생년월일",         // JSP: birYmd → Date → Hidden:0
    type: "date",
    width: 100,
    editable: true,
  },
  {
    key: "cpyGbCd",
    label: "계약구분",         // JSP: cpyGbCd → Combo → Hidden:0, SALES_CPY_GB
    type: "select",
    width: 70,
    editable: true,
  },
  {
    key: "cpyName",
    label: "업체명",           // JSP: cpyName → Text → Hidden:0
    type: "text",
    width: 150,
    editable: true,
  },
  {
    key: "econtAmt",
    label: "계약금액(월)",     // JSP: econtAmt → Int → Hidden:0
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "econtCnt",
    label: "계약차수",         // JSP: econtCnt → Text → Hidden:0
    type: "text",
    width: 50,
    editable: true,
  },
  {
    key: "symd",
    label: "계약시작일",       // JSP: symd → Date → Hidden:0
    type: "date",
    width: 100,
    editable: true,
  },
  {
    key: "eymd",
    label: "계약종료일",       // JSP: eymd → Date → Hidden:0
    type: "date",
    width: 100,
    editable: true,
  },
  {
    key: "etc1",
    label: "비고",             // JSP: etc1 → Text → Hidden:0 (MultiLineText)
    type: "textarea",
    width: 200,
    editable: true,
  },

  // ---- JSP Hidden:1 -------------------------------------------------------
  {
    key: "pjtCd",
    label: "프로젝트코드",     // JSP: pjtCd → Text → Hidden:1
    type: "text",
    width: 80,
    editable: false,
  },

  // ---- Schema-only fields (detail-panel, Hidden:1 in list grid) -----------
  {
    key: "job",
    label: "직무",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "tel",
    label: "전화번호",
    type: "text",
    width: 120,
    editable: true,
  },
  {
    key: "mail",
    label: "이메일",
    type: "text",
    width: 150,
    editable: true,
  },
  {
    key: "addr",
    label: "주소",
    type: "text",
    width: 200,
    editable: true,
  },
  {
    key: "attendCd",
    label: "근태코드",         // SALES_ATTEND_CD
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "skillCd",
    label: "스킬코드",         // SALES_SKILL_CD
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "cmmncCd",
    label: "커뮤니케이션코드", // SALES_CMMNC_CD
    type: "select",
    width: 100,
    editable: true,
  },
  {
    key: "rsponsCd",
    label: "책임코드",         // SALES_RSPONS_CD
    type: "select",
    width: 80,
    editable: true,
  },
  {
    key: "memo1",
    label: "메모1",
    type: "textarea",
    width: 200,
    editable: true,
  },
  {
    key: "memo2",
    label: "메모2",
    type: "textarea",
    width: 200,
    editable: true,
  },
  {
    key: "memo3",
    label: "메모3",
    type: "textarea",
    width: 200,
    editable: true,
  },
  {
    key: "etc2",
    label: "기타2",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc3",
    label: "기타3",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc4",
    label: "기타4",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc5",
    label: "기타5",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc6",
    label: "기타6",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc7",
    label: "기타7",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc8",
    label: "기타8",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc9",
    label: "기타9",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "etc10",
    label: "기타10",
    type: "text",
    width: 100,
    editable: true,
  },
  {
    key: "legacyEnterCd",
    label: "레거시 입력코드",
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "legacySymd",
    label: "레거시 계약시작일",
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "legacyServSabun",
    label: "레거시 사번",
    type: "text",
    width: 80,
    editable: false,
  },
  // Audit (readonly)
  {
    key: "createdAt",
    label: "등록일자",
    type: "readonly",
    width: 80,
  },
  {
    key: "updatedAt",
    label: "수정일자",
    type: "readonly",
    width: 150,
  },
  {
    key: "createdBy",
    label: "등록자",
    type: "readonly",
    width: 80,
  },
  {
    key: "updatedBy",
    label: "수정자",
    type: "readonly",
    width: 80,
  },
];

// Visible columns only (JSP Hidden:0 equivalent) — used by export
export const contractServicesVisibleColumns = contractServicesColumns.filter((c) =>
  [
    "orgCd",
    "manager",
    "pjtNm",
    "servSabun",
    "servName",
    "birYmd",
    "cpyGbCd",
    "cpyName",
    "econtAmt",
    "econtCnt",
    "symd",
    "eymd",
    "etc1",
  ].includes(c.key),
);
