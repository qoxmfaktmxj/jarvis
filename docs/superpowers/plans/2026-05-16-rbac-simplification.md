# RBAC Simplification — 47권한·5역할 → 23권한·4역할

**작성일:** 2026-05-16
**상태:** 승인 대기 (Phase 0 종료, Phase 1 진행 전)
**규모:** 큰 변경 (165 코드 파일 + 4 seed 파일 + 운영 DB 마이그레이션 + 신규 페이지 1개)

## 1. 배경 + 결정 사항

### 1.1 사용자 디스커션 요약 (2026-05-16 세션)

| # | 결정 | 근거 |
|---|------|------|
| 1 | 47 권한 → **23 권한** 변형 2-tier (read/admin) + admin:all | UI에 47개가 보여서 비대 체감. 단순화 필요 |
| 2 | 5 역할 → **4 역할** (관리자/매니저/일반/연말정산) | 사용자 30-40명 규모. DEVELOPER/HR/VIEWER → MEMBER 통합 |
| 3 | DEVELOPER+HR+VIEWER 통합 = MEMBER | 운영 부담 ↓ |
| 4 | YEAREND 역할 추가 (외부 yearend 사이트용) | jarvis user 인증 공유, role 매핑 인프라 재사용. jarvis 내부 권한 0개 |
| 5 | owner check 도메인 = **knowledge + schedule 2개만** | 위키 작성자/본인 일정만 본인 row 격리. 나머지는 권한 부여로 통제 |
| 6 | `ASK_AI_RBAC_BYPASS=true` 플래그 (기본 true, 테스트 단계) | 권한 막혀서 답변 안 보이는 사이드이펙트 회피 |
| 7 | `/admin/roles` UI 페이지 신설 (그리드 표준) | 현재 역할-권한 매핑 변경 UI 없음. SoT 직접 편집만 가능 |
| 8 | 한국어 role 이름 매핑: ADMIN=관리자, MANAGER=매니저, MEMBER=일반, YEAREND=연말정산 | 사내 UI 친숙도 |

### 1.2 폐기되는 권한 (47 → 23, -24개)

| 도메인 | 폐기 | 흡수처 |
|--------|------|--------|
| knowledge | create/update/delete/review | `knowledge:admin` |
| project | create/update/delete/access:secret | `project:admin` |
| additional-dev | read/create/update/delete (전부) | `project:read/admin`로 흡수 (도메인 통합) |
| notice | create/update/delete | `notice:admin` |
| maintenance | write/stats-read | `maintenance:read/admin` |
| service-desk | import | `maintenance:admin` 흡수 (도메인 통합) |
| month-report | read/write (전부) | `maintenance:read/admin` 흡수 (도메인 통합) |
| infra | write | `infra:admin` |
| doc-num | write | `doc-num:admin` |
| faq | write | `faq:admin` |
| graph | build | `graph:admin` |
| contractor | read/admin (전부) | `user:read/admin` 흡수 (도메인 통합) |
| user | admin:users:write | `user:admin` (rename) |
| schedule | write | `schedule:admin` |
| sales | all | `sales:admin` (rename) |
| files | write | `admin:all` 흡수 (도메인 통합) |
| audit | read | `admin:all` 흡수 (도메인 통합) |

### 1.3 신규 23 권한 (resource:action)

```
1. knowledge:read     11. doc-num:read         21. sales:read
2. knowledge:admin    12. doc-num:admin        22. sales:admin
3. project:read       13. faq:read             23. admin:all
4. project:admin      14. faq:admin
5. notice:read        15. graph:read
6. notice:admin       16. graph:admin
7. maintenance:read   17. user:read
8. maintenance:admin  18. user:admin
9. infra:read         19. schedule:read
10. infra:admin       20. schedule:admin
```

### 1.4 4역할 매핑

| 권한 | 관리자 | 매니저 | 일반 | 연말정산 |
|------|--------|--------|------|----------|
| knowledge:read | ✅ | ✅ | ✅ | ❌ |
| knowledge:admin | ✅ | ✅ | ❌ | ❌ |
| project:read | ✅ | ✅ | ✅ | ❌ |
| project:admin | ✅ | ✅ | ❌ | ❌ |
| notice:read | ✅ | ✅ | ✅ | ❌ |
| notice:admin | ✅ | ✅ | ❌ | ❌ |
| maintenance:read | ✅ | ✅ | ✅ | ❌ |
| maintenance:admin | ✅ | ✅ | ❌ | ❌ |
| infra:read | ✅ | ✅ | ✅ | ❌ |
| infra:admin | ✅ | ✅ | ❌ | ❌ |
| doc-num:read | ✅ | ✅ | ✅ | ❌ |
| doc-num:admin | ✅ | ✅ | ❌ | ❌ |
| faq:read | ✅ | ✅ | ✅ | ❌ |
| faq:admin | ✅ | ✅ | ❌ | ❌ |
| graph:read | ✅ | ✅ | ✅ | ❌ |
| graph:admin | ✅ | ✅ | ❌ | ❌ |
| user:read | ✅ | ✅ | ❌ | ❌ |
| user:admin | ✅ | ❌ | ❌ | ❌ |
| schedule:read | ✅ | ✅ | ✅ | ❌ |
| schedule:admin | ✅ | ✅ | ✅ | ❌ |
| sales:read | ✅ | ✅ | ❌ | ❌ |
| sales:admin | ✅ | ✅ | ❌ | ❌ |
| admin:all | ✅ | ❌ | ❌ | ❌ |
| **카운트** | **23** | **20** | **10** | **0** |

### 1.5 owner check 패턴 (RBAC 밖 도메인 로직)

```ts
// knowledge / schedule server action에서만 적용
const isOwner = record.createdBy === session.userId;  // 또는 userId
const isSuperAdmin = hasPermission(session, PERMISSIONS.ADMIN_ALL);
if (!isOwner && !isSuperAdmin) {
  throw new Error("FORBIDDEN: not owner");
}
```

owner 컬럼:
- `knowledge_page.created_by` (확인 필요 — 스키마 확인)
- `schedule_event.user_id` (확인 필요)

### 1.6 마이그레이션 영향 통계

- 코드 호출처: **165 파일** (apps/web grep 결과)
- DB 영향: 47 permission + 5 role + 75 menu_permission + 3 user_role 매핑
- 신규 페이지: 1 (`/admin/roles`)
- 신규 환경 변수: 1 (`ASK_AI_RBAC_BYPASS`)
- 신규 마이그레이션: 1 SQL 파일 (운영 DB 적용)

## 2. 영향도 체크리스트 (17계층)

| 계층 | 변경 여부 | 비고 |
|------|----------|------|
| DB 스키마 | ❌ 없음 | role/permission/menu_permission 테이블 그대로 |
| Validation (Zod) | ✅ 추가 | `admin/role.ts` 신규 (역할-권한 매핑 입출력) |
| 권한 상수 (47→23) | ✅ **핵심 변경** | `packages/shared/constants/permissions.ts` SoT |
| 세션 vs 권한 모델 | ❌ 변경 없음 | requirePermission/requireSession 패턴 유지 |
| workspaceId 격리 | ❌ 변경 없음 | 모든 쿼리 그대로 |
| Ask AI tool-use agent | ⚠️ 일부 | `withWorkspaceRbacFilter` bypass 플래그 추가 |
| Wiki-fs (Karpathy) | ❌ 변경 없음 | |
| 검색 | ❌ 변경 없음 | |
| 서버 액션/API | ✅ **대량 변경** | 165 파일 `requirePermission(...)` 호출 변경 |
| 서버 로직 (lib) | ✅ 일부 | `packages/auth/rbac.ts` contractor 헬퍼 정리 |
| UI 라우트 | ✅ 신규 | `/admin/roles` 페이지 신설 (그리드 표준) |
| UI 컴포넌트 | ✅ 신규 + 일부 | `RolesPageClient`, `Authorized` HOC permission 타입 검증 |
| i18n 키 | ✅ 추가 | `Admin.Roles.*` 네임스페이스 |
| 테스트 | ✅ 신규 + 수정 | 권한 변경된 모든 단위 테스트 + e2e 4역할 가시성 |
| 워커 잡 | ❌ 변경 없음 | |
| LLM 호출 | ❌ 변경 없음 | |
| Audit | ✅ 일부 | role/permission 매핑 변경 시 audit_log 기록 (`admin.role_permission.*`) |

## 3. Task 분해 (subagent-driven-development 실행 순서)

작업이 크므로 9개 task로 분해. 각 task는 independent하지 않음 — 순차 실행 (의존성 명시).

### Task 1: SoT 변경 (`packages/shared/constants/permissions.ts`)

**파일:**
- `packages/shared/constants/permissions.ts` (전면 재작성)

**내용:**
- PERMISSIONS 47 → 23 (위 1.3 표)
- ROLE_PERMISSIONS 5역할 → 4역할 (위 1.4 표)
  - 역할 키: `ADMIN`, `MANAGER`, `MEMBER`, `YEAREND` (영문 code 유지)
- export `ROLE_LABELS` 신규 추가 (한글 라벨 매핑):
  ```ts
  export const ROLE_LABELS: Record<string, string> = {
    ADMIN: "관리자",
    MANAGER: "매니저",
    MEMBER: "일반",
    YEAREND: "연말정산",
  };
  ```

**검증:**
- `pnpm --filter @jarvis/shared type-check`

**Estimated edits:** 1 파일.

---

### Task 2: 권한 호환 매핑 + 코드 일괄 변경 (165 파일)

**의존성:** Task 1 완료 후.

**작업:**
- 권한 상수 호출처 일괄 변경. PERMISSIONS 키 변경 표:
  ```
  KNOWLEDGE_CREATE/UPDATE/DELETE/REVIEW → KNOWLEDGE_ADMIN
  KNOWLEDGE_ADMIN → KNOWLEDGE_ADMIN (그대로)
  PROJECT_CREATE/UPDATE/DELETE/ACCESS_SECRET → PROJECT_ADMIN
  ADDITIONAL_DEV_READ → PROJECT_READ
  ADDITIONAL_DEV_CREATE/UPDATE/DELETE → PROJECT_ADMIN
  NOTICE_CREATE/UPDATE/DELETE → NOTICE_ADMIN
  MAINTENANCE_WRITE → MAINTENANCE_ADMIN
  MAINTENANCE_STATS_READ → MAINTENANCE_READ
  SERVICE_DESK_IMPORT → MAINTENANCE_ADMIN
  MONTH_REPORT_READ → MAINTENANCE_READ
  MONTH_REPORT_WRITE → MAINTENANCE_ADMIN
  INFRA_WRITE → INFRA_ADMIN
  DOC_NUM_WRITE → DOC_NUM_ADMIN
  FAQ_WRITE → FAQ_ADMIN
  GRAPH_BUILD → GRAPH_ADMIN
  CONTRACTOR_READ → USER_READ
  CONTRACTOR_ADMIN → USER_ADMIN
  USER_WRITE → USER_ADMIN
  USER_READ → USER_READ (그대로)
  SCHEDULE_WRITE → SCHEDULE_ADMIN
  SALES_ALL → SALES_ADMIN
  FILES_WRITE → ADMIN_ALL
  AUDIT_READ → ADMIN_ALL
  ADMIN_ALL → ADMIN_ALL (그대로)
  ```

**파일:**
- 165 파일 (apps/web 모두) — `requirePermission(PERMISSIONS.X)` 일괄 grep+replace
- `packages/auth/rbac.ts` — `canManageContractors`, `canAccessContractorData`, `canAccessProjectAccessEntry` 헬퍼 정리/삭제 (CONTRACTOR_* 권한 폐기로 dead code)
- `apps/web/lib/server/page-auth.ts` 등 권한 사용처 점검

**검증:**
- `pnpm --filter @jarvis/web type-check` (모든 호출처 컴파일)
- `pnpm --filter @jarvis/web lint`
- 영향받는 단위 테스트 일부 실행

**주의사항:**
- `canAccessProjectAccessEntry` (rbac.ts:26) — `requiredRole`이 `DEVELOPER`/`MANAGER` 등 문자열을 받음. 4역할 체제에서 DEVELOPER 폐기 → 이 함수 호출처 확인 후 삭제 또는 단순화.
- `apps/web/components/auth/__tests__/Authorized.test.tsx` — `Permission` 타입 변경 영향

**Estimated edits:** 약 100-130 파일 (실제 변경 라인은 권한당 1-2줄).

---

### Task 3: DB 마이그레이션 SQL 작성 + 사용자 검토

**의존성:** Task 1 완료.

**파일:**
- `.local/legacy-ssms/postgres/10_admin/06_rbac_simplification.sql` (신규, 멱등 트랜잭션)

**SQL 내용 (트랜잭션 1개로 묶음):**
```sql
BEGIN;

-- 1. 신규 23 permission INSERT (멱등)
INSERT INTO permission (resource, action) VALUES
  ('knowledge', 'read'), ('knowledge', 'admin'),
  ('project', 'read'), ('project', 'admin'),
  ...
ON CONFLICT (resource, action) DO NOTHING;

-- 2. 신규 2 role INSERT (MEMBER, YEAREND)
INSERT INTO role (workspace_id, code, name, description, is_system) VALUES
  (:'WORKSPACE_ID'::uuid, 'MEMBER', '일반', '일반 사용자', true),
  (:'WORKSPACE_ID'::uuid, 'YEAREND', '연말정산',
   '외부 yearend 사이트 관리자 권한 (jarvis 내부 권한 없음)', true)
ON CONFLICT (workspace_id, code) DO NOTHING;

-- 3. 한글 role.name 업데이트 (ADMIN/MANAGER)
UPDATE role SET name = '관리자' WHERE workspace_id = :'WORKSPACE_ID' AND code = 'ADMIN';
UPDATE role SET name = '매니저' WHERE workspace_id = :'WORKSPACE_ID' AND code = 'MANAGER';

-- 4. user_role 재매핑: DEVELOPER/HR/VIEWER → MEMBER
UPDATE user_role
  SET role_id = (SELECT id FROM role WHERE workspace_id = :'WORKSPACE_ID' AND code = 'MEMBER')
WHERE role_id IN (
  SELECT id FROM role
  WHERE workspace_id = :'WORKSPACE_ID' AND code IN ('DEVELOPER', 'HR', 'VIEWER')
);

-- 5. menu_permission 권한 ID 재매핑 (구권한 ID → 신권한 ID)
-- 매핑 표 기반 일괄 UPDATE (각 행 별도)
UPDATE menu_permission SET permission_id = (SELECT id FROM permission WHERE resource='knowledge' AND action='admin')
WHERE permission_id IN (SELECT id FROM permission WHERE resource='knowledge' AND action IN ('create','update','delete','review'));
... (각 도메인별)

-- 6. role_permission 일괄 DELETE → 재배치
DELETE FROM role_permission
WHERE role_id IN (SELECT id FROM role WHERE workspace_id = :'WORKSPACE_ID');

-- 7. 4역할 × 23권한 신규 매핑 INSERT (76 entry: ADMIN 23 + MANAGER 20 + MEMBER 10 + YEAREND 0 + ROLE_PERMISSIONS source)

-- 8. 구 role 3개 DELETE (DEVELOPER/HR/VIEWER) — user_role/role_permission cascade 완료
DELETE FROM role
WHERE workspace_id = :'WORKSPACE_ID' AND code IN ('DEVELOPER', 'HR', 'VIEWER');

-- 9. 구 권한 47개 중 폐기된 24개 DELETE (cascade: menu_permission, role_permission)
DELETE FROM permission WHERE
  (resource = 'knowledge' AND action IN ('create','update','delete','review')) OR
  (resource = 'project' AND action IN ('create','update','delete')) OR
  (resource = 'project.access' AND action = 'secret') OR
  (resource = 'additional-dev') OR
  (resource = 'notice' AND action IN ('create','update','delete')) OR
  (resource = 'maintenance' AND action IN ('write','stats-read')) OR
  (resource = 'service-desk') OR
  (resource = 'month-report') OR
  (resource = 'infra' AND action = 'write') OR
  (resource = 'doc-num' AND action = 'write') OR
  (resource = 'faq' AND action = 'write') OR
  (resource = 'graph' AND action = 'build') OR
  (resource = 'contractor') OR
  (resource = 'admin' AND action IN ('users:read','users:write','audit:read')) OR
  (resource = 'files' AND action = 'write') OR
  (resource = 'sales' AND action = 'all');

-- 10. user:read/user:admin로 admin:users:* rename (CONFLICT 방지 위해 신규 INSERT 후 매핑 변경 → 구 DELETE 순서)
-- (위 9번 DELETE에 이미 포함)

COMMIT;
```

**검증 절차:**
1. SQL 작성 후 사용자에게 보여줌 (적용 전)
2. **사용자 승인 후** psql로 실행
3. 트랜잭션 실패 시 자동 ROLLBACK
4. 적용 후 카운트 검증:
   - permission COUNT = 23
   - role COUNT = 4 (workspace 1개당)
   - role_permission COUNT = 53 (23+20+10+0)
   - user_role 미스 0 (모든 user_role.role_id가 신 role에 매핑)
   - menu_permission 미스 0 (모든 menu_permission.permission_id가 신 permission에 매핑)

---

### Task 4: DB seed 파일 재생성

**의존성:** Task 1, 3 완료.

**파일:**
- `.local/scripts/seed-rbac.ts` (기존 — SoT 자동 반영, 변경 거의 없음)
- `.local/scripts/seed-menus.sql` (기존 — menu_permission 라인 일부 update 필요)

**확인:**
- seed-rbac.ts는 SoT(`PERMISSIONS`, `ROLE_PERMISSIONS`) 직접 읽음 → Task 1 완료 시 자동 반영
- seed-menus.sql은 권한 코드(`'admin:all'` 등) 직접 사용 → 폐기된 권한 코드 grep 후 매핑 표대로 변경
- private zip 채널 빌드 (`scripts/build-db-private-zip.mjs`)에서 두 파일 포함 확인

**검증:**
- `pnpm db:reset` 로컬에서 1회 실행 (멱등 + 일관 결과)

---

### Task 5: Ask AI RBAC bypass 플래그

**의존성:** Task 1 완료.

**파일:**
- `packages/ai/agent/tools/withWorkspaceRbacFilter.ts` (또는 sensitivity-filter.ts — 파일명 burn-in)
- `.env` 변경 (env 자체는 commit X)
- `.env.example` 갱신 (commit)

**구현:**
```ts
// packages/ai/agent/tools/withWorkspaceRbacFilter.ts (요약)
const RBAC_BYPASS = process.env.ASK_AI_RBAC_BYPASS === "true";

export function withWorkspaceRbacFilter<T>(
  session: JarvisSession,
  query: () => Promise<T[]>,
  filterByPermission: (rows: T[]) => T[],
): Promise<T[]> {
  if (RBAC_BYPASS) {
    // 테스트 단계: workspace만 격리, RBAC 우회
    return query();
  }
  return query().then(filterByPermission);
}
```

**.env.example 추가:**
```
# Ask AI 검색 결과의 RBAC 권한 필터 우회 (테스트 단계 true, prod 전 false)
ASK_AI_RBAC_BYPASS=true
```

**검증:**
- `pnpm --filter @jarvis/ai type-check`
- `pnpm eval:budget-test` (LLM 호출 정상)

---

### Task 6: owner check 패턴 도입 (knowledge + schedule)

**의존성:** Task 1, 2 완료.

**적용 server action 식별:**
- `apps/web/app/(app)/knowledge/[pageId]/edit/page.tsx` 관련 server action
- `apps/web/app/(app)/knowledge/[pageId]/page.tsx` (delete 등)
- `apps/web/app/api/knowledge/[pageId]/route.ts` (PUT/DELETE)
- schedule 도메인 위치 확인 (`/admin/schedule` 또는 `(app)/schedule/`?) → 검색 후 적용

**패턴:**
```ts
const session = await requirePermission(PERMISSIONS.KNOWLEDGE_ADMIN);
const page = await db.query.knowledgePage.findFirst({
  where: and(eq(knowledgePage.id, pageId), eq(knowledgePage.workspaceId, session.workspaceId)),
});
if (!page) throw new Error("NOT_FOUND");

const isOwner = page.createdBy === session.userId;
const isSuperAdmin = hasPermission(session, PERMISSIONS.ADMIN_ALL);
if (!isOwner && !isSuperAdmin) {
  throw new Error("FORBIDDEN: not owner");
}
// 이후 update/delete 실행
```

**unit 테스트 신규:**
- `knowledge-owner-check.test.ts` — owner / 다른 사용자 / admin:all 3가지 케이스
- `schedule-owner-check.test.ts` — 동일

**검증:**
- `pnpm --filter @jarvis/web type-check`
- 신규 테스트 통과

---

### Task 7: `/admin/roles` 페이지 신설 (그리드 표준)

**의존성:** Task 1, 3 완료.

**파일:**
- `apps/web/app/(app)/admin/roles/page.tsx` (Server Component)
- `apps/web/app/(app)/admin/roles/actions.ts` (server action — listRoles, saveRoles, listRolePermissions, saveRolePermissions)
- `apps/web/app/(app)/admin/roles/_components/RolesPageClient.tsx` (master/detail 그리드)
- `packages/shared/validation/admin/role.ts` (Zod 입출력)

**패턴 참고:**
- `apps/web/app/(app)/admin/menus/page.tsx` (master/detail 패턴 reference)
- `.claude/skills/jarvis-architecture/references/grid-standard.md` (그리드 표준 9 sub-section 준수)

**필수 그리드 기능:**
- [x] master = role 그리드 (4역할)
- [x] detail = role_permission toggle 그리드 (선택된 role에 매핑된 권한 add/remove)
- [x] 인라인 편집 + dirty tracking + batch save
- [x] 툴바 3버튼 (추가/저장/되돌리기)
- [x] 필터 row
- [x] confirm dialog (저장 전)
- [x] `onResetGrid` required prop
- [x] 권한: `requirePermission(PERMISSIONS.ADMIN_ALL)`

**i18n 키 (Task 9에서 함께 처리):**
- `Admin.Roles.title`, `.description`
- `Admin.Roles.columns.code`, `.name`, `.description`
- `Admin.Roles.details.title`, `.empty`
- `Admin.Roles.actions.add`, `.save`, `.revert`

**검증:**
- `pnpm --filter @jarvis/web type-check`
- `pnpm --filter @jarvis/web lint`
- 신규 페이지 그리드 표준 PR 체크리스트 11항 통과 (자동 audit grep)

---

### Task 8: menu_item 신규 entry (`/admin/roles`)

**의존성:** Task 7 완료.

**파일:**
- `.local/scripts/seed-menus.sql` (1 entry 추가 + 운영 DB 즉시 적용)

**추가 entry:**
```sql
INSERT INTO menu_item (workspace_id, code, kind, label, icon, route_path, sort_order, is_visible)
VALUES (:'ws', 'ADMIN_ROLES', 'menu', '역할', 'ShieldCheck', '/admin/roles', 305, true)
ON CONFLICT (workspace_id, code) DO UPDATE
  SET label = EXCLUDED.label, icon = EXCLUDED.icon, route_path = EXCLUDED.route_path,
      sort_order = EXCLUDED.sort_order;

INSERT INTO menu_permission (menu_item_id, permission_id)
SELECT mi.id, p.id
FROM menu_item mi, permission p
WHERE mi.workspace_id = :'ws' AND mi.code = 'ADMIN_ROLES'
  AND p.resource = 'admin' AND p.action = 'all'
ON CONFLICT (menu_item_id, permission_id) DO NOTHING;
```

**검증:**
- DB에 menu_item 추가 확인
- 사이드바 ADMIN_GROUP 아래 "역할" 메뉴 노출 확인 (ADMIN 사용자 로그인)

---

### Task 9: i18n 키 추가 (`Admin.Roles.*`)

**의존성:** Task 7 완료.

**파일:**
- `apps/web/messages/ko.json` (Admin.Roles 네임스페이스 추가)

**키 목록:**
```json
{
  "Admin": {
    "Roles": {
      "title": "역할",
      "description": "워크스페이스 역할과 권한 매핑을 관리합니다.",
      "columns": {
        "code": "코드",
        "name": "이름",
        "description": "설명",
        "isSystem": "시스템",
        "permCount": "권한 수"
      },
      "details": {
        "title": "선택된 역할의 권한 매핑",
        "empty": "역할을 선택하세요.",
        "addPermission": "권한 추가",
        "removePermission": "권한 제거"
      },
      "actions": {
        "add": "역할 추가",
        "save": "저장",
        "revert": "되돌리기"
      },
      "total": "전체 {count}건"
    }
  }
}
```

**검증:**
- `pnpm --filter @jarvis/web type-check`
- spec-reviewer 경계면 검증 (보간 변수 `{count}` 일치)

---

### Task 10: e2e 테스트 (역할별 메뉴 가시성)

**의존성:** Task 1-9 완료.

**파일:**
- `apps/web/e2e/rbac-4-roles-visibility.spec.ts` (신규)

**테스트 케이스:**
- 관리자 로그인 → 모든 메뉴 노출 (ADMIN_GROUP 포함)
- 매니저 로그인 → ADMIN_GROUP 비노출, SALES_GROUP 노출
- 일반 로그인 → ADMIN_GROUP·SALES_GROUP 비노출, NAV 메뉴는 노출
- 연말정산 로그인 → jarvis 메인 메뉴 노출되지 않음 (또는 dashboard만)
- `/admin/roles` 직접 접속:
  - 관리자: 정상 진입
  - 매니저: `/dashboard?error=forbidden` redirect
- owner check:
  - 일반 A가 작성한 knowledge_page 일반 B가 수정 시도 → 403
  - 관리자(ADMIN_ALL)는 통과

**검증:**
- `pnpm --filter @jarvis/web exec playwright test rbac-4-roles-visibility`

---

### Task 11: 검증 게이트 + 문서화 + CLAUDE.md 변경 이력

**의존성:** Task 1-10 완료.

**검증 게이트 (모두 통과):**
- `pnpm --filter @jarvis/web type-check` (2회)
- `pnpm --filter @jarvis/web lint`
- `pnpm test` (영향 범위)
- `pnpm audit:rsc` (RSC 경계 변경 0건이지만 sanity)
- `pnpm --filter @jarvis/web exec playwright test rbac-4-roles-visibility`
- 운영 DB 적용 확인 (Task 3, 8 SQL 적용 후 카운트 재확인)

**문서 갱신:**
- `CLAUDE.md` 변경 이력 entry 추가 (2026-05-16 RBAC simplification)
- `.claude/skills/jarvis-db-patterns/SKILL.md` 권한 카운트 47→23, 5역할→4역할 갱신
- `.claude/skills/jarvis-architecture/SKILL.md` 권한 카운트 갱신 (해당 섹션)
- `README.md` 권한 카운트 grep + 갱신 (있으면)

## 4. 파일 변경 순서 (jarvis-architecture 20단계 매핑)

| 단계 | 파일 | Task |
|------|------|------|
| 1. DB 스키마 | - | (변경 없음) |
| 2. Zod validation | `packages/shared/validation/admin/role.ts` | Task 7 |
| 3. 권한 상수 | `packages/shared/constants/permissions.ts` | Task 1 |
| 4. Auth 헬퍼 | `packages/auth/rbac.ts` (contractor 헬퍼 정리) | Task 2 |
| 5-9 | (변경 없음) | - |
| 10. 웹 lib | `apps/web/lib/server/page-auth.ts` (영향 받으면) | Task 2 |
| 11-12. server action | 165 파일 일괄 + 신규 `/admin/roles/actions.ts` + owner check | Task 2, 6, 7 |
| 13. API route | 영향 받는 route.ts | Task 2 |
| 14. RSC | `apps/web/app/(app)/admin/roles/page.tsx` | Task 7 |
| 15. Client | `apps/web/app/(app)/admin/roles/_components/RolesPageClient.tsx` | Task 7 |
| 16. i18n | `apps/web/messages/ko.json` | Task 9 |
| 17-18. 워커 | (변경 없음) | - |
| 19. 테스트 | unit + e2e | Task 6, 10 |

**Ask AI bypass (Task 5)는 8번째 단계의 packages/ai/** 변경이므로 Task 2와 평행 실행 가능.**

## 5. 리스크 + 완화책

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 165 파일 호출처 누락 | 일부 권한이 의도와 다르게 적용 | type-check (PERMISSIONS const 키 변경) + lint으로 컴파일 차단 |
| 운영 DB 마이그레이션 실패 | 사용자 로그인 불가 | 트랜잭션 BEGIN/COMMIT 사용. 백업 전 dry-run으로 SQL 검증 |
| user_role 매핑 누락 | 일부 사용자 권한 0 | UPDATE 후 user_role.role_id 검증 쿼리 (Task 3) |
| menu_permission 매핑 누락 | 일부 메뉴 노출 X | UPDATE 후 menu_permission.permission_id 검증 |
| owner check 누락 | 다른 사용자 knowledge 임의 수정 | 신규 unit 테스트로 owner/non-owner/admin 케이스 강제 |
| Ask AI bypass 영구 활성화 | prod에서 RBAC 우회 잔존 | `.env.example`에 경고 주석 + Task 11 문서화 |
| `/admin/roles` 페이지 권한 가드 누락 | 비관리자 진입 가능 | `requirePermission(PERMISSIONS.ADMIN_ALL)` + redirect 가드 |

## 6. 승인 게이트

본 plan 진행 전 **사용자 승인 필요한 결정 사항:**
- [x] 23권한 + 4역할 + 한글 라벨 → 사용자 확인 완료 (1.1 표)
- [x] owner check 도메인 = knowledge + schedule → 사용자 확인 완료
- [x] Ask AI bypass 기본 true → 사용자 확인 완료
- [x] `/admin/roles` 신설 → 사용자 확인 완료
- [ ] **Task 3 마이그레이션 SQL 검토** — 작성 후 적용 전 사용자에게 보여줌
- [ ] **PR 형태** — 단일 PR vs 단계별 PR (사용자 선호 미정, 사용자 답 "구현 진행" → 단일 작업으로 가정)

## 7. 검증 게이트 명령 요약

```bash
# Task 1
pnpm --filter @jarvis/shared type-check

# Task 2
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm test --filter @jarvis/web      # 단위 테스트 일부

# Task 3 (SQL 적용)
psql -h 175.119.100.113 -U jarvis -d jarvis \
  -v WORKSPACE_ID='7a995ab9-525c-415a-a8ea-34863fe002bb' \
  -f .local/legacy-ssms/postgres/10_admin/06_rbac_simplification.sql

# Task 5
pnpm --filter @jarvis/ai type-check
pnpm eval:budget-test

# Task 7
pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
pnpm audit:rsc

# Task 10
pnpm --filter @jarvis/web exec playwright test rbac-4-roles-visibility
```
