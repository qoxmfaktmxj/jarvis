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
import { salesContract } from "../../schema/sales-contract.js";

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
