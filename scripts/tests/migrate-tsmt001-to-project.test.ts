import { describe, it, expect } from "vitest";
import {
  groupRecordsByCompanyAndEnv,
  mapPrimaryRowToProject,
  mapExtraRowToAccess,
} from "../migrate-tsmt001-to-project.js";

const sample = [
  { enter_cd: null, company_cd: "WHE", env_type: "운영", connect_cd: "IP", vpn_file_seq: null, domain_addr: "http://hr.wh.com/", login_info: "admin/pw", svn_addr: null, db_connect_info: "192.168.10.53:1521:HR", db_user_info: null, src_info: null, class_info: null, memo: "m1" },
  { enter_cd: null, company_cd: "WHE", env_type: "운영", connect_cd: null, vpn_file_seq: null, domain_addr: "http://alt.wh.com/", login_info: "user2/pw2", svn_addr: null, db_connect_info: null, db_user_info: null, src_info: null, class_info: null, memo: "보조" },
  { enter_cd: null, company_cd: "WHE", env_type: "개발", connect_cd: null, vpn_file_seq: null, domain_addr: "http://dev.wh.com/", login_info: "dev/pw", svn_addr: null, db_connect_info: null, db_user_info: null, src_info: null, class_info: null, memo: null },
];

describe("migrate-tsmt001-to-project", () => {
  it("groups records into one project per company", () => {
    const groups = groupRecordsByCompanyAndEnv(sample);
    expect(Object.keys(groups).length).toBe(1);
    expect(Object.keys(groups.WHE).length).toBe(2);
    expect(groups.WHE["운영"].length).toBe(2);
    expect(groups.WHE["개발"].length).toBe(1);
  });

  it("skips records with null company_cd or env_type", () => {
    const dirty = [...sample, { enter_cd: null, company_cd: null, env_type: "운영", connect_cd: null, vpn_file_seq: null, domain_addr: null, login_info: null, svn_addr: null, db_connect_info: null, db_user_info: null, src_info: null, class_info: null, memo: null }];
    const groups = groupRecordsByCompanyAndEnv(dirty);
    expect(Object.keys(groups).length).toBe(1);
  });

  it("picks primary row as the fullest by populated field count", () => {
    const prodRows = sample.filter(r => r.env_type === "운영");
    const primary = mapPrimaryRowToProject(prodRows);
    // The row with db_connect_info + memo should win over the one without
    expect(primary.prod_domain_url).toBe("http://hr.wh.com/");
    expect(primary.envKey).toBe("prod");
  });

  it("maps dev rows with dev_ prefix", () => {
    const primary = mapPrimaryRowToProject(sample.filter(r => r.env_type === "개발"));
    expect(primary.envKey).toBe("dev");
    expect(primary.dev_domain_url).toBe("http://dev.wh.com/");
  });

  it("maps extra rows to access entries with envType", () => {
    const extra = sample[1]; // the "보조" row
    const access = mapExtraRowToAccess(extra, "prod");
    expect(access.envType).toBe("prod");
    expect(access.accessType).toBe("web"); // no db_connect_info, no vpn_file_seq
    expect(access.label).toContain("보조");
    expect(access.usernameRef).toBe("user2");
    expect(access.passwordRef).toBe("pw2");
  });

  it("extracts user/pass from login_info slash-separated string", () => {
    const extra = { ...sample[0], memo: "abc" };
    const access = mapExtraRowToAccess(extra, "prod");
    expect(access.usernameRef).toBe("admin");
    expect(access.passwordRef).toBe("pw");
    expect(access.accessType).toBe("db"); // db_connect_info present
  });
});
