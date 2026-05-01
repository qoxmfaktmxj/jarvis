/**
 * apps/web/app/(app)/sales/contract-months/_components/columns.ts
 *
 * ColumnDef[] for salesContractMonth (TBIZ031).
 *
 * Hidden:0|1 SoT: legacy bizContractMonthMgr.jsp initdata1.Cols array.
 * JSP system rows (sNo, sStatus) and Image popup columns (detailPop,
 * mmDetailPop) are omitted — PR-1A skips popup launchers.
 * Computed AutoSum columns (planTotOrderAmt, planTotServAmt, etc.) and
 * JSP-only fields (costGrpNm, costNm, productType, contType, pjtCode,
 * pjtNm, rfcCheck, cellEditableYn) have no salesContractMonth schema
 * equivalent and are omitted.
 *
 * Group structure (62 columns total, spans must sum to 62):
 *   기본          → 11 cols (id hidden, workspaceId hidden, + base fields)
 *   계획 (PLAN)   → 15 cols (plan*)
 *   예상 (VIEW)   → 15 cols (view*)
 *   실적 (PERF)   → 15 cols (perf*)
 *   기타           → 6 cols (tax* + audit)
 */
import type { ColumnDef } from "@/components/grid/types";
import type { GroupHeader } from "@/components/grid/types";
import type { SalesContractMonthRow } from "@jarvis/shared/validation/sales-contract";

// ---------------------------------------------------------------------------
// JSP SaveName → SalesContractMonthRow key mapping
// Hidden:0 = visible (JSP Hidden:0)  |  Hidden:1 = hidden (JSP Hidden:1)
// ---------------------------------------------------------------------------

export const contractMonthsColumns: ColumnDef<SalesContractMonthRow>[] = [
  // ===== 기본 block (13 cols) ===============================================

  // Hidden:1 — internal keys, not shown by default
  {
    key: "id",
    label: "ID",
    type: "readonly",
    width: 80,
  },
  {
    key: "workspaceId",
    label: "워크스페이스",
    type: "readonly",
    width: 80,
  },
  {
    key: "contractId",
    label: "계약ID",              // FK → salesContract.id
    type: "text",
    width: 100,
    editable: false,
  },
  {
    key: "legacyContYear",
    label: "귀속년도",             // JSP: contYear → Hidden:1
    type: "text",
    width: 70,
    editable: false,
  },
  {
    key: "legacyContNo",
    label: "계약번호",             // JSP: contNo → Hidden:1
    type: "text",
    width: 80,
    editable: false,
  },
  {
    key: "legacySeq",
    label: "순번",                 // JSP: seq → Hidden:1
    type: "readonly",
    width: 60,
  },
  {
    key: "legacyYm",
    label: "레거시년월",           // JSP: ym (legacy) → Hidden:1
    type: "text",
    width: 70,
    editable: false,
  },

  // Hidden:0 — visible base fields
  {
    key: "ym",
    label: "년월",                 // JSP: ym → Date → Hidden:0
    type: "text",
    width: 70,
    editable: false,
  },
  {
    key: "rfcEndYn",
    label: "실적생성마감",         // JSP: rfcEndYn → CheckBox → Hidden:0
    type: "boolean",
    width: 50,
    editable: true,
  },
  {
    key: "billTargetYn",
    label: "청구대상여부",
    type: "boolean",
    width: 60,
    editable: true,
  },
  {
    key: "note",
    label: "메모",
    type: "textarea",
    width: 200,
    editable: true,
  },

  // ===== 계획 (PLAN) block — 15 cols ========================================
  // JSP: Header "계획|..." → Hidden:0  (UpdateEdit varies per computed flag)

  {
    key: "planServSaleAmt",
    label: "수주금액(용역)",       // JSP: 계획|수주금액(용역)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planProdSaleAmt",
    label: "수주금액(상품)",       // JSP: 계획|수주금액(상품)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planInfSaleAmt",
    label: "수주금액(인프라)",     // JSP: 계획|수주금액(인프라)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planServInCostAmt",
    label: "용역비(내부)",         // JSP: 계획|용역비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planServOutCostAmt",
    label: "용역비(외부)",         // JSP: 계획|용역비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planProdCostAmt",
    label: "상품원가",             // JSP: 계획|상품원가
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planRentAmt",
    label: "임대료수입",           // JSP: 계획|임대료수입
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "planExpAmt",
    label: "경비",                 // JSP: 계획|경비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "planSgaAmt",
    label: "판관비",               // JSP: 계획|판관비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "planInCostAmt",
    label: "직접비(내부)",         // JSP: 계획|직접비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planOutCostAmt",
    label: "직접비(외부)",         // JSP: 계획|직접비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planIndirectGrpAmt",
    label: "간접비(본부공통)",     // JSP: 계획|간접비(본부공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planIndirectComAmt",
    label: "간접비(전사공통)",     // JSP: 계획|간접비(전사공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planInManMonth",
    label: "내부M/M",             // JSP: 계획|내부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "planOutManMonth",
    label: "외부M/M",             // JSP: 계획|외부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },

  // ===== 예상 (VIEW) block — 15 cols ========================================

  {
    key: "viewServSaleAmt",
    label: "수주금액(용역)",       // JSP: 전망|수주금액(용역)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewProdSaleAmt",
    label: "수주금액(상품)",       // JSP: 전망|수주금액(상품)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewInfSaleAmt",
    label: "수주금액(인프라)",     // JSP: 전망|수주금액(인프라)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewServInCostAmt",
    label: "용역비(내부)",         // JSP: 전망|용역비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewServOutCostAmt",
    label: "용역비(외부)",         // JSP: 전망|용역비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewProdCostAmt",
    label: "상품원가",             // JSP: 전망|상품원가
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewRentAmt",
    label: "임대료수입",           // JSP: 전망|임대료수입
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "viewExpAmt",
    label: "경비",                 // JSP: 전망|경비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "viewSgaAmt",
    label: "판관비",               // JSP: 전망|판관비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "viewInCostAmt",
    label: "직접비(내부)",         // JSP: 전망|직접비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewOutCostAmt",
    label: "직접비(외부)",         // JSP: 전망|직접비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewIndirectGrpAmt",
    label: "간접비(본부공통)",     // JSP: 전망|간접비(본부공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewIndirectComAmt",
    label: "간접비(전사공통)",     // JSP: 전망|간접비(전사공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewInManMonth",
    label: "내부M/M",             // JSP: 전망|내부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "viewOutManMonth",
    label: "외부M/M",             // JSP: 전망|외부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },

  // ===== 실적 (PERF) block — 15 cols ========================================

  {
    key: "perfServSaleAmt",
    label: "수주금액(용역)",       // JSP: 실적|수주금액(용역)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfProdSaleAmt",
    label: "수주금액(상품)",       // JSP: 실적|수주금액(상품)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfInfSaleAmt",
    label: "수주금액(인프라)",     // JSP: 실적|수주금액(인프라)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfServInCostAmt",
    label: "용역비(내부)",         // JSP: 실적|용역비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfServOutCostAmt",
    label: "용역비(외부)",         // JSP: 실적|용역비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfProdCostAmt",
    label: "상품원가",             // JSP: 실적|상품원가
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfRentAmt",
    label: "임대료수입",           // JSP: 실적|임대료수입
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "perfExpAmt",
    label: "경비",                 // JSP: 실적|경비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "perfSgaAmt",
    label: "판관비",               // JSP: 실적|판관비
    type: "numeric",
    width: 80,
    editable: true,
  },
  {
    key: "perfInCostAmt",
    label: "직접비(내부)",         // JSP: 실적|직접비(내부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfOutCostAmt",
    label: "직접비(외부)",         // JSP: 실적|직접비(외부)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfIndirectGrpAmt",
    label: "간접비(본부공통)",     // JSP: 실적|간접비(본부공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfIndirectComAmt",
    label: "간접비(전사공통)",     // JSP: 실적|간접비(전사공통)
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfInManMonth",
    label: "내부M/M",             // JSP: 실적|내부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "perfOutManMonth",
    label: "외부M/M",             // JSP: 실적|외부M/M → PointCount:10
    type: "numeric",
    width: 100,
    editable: true,
  },

  // ===== 기타 block — 6 cols ================================================

  {
    key: "taxOrderAmt",
    label: "세금계산서수주금액",
    type: "numeric",
    width: 100,
    editable: true,
  },
  {
    key: "taxServAmt",
    label: "세금계산서용역금액",
    type: "numeric",
    width: 100,
    editable: true,
  },
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
    width: 80,
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

// ---------------------------------------------------------------------------
// Group headers — spans MUST sum to contractMonthsColumns.length (= 62)
// 기본(11) + 계획(15) + 예상(15) + 실적(15) + 기타(6) = 62
// ---------------------------------------------------------------------------

export const contractMonthsGroupHeaders: GroupHeader[] = [
  { label: "기본", span: 11 },
  { label: "계획 (PLAN)", span: 15 },
  { label: "예상 (VIEW)", span: 15 },
  { label: "실적 (PERF)", span: 15 },
  { label: "기타", span: 6 },
];

// ---------------------------------------------------------------------------
// Visible columns only (JSP Hidden:0 equivalent) — used by export
// Hidden:1 list: id, workspaceId, contractId, legacyContYear, legacyContNo,
//                legacySeq, legacyYm
// ---------------------------------------------------------------------------

export const contractMonthsVisibleColumns = contractMonthsColumns.filter(
  (c) =>
    !["id", "workspaceId", "contractId", "legacyContYear", "legacyContNo", "legacySeq", "legacyYm"].includes(
      c.key,
    ),
);
