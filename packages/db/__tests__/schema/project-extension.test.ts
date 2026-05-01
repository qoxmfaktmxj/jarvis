import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { getTableConfig } from "drizzle-orm/pg-core";
import { projectBeacon, projectHistory, projectModule } from "../../schema/project.js";

function columnNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).columns.map((column) => column.name);
}

describe("project extension schemas", () => {
  it("maps TBIZ012 beacon columns and legacy key", () => {
    const cols = columnNames(projectBeacon);

    for (const name of [
      "workspace_id",
      "legacy_enter_cd",
      "legacy_beacon_mcd",
      "legacy_beacon_ser",
      "beacon_mcd",
      "beacon_ser",
      "pjt_cd",
      "pjt_nm",
      "sdate",
      "edate",
      "sabun",
      "out_yn",
      "bigo",
      "created_at",
      "updated_at",
      "created_by",
      "updated_by",
    ]) {
      assert.ok(cols.includes(name), `project_beacon missing ${name}`);
    }
  });

  it("maps TBIZ011 project history columns and legacy key", () => {
    const cols = columnNames(projectHistory);

    for (const name of [
      "workspace_id",
      "legacy_enter_cd",
      "legacy_sabun",
      "legacy_org_cd",
      "legacy_pjt_cd",
      "sabun",
      "org_cd",
      "pjt_cd",
      "cust_cd",
      "cust_nm",
      "sdate",
      "edate",
      "reg_cd",
      "reg_nm",
      "de_reg",
      "flist",
      "plist",
      "role_cd",
      "role_nm",
      "module",
      "bigo",
      "memo",
      "job_cd",
      "job_nm",
      "reward_yn",
      "status_cd",
      "beacon_mcd",
    ]) {
      assert.ok(cols.includes(name), `project_history missing ${name}`);
    }
  });

  it("maps TBIZ013 project module columns and legacy key", () => {
    const cols = columnNames(projectModule);

    for (const name of [
      "workspace_id",
      "legacy_enter_cd",
      "legacy_sabun",
      "legacy_pjt_cd",
      "legacy_module_cd",
      "sabun",
      "pjt_cd",
      "pjt_nm",
      "module_cd",
      "module_nm",
    ]) {
      assert.ok(cols.includes(name), `project_module missing ${name}`);
    }
  });
});
