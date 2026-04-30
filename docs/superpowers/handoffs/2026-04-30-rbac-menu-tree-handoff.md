# RBAC 메뉴 트리 도입 — 다른 세션 핸드오프

**작성일**: 2026-04-30
**플랜 파일**: `docs/superpowers/plans/2026-04-30-rbac-menu-tree.md`
**현재 main HEAD**: `09a8994` (`fix(ai/wiki-grep): wrap permission/sensitivity arrays with pgTextArray for ANY()`)
**기준 커밋**: 위 hash로 `git fetch && git reset --hard origin/main` 후 시작

---

## 요약

사이드바·CommandPalette 메뉴를 `apps/web/lib/routes.ts` 하드코딩에서 **DB(`menu_item` + `menu_permission` N:M)** 기반으로 전환. UNION 권한 매칭 + 부모-자식 cascade + ADMIN_ALL이 모든 메뉴에 자동 매핑.

**핵심 가치**: 어드민 메뉴를 DB로 옮기면, 향후 워크스페이스별 메뉴 커스터마이징 + 권한 grant/revoke로 메뉴 즉시 반영 + 운영자가 코드 수정 없이 메뉴 추가 가능.

---

## 사전 결정 1가지 (실행 전 사용자 합의 필수)

### Q. 기존 `menu_item` row를 어떻게 처리할까?

현재 상태(이미 확인됨):
- DB `SELECT count(*) FROM menu_item;` → **0건**
- 즉, **기존 데이터 없음. DELETE/legacy 처리 고민 불필요.** 바로 시드만 하면 됨.

→ **결정 끝**: Task 1 step 4의 "9건 처리" 분기는 무시하고 바로 진행.

(참고: 플랜은 작성 시점에 9건 가정했지만 현재 0건이라 깨끗한 상태)

---

## 시작 명령

```bash
cd /path/to/jarvis
git fetch origin && git checkout main && git reset --hard origin/main
git checkout -b claude/rbac-menu-tree

# 환경 검증
docker ps --format "{{.Names}}" | grep -E "jarvis-postgres|jarvis-minio"  # 둘 다 Up이어야 함
pnpm install
pnpm type-check  # 11/11 baseline 확인
docker exec jarvis-postgres psql -U jarvis -d jarvis -tAc "SELECT count(*) FROM menu_item;"  # 0 확인
```

---

## 실행 순서 (subagent-driven-development)

플랜의 Task 1~9을 순서대로 진행. 각 task는 독립 commit. **superpowers `subagent-driven-development` 스킬을 사용하라**.

### Task 1: schema 보강 + menu_permission 신규 (수동 작업 권장)

**중요**: drizzle-kit이 TTY 필요해서 interactive prompt에 막히는 경우가 빈번. 패턴은 manual SQL migration 작성:

1. `packages/db/schema/menu.ts` 보강:
   - `code: varchar("code", { length: 100 }).notNull()`
   - `kind: menuKindEnum("kind").default("menu").notNull()` (enum: `menu`, `action`)
   - `description: text("description")`
   - `parentId`에 self-FK + cascade: `.references((): AnyPgColumn => menuItem.id, { onDelete: "cascade" })`
   - unique index `(workspaceId, code)`

2. `packages/db/schema/menu-permission.ts` 신규:
   - PK: `(menuItemId, permissionId)` composite
   - 둘 다 cascade FK

3. 수동 SQL `packages/db/drizzle/00NN_menu_rbac.sql` 작성:
   ```sql
   CREATE TYPE "menu_kind" AS ENUM ('menu', 'action');
   ALTER TABLE "menu_item" ADD COLUMN "code" varchar(100);
   ALTER TABLE "menu_item" ADD COLUMN "kind" menu_kind DEFAULT 'menu' NOT NULL;
   ALTER TABLE "menu_item" ADD COLUMN "description" text;
   ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "menu_item"("id") ON DELETE cascade;
   -- code는 시드 후에 NOT NULL로 변경 (현재 0건이라 바로 NOT NULL 가능)
   ALTER TABLE "menu_item" ALTER COLUMN "code" SET NOT NULL;
   CREATE UNIQUE INDEX "menu_item_ws_code_unique" ON "menu_item" ("workspace_id", "code");

   CREATE TABLE "menu_permission" (
     "menu_item_id" uuid NOT NULL REFERENCES "menu_item"("id") ON DELETE cascade,
     "permission_id" uuid NOT NULL REFERENCES "permission"("id") ON DELETE cascade,
     PRIMARY KEY ("menu_item_id", "permission_id")
   );
   ```

4. `_journal.json`에 새 entry 추가 (현재 main 마지막 idx 확인 후 +1)
5. `pnpm db:migrate` 실행 → schema sync 검증

**검증**: `\d menu_item` + `\d menu_permission`로 컬럼/인덱스 확인.

### Task 2: routes.ts → menu_item 시드 함수

`packages/db/seed/menus.ts` 신규. 플랜의 `MENU_SEEDS` 31개 그대로 사용. **단, 권한 매핑은 실제 `permission` 테이블 row의 `(resource, action)` 조합과 일치 필요**.

`PERMISSIONS` const 위치: `packages/shared/constants/permissions.ts:1`. `ROLE_PERMISSIONS`도 같은 파일 line 40.

권한 키 형식 확인:
```bash
docker exec jarvis-postgres psql -U jarvis -d jarvis -tAc \
  "SELECT resource || '_' || action FROM permission ORDER BY 1 LIMIT 10;"
```
플랜의 `permKey = (p) => \`${p.resource.toUpperCase()}_${p.action.toUpperCase()}\``과 일치하는지 확인. 안 맞으면 mapping 함수 조정.

`packages/db/seed/dev.ts`에 `seedMenuTree(ws.id)` 모든 워크스페이스 호출 추가.

`pnpm db:seed && pnpm db:seed` (멱등성 검증). expected: `menu_item` count = 31 × workspace 수.

### Task 3: getVisibleMenuTree server helper

`apps/web/lib/server/menu-tree.ts` 신규. 핵심 SQL:

```sql
SELECT DISTINCT mi.id, mi.parent_id, mi.code, mi.kind, mi.label, mi.icon, mi.route_path, mi.sort_order
FROM menu_item mi
JOIN menu_permission mp ON mp.menu_item_id = mi.id
JOIN role_permission rp ON rp.permission_id = mp.permission_id
JOIN user_role ur ON ur.role_id = rp.role_id
WHERE ur.user_id = $1 AND mi.workspace_id = $2 AND mi.kind = $3 AND mi.is_visible = true
ORDER BY mi.sort_order
```

`buildMenuTree()` 단위 테스트 먼저 (TDD). cascade(라우트 없고 자식 없는 부모 hide) + sortOrder 검증.

### Task 4: Sidebar 재작성

- `apps/web/components/layout/icon-map.ts` 신규 — lucide 컴포넌트 매핑
- `apps/web/components/layout/Sidebar.tsx`: 기존 `NAV_ITEMS`/`ADMIN_ITEMS` import 제거, props로 `menus: MenuTreeNode[]` 받기
- `apps/web/app/(app)/layout.tsx`에서 `getVisibleMenuTree(session, "menu")` 호출 후 `<Sidebar menus={...}>` 전달

**주의**: `layout.tsx`는 이미 `await headers()` + `getSession`을 호출 중. 이걸 재사용해서 추가 round-trip 없도록.

**그룹 분리**: sortOrder `< 200`은 nav, `>= 200`은 admin (시드 컨벤션). 또는 `code` prefix(`nav.*` vs `admin.*`)로 분리. 둘 중 하나 선택.

### Task 5: routes.ts deprecate + CommandPalette

- `apps/web/lib/routes.ts`에 `@deprecated` JSDoc — export는 유지(테스트 호환)
- CommandPalette는 `getVisibleMenuTree(session, "action")` 결과를 `(app)/layout.tsx`에서 함께 받아 props 전달

### Task 6: <Authorized> HOC + hasPermission util

`packages/auth`에 `hasPermission(session, perm)` 이미 있을 가능성 — **먼저 grep 확인**:
```bash
grep -rn "hasPermission" packages/auth/ apps/web/lib/
```
없으면 `packages/auth/src/permissions.ts` 신규 + `index.ts`에 re-export.

`<Authorized>`는 client component. session은 props로 받기 (안전) 또는 hook 신설.

### Task 7: E2E

`apps/web/e2e/sidebar-rbac.spec.ts` — admin@jarvis.dev (admin123!) vs viewer 계정 메뉴 가시성 확인. dev-accounts.ts 참고.

### Task 8: 검증 게이트 일괄

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check  # ×2
pnpm --filter @jarvis/web lint
node scripts/check-schema-drift.mjs --precommit
pnpm test  # 모든 패키지
```

### Task 9: 하네스 갱신

- `.claude/skills/jarvis-architecture/SKILL.md`에 "RBAC 메뉴 트리" 섹션 추가
- `CLAUDE.md` 변경 이력 표에 1줄 추가

---

## 결정된 옵션 6가지 (변경 금지)

| # | 옵션 | 의미 |
|---|---|---|
| 1A | ADMIN_ALL 자동 매핑 | 모든 메뉴 시드 시 ADMIN_ALL 권한 자동 추가 |
| 2B | 부모 cascade | 자식 가시성 → 부모 자동 표시 |
| 3B | ANY 매칭 | 메뉴-권한 N:M, 사용자가 가진 권한 중 하나라도 매칭되면 표시 |
| 4C | server action 가드 + UI hint | 페이지 내 버튼은 진짜 가드는 server, `<Authorized>`는 UI hint만 |
| 5A | menu_item 테이블 | 데이터 소스는 routes.ts가 아닌 DB |
| 6A | kind 컬럼 통합 | NAV/ADMIN/ACTION을 별도 테이블 안 만들고 `kind` enum으로 |

---

## 시드 sortOrder 컨벤션 (핵심)

```
< 200    : NAV 그룹 (10, 20, 30, ..., 140)
200-399  : ADMIN 그룹 (200, 210, ..., 320)
>= 400   : ACTION (CommandPalette용 — 400, 410, 420, 430)
```

이 컨벤션을 **Sidebar.tsx 그룹 분리 로직**과 **CommandPalette filter**에서 사용.

---

## 환경 의존성

| 의존 | 상태 |
|---|---|
| Docker Postgres (`jarvis-postgres`) | Up 필요. 5436 포트, jarvis/jarvispass |
| `permission` 테이블 시드 | 이미 존재 (PERMISSIONS 34개). `ROLE_PERMISSIONS`도 정의됨 |
| `role` + `user_role` + `role_permission` | 이미 존재 (login route에서 사용 중) |
| `session.permissions` 필드 | login route가 이미 채움 (`apps/web/app/api/auth/login/route.ts:155`) |

---

## 기존 코드 참조 위치

| 항목 | 위치 |
|---|---|
| 현재 `menu_item` 정의 | `packages/db/schema/menu.ts` (25줄) |
| `permission` + `role` + `user_role` + `role_permission` | `packages/db/schema/user.ts` |
| `PERMISSIONS` 상수 + `ROLE_PERMISSIONS` 매핑 | `packages/shared/constants/permissions.ts` |
| 현재 routes (NAV_ITEMS/ADMIN_ITEMS/ACTION_ITEMS) | `apps/web/lib/routes.ts` |
| 현재 Sidebar 구현 (16종 mascot rotate 포함) | `apps/web/components/layout/Sidebar.tsx` |
| 세션 + 권한 빌드 로직 | `apps/web/app/api/auth/login/route.ts:148-157` |
| dev 계정 | `apps/web/lib/auth/dev-accounts.ts` (admin/admin123!) |

---

## 위험 요소 + 대응

| 위험 | 대응 |
|---|---|
| Drizzle migration TTY 충돌 | manual SQL 작성 + journal entry 직접 추가 (예전 0042/0044 패턴 참조) |
| permission 테이블의 `(resource, action)` 키 형식 불일치 | Task 2 시작 전 `SELECT DISTINCT resource, action FROM permission` 으로 실제 값 확인 후 `permKey` 함수 조정 |
| 기존 routes.ts를 import하는 코드 잔존 → 빌드 깨짐 | Task 5에서 deprecate만, export는 유지. 후속 task에서 점진적 제거 |
| `menu_item.parentId` self-FK가 schema에 미반영 (현재는 컬럼만 있고 FK 없음) | Task 1 manual SQL에서 명시 추가 |
| HMR 캐시로 sidebar 변경 미반영 | `rm -rf apps/web/.next-dev` 후 dev 재시작 |

---

## 후속 task로 분리된 것 (이 plan에서 제외)

- **admin/menus 편집 UI**: 트리 드래그/드롭, 권한 N:M 토글 UI. 이 plan은 read-only viewer까지만.
- **워크스페이스별 메뉴 커스터마이징**: 시드는 모든 ws에 동일. 추후 ws별 override 도입.
- **메뉴 변경 audit**: admin/menus 편집 시 audit_log 기록. 이 plan은 시드만이라 audit 불필요.

---

## 시작 시 첫 prompt (다른 세션에 붙여넣기)

```
docs/superpowers/handoffs/2026-04-30-rbac-menu-tree-handoff.md 를 읽고
docs/superpowers/plans/2026-04-30-rbac-menu-tree.md 의 Task 1부터 진행해줘.

전제:
- main 기준 09a8994 commit hash에서 시작
- claude/rbac-menu-tree 브랜치 생성
- menu_item 현재 0건 (DELETE/legacy 처리 불필요, 바로 시드)
- superpowers:subagent-driven-development 활용해서 task별 dispatch
- 각 task 완료 시 commit (PR은 안 만듦, push만)
- 검증 게이트 누락 금지 (type-check ×2, test ×2, schema-drift)

Task 1 끝나면 결과 보고해줘.
```

---

## 다른 세션에서 핸드오프 받은 후 첫 점검 명령

```bash
# 1. 작업 디렉토리 확인
pwd  # /path/to/jarvis

# 2. main 동기화
git fetch origin && git log -1 origin/main --oneline
# expected: 09a8994 또는 그 이후 (그 이후면 plan 영향 없는지 빠르게 확인)

# 3. 환경 healthcheck
docker ps | grep jarvis
pnpm type-check  # baseline 11/11

# 4. 핸드오프 + 플랜 둘 다 읽기
cat docs/superpowers/handoffs/2026-04-30-rbac-menu-tree-handoff.md
cat docs/superpowers/plans/2026-04-30-rbac-menu-tree.md

# 5. 브랜치 생성 후 Task 1 시작
git checkout -b claude/rbac-menu-tree
```

---

## 완료 정의 (DoD)

- [ ] Task 1~9 모두 commit 완료
- [ ] type-check ×2 PASS
- [ ] test ×2 PASS
- [ ] schema-drift PASS
- [ ] dev 서버에서 admin 사용자 접속 → 27개 메뉴 모두 보임
- [ ] dev 서버에서 viewer 사용자 접속 → admin 그룹 0개, nav 그룹 일부만 보임
- [ ] CommandPalette에 ACTION 4개 노출 (admin 기준)
- [ ] `routes.ts`에 @deprecated 표시
- [ ] hardness 갱신 (jarvis-architecture/SKILL.md + CLAUDE.md 이력)
- [ ] origin/claude/rbac-menu-tree로 push 완료 (PR은 사용자가 직접)

---

이 핸드오프 자체도 커밋해서 main에 올리면 다른 세션에서 fetch만으로 받을 수 있습니다.
