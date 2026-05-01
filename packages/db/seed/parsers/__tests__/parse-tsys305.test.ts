/**
 * packages/db/seed/parsers/__tests__/parse-tsys305.test.ts
 *
 * TSYS305 Oracle export SQL 파서 단위 테스트 (TDD).
 * 실행: node --test --import tsx packages/db/seed/parsers/__tests__/parse-tsys305.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { parseTsys305 } from "../parse-tsys305.js";

const SAMPLE = `
Insert into TSYS305 (ENTER_CD,SABUN,ID,PASSWORD,PASSWORDRMK,MAINPAGE_TYPE,SEARCH_TYPE,ROCKING_YN,CHKDATE,CHKID,SKIN_TYPE,FONT_TYPE,ORG_NM,MAIL_ID,NAME,JIKWEE_NM,JIKGUB_NM,JIKCHAK_NM,USE_YN,HAND_PHONE,OUT_SOURCED_YN,ORG_CD,REQUEST_NOTE) values ('SSMS','sd1712','SD24009','HASH=',null,null,'P','N',to_date('2026-01-09 16:36:06','YYYY-MM-DD HH24:MI:SS'),'21001','theme3','nanum','SaaS서비스팀','parksi@isu.co.kr','박성일','과장','과장','팀원','Y',null,'Y',null,null);
Insert into TSYS305 (ENTER_CD,SABUN,ID,PASSWORD,PASSWORDRMK,MAINPAGE_TYPE,SEARCH_TYPE,ROCKING_YN,CHKDATE,CHKID,SKIN_TYPE,FONT_TYPE,ORG_NM,MAIL_ID,NAME,JIKWEE_NM,JIKGUB_NM,JIKCHAK_NM,USE_YN,HAND_PHONE,OUT_SOURCED_YN,ORG_CD,REQUEST_NOTE) values ('SSMS','14001','14001','HASH2=',null,null,'P','N',to_date('2025-07-31 17:09:20','YYYY-MM-DD HH24:MI:SS'),'14004','theme4','dotum','WORKUP팀','sys_kmj@isu.co.kr','김명준','과장','과장','팀장','Y','010-3329-3929','N','2600',null);
Insert into TSYS305 (ENTER_CD,SABUN,ID,PASSWORD,PASSWORDRMK,MAINPAGE_TYPE,SEARCH_TYPE,ROCKING_YN,CHKDATE,CHKID,SKIN_TYPE,FONT_TYPE,ORG_NM,MAIL_ID,NAME,JIKWEE_NM,JIKGUB_NM,JIKCHAK_NM,USE_YN,HAND_PHONE,OUT_SOURCED_YN,ORG_CD,REQUEST_NOTE) values ('SSMS','SD22001','SD22001','HASH3=',null,null,'P','Y',to_date('2025-07-31 16:58:48','YYYY-MM-DD HH24:MI:SS'),'14004','theme4','dotum','HR 서비스팀','kms.hr@isu.co.kr','김민석','대리','대리','팀원','N',null,'Y','2200',null);
Insert into TSYS305 (ENTER_CD,SABUN,ID,PASSWORD,PASSWORDRMK,MAINPAGE_TYPE,SEARCH_TYPE,ROCKING_YN,CHKDATE,CHKID,SKIN_TYPE,FONT_TYPE,ORG_NM,MAIL_ID,NAME,JIKWEE_NM,JIKGUB_NM,JIKCHAK_NM,USE_YN,HAND_PHONE,OUT_SOURCED_YN,ORG_CD,REQUEST_NOTE) values ('SSMS','99001','99001','HASH4=',null,null,'P','N',to_date('2025-01-01 00:00:00','YYYY-MM-DD HH24:MI:SS'),'99001','theme1','dotum','퇴직자팀',null,'테스트퇴직','사원','사원','팀원','N',null,'N',null,null);
`;

describe("parseTsys305", () => {
  it("parses 4 rows", () => {
    const rows = parseTsys305(SAMPLE);
    assert.equal(rows.length, 4);
  });

  it("maps SABUN → employeeId, NAME → name, MAIL_ID → email", () => {
    const [first] = parseTsys305(SAMPLE);
    assert.ok(first);
    assert.equal(first.employeeId, "sd1712");
    assert.equal(first.name, "박성일");
    assert.equal(first.email, "parksi@isu.co.kr");
  });

  it("maps USE_YN=Y → status=active, USE_YN=N → status=inactive", () => {
    const rows = parseTsys305(SAMPLE);
    // row[1]: USE_YN=Y, ROCKING_YN=N → active
    assert.equal(rows[1]!.status, "active");
    // row[3]: USE_YN=N, ROCKING_YN=N → inactive
    assert.equal(rows[3]!.status, "inactive");
  });

  it("maps ROCKING_YN=Y → status=locked (overrides USE_YN)", () => {
    const rows = parseTsys305(SAMPLE);
    // row[2] has USE_YN=N + ROCKING_YN=Y → 'locked'
    assert.equal(rows[2]!.status, "locked");
  });

  it("maps OUT_SOURCED_YN=Y → isOutsourced=true", () => {
    const [first] = parseTsys305(SAMPLE);
    assert.ok(first);
    assert.equal(first.isOutsourced, true);
  });

  it("maps JIKWEE_NM → position, JIKCHAK_NM → jobTitle, HAND_PHONE → phone", () => {
    const [, second] = parseTsys305(SAMPLE);
    assert.equal(second!.position, "과장");
    assert.equal(second!.jobTitle, "팀장");
    assert.equal(second!.phone, "010-3329-3929");
  });

  it("preserves passwordHash verbatim", () => {
    const [first] = parseTsys305(SAMPLE);
    assert.ok(first);
    assert.equal(first.passwordHash, "HASH=");
  });

  it("treats null marker correctly (HAND_PHONE=null)", () => {
    const [first] = parseTsys305(SAMPLE);
    assert.ok(first);
    assert.equal(first.phone, null);
  });

  it("captures orgCode from ORG_CD (raw, mapping happens in seeder)", () => {
    const [, second] = parseTsys305(SAMPLE);
    assert.equal(second!.orgCode, "2600");
  });

  it("captures orgName from ORG_NM", () => {
    const [first] = parseTsys305(SAMPLE);
    assert.ok(first);
    assert.equal(first.orgName, "SaaS서비스팀");
  });
});
