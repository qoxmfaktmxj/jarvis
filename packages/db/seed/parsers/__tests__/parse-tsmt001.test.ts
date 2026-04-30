/**
 * packages/db/seed/parsers/__tests__/parse-tsmt001.test.ts
 *
 * TSMT001 Oracle export SQL 파서 단위 테스트 (TDD).
 * 실행: node --test --import tsx packages/db/seed/parsers/__tests__/parse-tsmt001.test.ts
 */

import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { parseTsmt001 } from "../parse-tsmt001.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE = `
REM INSERTING into EXPORT_TABLE
SET DEFINE OFF;
Insert into EXPORT_TABLE (ENTER_CD,COMPANY_CD,COMPANY_NM,COMPANY_GRP_CD,OBJECT_DIV,MANAGE_DIV,REPRESENT_COMPANY,SDATE,INDUTY_CD,ZIP,ADDRESS,HOMEPAGE,COMPANY_FILE_SEQ,ETC1,ETC2,ETC3,ETC4,ETC5,ETC6,ETC7,ETC8,ETC9,ETC10,CHKID,CHKDATE) values ('SSMS','HENT','현대이엔티','EXT','001',null,'1',null,'002',null,null,null,null,null,null,null,null,null,null,null,null,null,null,'14001',to_date('2018-02-14 09:43:00','YYYY-MM-DD HH24:MI:SS'));
Insert into EXPORT_TABLE (ENTER_CD,COMPANY_CD,COMPANY_NM,COMPANY_GRP_CD,OBJECT_DIV,MANAGE_DIV,REPRESENT_COMPANY,SDATE,INDUTY_CD,ZIP,ADDRESS,HOMEPAGE,COMPANY_FILE_SEQ,ETC1,ETC2,ETC3,ETC4,ETC5,ETC6,ETC7,ETC8,ETC9,ETC10,CHKID,CHKDATE) values ('SSMS','STLC','에쓰오일토탈윤활유','EXT','001',null,'1',null,'999','100712','서울특별시 중구 통일로 92','ehr.s-oil-total.com',null,null,null,null,null,null,null,null,null,null,null,'16003',to_date('2016-09-07 10:24:38','YYYY-MM-DD HH24:MI:SS'));
Insert into EXPORT_TABLE (ENTER_CD,COMPANY_CD,COMPANY_NM,COMPANY_GRP_CD,OBJECT_DIV,MANAGE_DIV,REPRESENT_COMPANY,SDATE,INDUTY_CD,ZIP,ADDRESS,HOMEPAGE,COMPANY_FILE_SEQ,ETC1,ETC2,ETC3,ETC4,ETC5,ETC6,ETC7,ETC8,ETC9,ETC10,CHKID,CHKDATE) values ('SSMS','DMI','미디어로그','SAAS4','001',null,'1','20160501','002',null,null,null,null,null,null,null,null,null,null,null,null,null,null,'15002',to_date('2021-07-05 11:02:48','YYYY-MM-DD HH24:MI:SS'));
`;

describe("parseTsmt001", () => {
  it("parses Insert statements into typed records", () => {
    const rows = parseTsmt001(FIXTURE);
    assert.equal(rows.length, 3);

    assert.deepEqual(rows[0], {
      enterCd: "SSMS",
      code: "HENT",
      name: "현대이엔티",
      groupCode: "EXT",
      objectDiv: "001",
      manageDiv: null,
      representCompany: true,
      startDate: null,
      industryCode: "002",
      zip: null,
      address: null,
      homepage: null,
      updatedBy: "14001",
      updatedAt: new Date("2018-02-14T09:43:00Z"),
    });
  });

  it("converts SDATE 'YYYYMMDD' to ISO date string", () => {
    const rows = parseTsmt001(FIXTURE);
    assert.equal(rows[2].startDate, "2016-05-01");
  });

  it("converts REPRESENT_COMPANY '1'/'0'/null to boolean", () => {
    const rows = parseTsmt001(FIXTURE);
    assert.equal(rows[0].representCompany, true);
    assert.equal(rows[1].representCompany, true);
  });

  it("preserves Korean characters in name and address", () => {
    const rows = parseTsmt001(FIXTURE);
    assert.equal(rows[1].name, "에쓰오일토탈윤활유");
    assert.equal(rows[1].address, "서울특별시 중구 통일로 92");
  });

  it("skips REM and SET DEFINE lines", () => {
    assert.deepEqual(parseTsmt001("REM hello\nSET DEFINE OFF;\n"), []);
  });

  it("handles null REPRESENT_COMPANY as false", () => {
    const sql = `Insert into EXPORT_TABLE (ENTER_CD,COMPANY_CD,COMPANY_NM,COMPANY_GRP_CD,OBJECT_DIV,MANAGE_DIV,REPRESENT_COMPANY,SDATE,INDUTY_CD,ZIP,ADDRESS,HOMEPAGE,COMPANY_FILE_SEQ,ETC1,ETC2,ETC3,ETC4,ETC5,ETC6,ETC7,ETC8,ETC9,ETC10,CHKID,CHKDATE) values ('SSMS','DSEC','대성전기공업','EXT','001',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'05001',to_date('2015-04-06 19:04:00','YYYY-MM-DD HH24:MI:SS'));\n`;
    const rows = parseTsmt001(sql);
    assert.equal(rows[0].representCompany, false);
  });
});

describe("parseTsmt001 — real fixture (366 records)", () => {
  let rows: ReturnType<typeof parseTsmt001>;

  before(() => {
    const sql = readFileSync(
      resolve(__dirname, "../../../../../.local/TSMT001_회사마스터.sql"),
      "utf8",
    );
    rows = parseTsmt001(sql);
  });

  it("parses exactly 366 records", () => {
    assert.equal(rows.length, 366);
  });

  it("STLC sample: name and address match", () => {
    const stlc = rows.find((r) => r.code === "STLC");
    assert.ok(stlc, "STLC record should exist");
    assert.equal(stlc!.name, "에쓰오일토탈윤활유");
    assert.ok(stlc!.address?.includes("서울특별시 중구"), `address: ${stlc!.address}`);
  });
});
