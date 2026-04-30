-- P1 #1 단기차단 (2026-04-30) — Cross-tenant user lookup 데이터 레벨 차단.
-- login/route.ts, change-password/route.ts 가 workspace_id 없이 employee_id/email 로
-- user 를 전역 조회하므로, 같은 식별자가 여러 워크스페이스에 존재하면 다른 테넌트 계정으로
-- 인증되거나 비밀번호를 변경할 수 있는 P1 결함이 있다. 단일 테넌트 운영 중인 현 시점에
-- 글로벌 unique 제약을 걸어 데이터 레벨에서 차단한다 (충돌 데이터 발생 시 마이그레이션 실패).
--
-- TODO(multi-tenant, B안): 멀티테넌트 운영 전환 시 이 두 unique 제약을 DROP 하고
-- (workspace_id, employee_id) / (workspace_id, email) 복합 unique 로 교체할 것.
-- 동시에 host→workspaceId 라우팅을 미들웨어에 도입해 로그인/비밀번호 변경 쿼리에
-- workspace_id 필터를 추가해야 한다.
--
-- PostgreSQL 은 NULL 을 distinct 로 취급하므로 nullable email 에도 글로벌 unique 적용 가능.
-- 관련 schema: packages/db/schema/user.ts.

ALTER TABLE "user" ADD CONSTRAINT "user_employee_id_unique" UNIQUE("employee_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_unique" UNIQUE("email");