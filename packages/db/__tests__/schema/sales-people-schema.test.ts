import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { salesFreelancer } from "../../schema/sales-freelancer.js";
import {
  salesCloudPeopleBase,
  salesCloudPeopleCalc,
} from "../../schema/sales-cloud-headcount.js";

describe("sales people schema", () => {
  it("maps freelancer TCPN912 screen columns", () => {
    const cols = Object.keys(salesFreelancer);
    for (const col of [
      "workspaceId",
      "legacyEnterCd",
      "sabun",
      "name",
      "resNo",
      "pjtCd",
      "pjtNm",
      "sdate",
      "edate",
      "addr",
      "tel",
      "mailId",
      "belongYm",
      "businessCd",
      "totMon",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
    ]) {
      assert.ok(cols.includes(col), `missing salesFreelancer.${col}`);
    }
  });

  it("maps cloud people base TBIZ015 columns", () => {
    const cols = Object.keys(salesCloudPeopleBase);
    for (const col of [
      "workspaceId",
      "legacyEnterCd",
      "contNo",
      "contYear",
      "seq",
      "pjtCode",
      "companyCd",
      "personType",
      "calcType",
      "sdate",
      "edate",
      "monthAmt",
      "note",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
    ]) {
      assert.ok(cols.includes(col), `missing salesCloudPeopleBase.${col}`);
    }
  });

  it("maps cloud people calc TBIZ016 columns", () => {
    const cols = Object.keys(salesCloudPeopleCalc);
    for (const col of [
      "workspaceId",
      "legacyEnterCd",
      "contNo",
      "contYear",
      "seq",
      "personType",
      "calcType",
      "ym",
      "personCnt",
      "totalAmt",
      "note",
      "reflYn",
      "reflId",
      "reflDate",
      "createdAt",
      "updatedAt",
      "createdBy",
      "updatedBy",
    ]) {
      assert.ok(cols.includes(col), `missing salesCloudPeopleCalc.${col}`);
    }
  });
});

