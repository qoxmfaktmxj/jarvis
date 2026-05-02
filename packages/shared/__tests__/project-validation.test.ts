import { describe, expect, it } from "vitest";
import {
  listProjectBeaconsInput,
  listProjectHistoryInput,
  listProjectModulesInput,
  projectBeaconRowSchema,
  projectHistoryRowSchema,
  projectModuleRowSchema,
  saveProjectBeaconsInput,
  saveProjectHistoryInput,
  saveProjectModulesInput,
} from "../validation/project.js";

const id = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const now = "2026-05-02T00:00:00.000Z";

describe("project extension validation", () => {
  it("parses beacon rows and save payload defaults", () => {
    expect(projectBeaconRowSchema.parse({
      id,
      workspaceId,
      legacyEnterCd: null,
      legacyBeaconMcd: null,
      legacyBeaconSer: null,
      beaconMcd: "B-1",
      beaconSer: "SER-1",
      pjtCd: null,
      pjtNm: null,
      sdate: null,
      edate: null,
      sabun: null,
      outYn: "Y",
      bigo: null,
      createdAt: now,
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    }).beaconMcd).toBe("B-1");

    expect(listProjectBeaconsInput.parse({}).limit).toBe(50);
    expect(saveProjectBeaconsInput.parse({}).creates).toEqual([]);
  });

  it("parses history rows and list filters", () => {
    const row = projectHistoryRowSchema.parse({
      id,
      workspaceId,
      legacyEnterCd: null,
      legacySabun: null,
      legacyOrgCd: null,
      legacyPjtCd: null,
      sabun: "E001",
      orgCd: "ORG",
      pjtCd: "PJT",
      pjtNm: null,
      custCd: null,
      custNm: null,
      sdate: "20260501",
      edate: null,
      regCd: null,
      regNm: null,
      deReg: null,
      flist: null,
      plist: null,
      roleCd: null,
      roleNm: null,
      module: null,
      workHours: null,
      memo: null,
      etc1: null,
      etc2: null,
      etc3: null,
      etc4: null,
      etc5: null,
      jobCd: null,
      jobNm: null,
      rewardYn: null,
      statusCd: null,
      beaconMcd: null,
      createdAt: now,
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    });

    expect(row.sabun).toBe("E001");
    expect(listProjectHistoryInput.parse({ page: 2 }).page).toBe(2);
    expect(saveProjectHistoryInput.parse({ updates: [{ id, memo: "note" }] }).updates).toHaveLength(1);
  });

  it("parses module rows and save payloads", () => {
    const row = projectModuleRowSchema.parse({
      id,
      workspaceId,
      legacyEnterCd: null,
      legacySabun: null,
      legacyPjtCd: null,
      legacyModuleCd: null,
      sabun: "E001",
      pjtCd: "PJT",
      pjtNm: null,
      moduleCd: "B20020",
      moduleNm: null,
      createdAt: now,
      updatedAt: null,
      createdBy: null,
      updatedBy: null,
    });

    expect(row.moduleCd).toBe("B20020");
    expect(listProjectModulesInput.parse({ q: "kim" }).q).toBe("kim");
    expect(saveProjectModulesInput.parse({ deletes: [id] }).deletes).toEqual([id]);
  });
});
