/**
 * packages/db/__tests__/schema/user-global-unique.test.ts
 *
 * P1 #1 — Cross-tenant user lookup 단기 차단 (A안).
 *
 * 로그인/비밀번호 변경 라우트가 workspaceId 없이 employeeId/email로 user를 전역 조회한다.
 * 두 워크스페이스에 동일 식별자가 존재하면 다른 테넌트 계정으로 인증되는 P1 결함이
 * 데이터 레벨에서 발생하지 않도록, user.employeeId / user.email 에 글로벌 unique 제약을 건다.
 *
 * 본 테스트는 schema 정의 자체에 unique constraint 가 박혀 있는지 introspect 한다.
 * 멀티테넌트(B안) 도입 시 이 테스트는 (workspace_id, employee_id) 복합 unique 검증으로 교체.
 *
 * 실행: `pnpm --filter @jarvis/db test`
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { getTableConfig } from "drizzle-orm/pg-core";
import { user } from "../../schema/user.js";

describe("user schema — global unique guard (P1 #1, A안 단기차단)", () => {
  const cfg = getTableConfig(user);
  const employeeIdCol = cfg.columns.find((c) => c.name === "employee_id");
  const emailCol = cfg.columns.find((c) => c.name === "email");

  it("user.employee_id 컬럼이 존재한다", () => {
    assert.ok(employeeIdCol, "employee_id column not found in user table");
  });

  it("user.email 컬럼이 존재한다", () => {
    assert.ok(emailCol, "email column not found in user table");
  });

  it("user.employee_id 에 글로벌 unique 제약이 걸려 있다", () => {
    assert.equal(
      employeeIdCol?.isUnique,
      true,
      "employee_id 에 .unique() 가 누락되었다 — cross-tenant lookup 방지를 위해 필요. " +
        "B안(멀티테넌트) 도입 시 (workspace_id, employee_id) 복합 unique 로 교체할 것.",
    );
  });

  it("user.email 에 글로벌 unique 제약이 걸려 있다", () => {
    assert.equal(
      emailCol?.isUnique,
      true,
      "email 에 .unique() 가 누락되었다 — cross-tenant lookup 방지를 위해 필요. " +
        "(PostgreSQL 은 NULL 을 distinct 로 취급하므로 nullable email 도 글로벌 unique 가능.) " +
        "B안 도입 시 (workspace_id, email) 복합 unique 로 교체할 것.",
    );
  });
});
