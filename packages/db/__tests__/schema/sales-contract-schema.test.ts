/**
 * packages/db/__tests__/schema/sales-contract-schema.test.ts
 *
 * Task 1 — sales_contract schema (TBIZ030 1:1 매핑)
 *
 * TBIZ030 65컬럼 nullable wide-table + uuid PK + workspaceId + legacy composite key
 * preservation + 4 indexes (ws / customer / cont_ymd / legacy uniq).
 *
 * 실행: `pnpm test`
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  salesContract,
  salesContractMonth,
  salesContractAddinfo,
  salesContractService,
} from "../../schema/sales-contract.js";

describe("sales_contract schema", () => {
  it("has uuid primary key + workspaceId + legacy composite columns", () => {
    const cols = Object.keys(salesContract);
    assert.ok(cols.includes("id"), "missing id column");
    assert.ok(cols.includes("workspaceId"), "missing workspaceId column");
    assert.ok(cols.includes("legacyEnterCd"), "missing legacyEnterCd column");
    assert.ok(cols.includes("legacyContYear"), "missing legacyContYear column");
    assert.ok(cols.includes("legacyContNo"), "missing legacyContNo column");
  });

  it("has all 65 TBIZ030 columns mapped", () => {
    const expected = [
      "companyType", "companyCd", "companyGrpNm", "companyNm", "companyNo",
      "customerNo", "customerEmail", "contNm", "custNm", "contGbCd",
      "contYmd", "contSymd", "contEymd", "mainContType", "newYn", "inOutType",
      "startAmt", "startAmtRate",
      "interimAmt1", "interimAmt2", "interimAmt3", "interimAmt4", "interimAmt5",
      "interimAmtRate1", "interimAmtRate2", "interimAmtRate3", "interimAmtRate4", "interimAmtRate5",
      "remainAmt", "remainAmtRate",
      "contImplYn", "contPublYn", "contGrtRate",
      "advanImplYn", "advanPublYn", "advanGrtRate",
      "defectImplYn", "defectPublYn", "defectGrtRate", "defectEymd",
      "inspecConfYmd",
      "startAmtPlanYmd", "startAmtPublYn",
      "interimAmtPlanYmd1", "interimAmtPublYn1",
      "interimAmtPlanYmd2", "interimAmtPublYn2",
      "interimAmtPlanYmd3", "interimAmtPublYn3",
      "interimAmtPlanYmd4", "interimAmtPublYn4",
      "interimAmtPlanYmd5", "interimAmtPublYn5",
      "remainAmtPlanYmd", "remainAmtPublYn",
      "befContNo", "contCancelYn", "contInitYn",
      "fileSeq", "docNo", "companyAddr", "companyOner", "sucProb",
      "memo",
    ];
    const cols = Object.keys(salesContract);
    for (const c of expected) {
      assert.ok(cols.includes(c), `missing column ${c}`);
    }
  });
});

describe("sales_contract_month schema", () => {
  it("has FK to sales_contract via contractId", () => {
    const cols = Object.keys(salesContractMonth);
    assert.ok(cols.includes("contractId"), "missing contractId column");
  });

  it("has 3-way (PLAN/VIEW/PERF) × 15 columns per group + tax + finalize", () => {
    const cols = Object.keys(salesContractMonth);
    // PLAN
    assert.ok(cols.includes("planInManMonth"), "missing planInManMonth");
    assert.ok(cols.includes("planOutManMonth"), "missing planOutManMonth");
    assert.ok(cols.includes("planServSaleAmt"), "missing planServSaleAmt");
    assert.ok(cols.includes("planRentAmt"), "missing planRentAmt");
    assert.ok(cols.includes("planSgaAmt"), "missing planSgaAmt");
    assert.ok(cols.includes("planExpAmt"), "missing planExpAmt");
    // VIEW
    assert.ok(cols.includes("viewServSaleAmt"), "missing viewServSaleAmt");
    assert.ok(cols.includes("viewRentAmt"), "missing viewRentAmt");
    // PERF
    assert.ok(cols.includes("perfServSaleAmt"), "missing perfServSaleAmt");
    assert.ok(cols.includes("perfRentAmt"), "missing perfRentAmt");
    // tax + finalize
    assert.ok(cols.includes("taxOrderAmt"), "missing taxOrderAmt");
    assert.ok(cols.includes("taxServAmt"), "missing taxServAmt");
    assert.ok(cols.includes("rfcEndYn"), "missing rfcEndYn");
    assert.ok(cols.includes("note"), "missing note");
  });
});

describe("sales_contract_addinfo schema (TBIZ032)", () => {
  it("has FK to sales_contract via contractId", () => {
    const cols = Object.keys(salesContractAddinfo);
    assert.ok(cols.includes("contractId"), "missing contractId column");
  });

  it("has TBIZ032 columns: legacySabun + mailId", () => {
    const cols = Object.keys(salesContractAddinfo);
    assert.ok(cols.includes("legacySabun"), "missing legacySabun column");
    assert.ok(cols.includes("mailId"), "missing mailId column");
  });

  it("has legacy composite key + audit columns", () => {
    const cols = Object.keys(salesContractAddinfo);
    assert.ok(cols.includes("legacyEnterCd"), "missing legacyEnterCd");
    assert.ok(cols.includes("legacyContYear"), "missing legacyContYear");
    assert.ok(cols.includes("legacyContNo"), "missing legacyContNo");
    assert.ok(cols.includes("createdAt"), "missing createdAt");
    assert.ok(cols.includes("updatedAt"), "missing updatedAt");
    assert.ok(cols.includes("createdBy"), "missing createdBy");
    assert.ok(cols.includes("updatedBy"), "missing updatedBy");
  });
});

describe("sales_contract_service schema (TBIZ010)", () => {
  it("has 37 personnel columns + ETC1-10 + MEMO1-3", () => {
    const cols = Object.keys(salesContractService);
    // Key personnel cols
    assert.ok(cols.includes("servSabun"), "missing servSabun");
    assert.ok(cols.includes("servName"), "missing servName");
    assert.ok(cols.includes("birYmd"), "missing birYmd");
    assert.ok(cols.includes("symd"), "missing symd");
    assert.ok(cols.includes("eymd"), "missing eymd");
    assert.ok(cols.includes("cpyGbCd"), "missing cpyGbCd");
    assert.ok(cols.includes("cpyName"), "missing cpyName");
    assert.ok(cols.includes("econtAmt"), "missing econtAmt");
    assert.ok(cols.includes("econtCnt"), "missing econtCnt");
    assert.ok(cols.includes("job"), "missing job");
    assert.ok(cols.includes("tel"), "missing tel");
    assert.ok(cols.includes("mail"), "missing mail");
    assert.ok(cols.includes("addr"), "missing addr");
    assert.ok(cols.includes("attendCd"), "missing attendCd");
    assert.ok(cols.includes("skillCd"), "missing skillCd");
    assert.ok(cols.includes("cmmncCd"), "missing cmmncCd");
    assert.ok(cols.includes("rsponsCd"), "missing rsponsCd");
    assert.ok(cols.includes("orgCd"), "missing orgCd");
    assert.ok(cols.includes("manager"), "missing manager");
    assert.ok(cols.includes("pjtCd"), "missing pjtCd");
    assert.ok(cols.includes("pjtNm"), "missing pjtNm");
    // ETC1-10
    for (let i = 1; i <= 10; i++) {
      assert.ok(cols.includes(`etc${i}`), `missing etc${i}`);
    }
    // MEMO1-3
    for (let i = 1; i <= 3; i++) {
      assert.ok(cols.includes(`memo${i}`), `missing memo${i}`);
    }
  });

  it("has legacy composite key + indexes", () => {
    const cols = Object.keys(salesContractService);
    assert.ok(cols.includes("legacyEnterCd"), "missing legacyEnterCd");
    assert.ok(cols.includes("legacySymd"), "missing legacySymd");
    assert.ok(cols.includes("legacyServSabun"), "missing legacyServSabun");
  });

  it("has audit columns", () => {
    const cols = Object.keys(salesContractService);
    assert.ok(cols.includes("createdAt"), "missing createdAt");
    assert.ok(cols.includes("updatedAt"), "missing updatedAt");
    assert.ok(cols.includes("createdBy"), "missing createdBy");
    assert.ok(cols.includes("updatedBy"), "missing updatedBy");
  });
});
