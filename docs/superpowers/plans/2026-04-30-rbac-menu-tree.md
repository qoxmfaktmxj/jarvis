# RBAC Menu Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** 사이드바 메뉴를 DB 기반 트리(`menu_item`)로 구성하고 권한별 가시성을 N:M 매핑(UNION 모델)으로 제어한다. ADMIN_ALL은 모든 메뉴에 자동 매핑(옵션 1A), 부모는 자식 가시성으로 자동 cascade(옵션 2B), 메뉴-권한 ANY 매칭(옵션 3B), 페이지 내 액션 권한은 server action 가드 + UI hint(옵션 4C), 데이터 소스는 menu_item 테이블(옵션 5A), ACTION_ITEMS는 `kind` 컬럼으로 통합(옵션 6A).

**Architecture:**
- `menu_item` 테이블 보강: `code`/`kind`(menu|action)/`description` 추가 + `parent_id` self-FK 명시
- `menu_permission` N:M 테이블 신규 (menuItemId × permissionId)
- `routes.ts`의 27개(NAV_ITEMS 14 + ADMIN_ITEMS 13) + ACTION_ITEMS 4개를 `menu_item`에 시드 + `ROLE_PERMISSIONS` 기반 권한 자동 매핑 + ADMIN_ALL은 전 메뉴 매핑
- Server helper `getVisibleMenuTree(session)` → cascade 포함 트리 반환
- Sidebar는 RSC가 트리 받아 client component로 전달
- 페이지 버튼 권한: `hasPermission(session, perm)` util + `<Authorized perm>` HOC (UI hint) + server action 진짜 가드
- routes.ts는 deprecate 표기, CommandPalette도 DB 메뉴 사용

**Tech Stack:** Drizzle ORM · Next.js 15 App Router · next-intl · pnpm workspace · PostgreSQL

---

## File Structure

### Backend (DB)
- Modify: `packages/db/schema/menu.ts` — menuItem에 `code`/`kind`/`description`/`keywords` 추가, `parentId` self-FK
- Create: `packages/db/schema/menu-permission.ts` — `menu_permission` 테이블
- Modify: `packages/db/schema/index.ts` — re-export
- Create (auto): `packages/db/drizzle/NNNN_menu_rbac.sql`
- Create: `packages/db/seed/menus.ts` — `seedMenuTree(workspaceId)` 함수 (routes.ts 데이터를 menu_item에 시드)
- Modify: `packages/db/seed/dev.ts` — 모든 ws에 시드 호출

### Server helpers / Auth
- Create: `apps/web/lib/server/menu-tree.ts` — `getVisibleMenuTree(session)`
- Modify or Create: `packages/auth/src/permissions.ts` — `hasPermission(session, perm)` util (이미 있을 가능성 있음 — 위치 확인 후)
- Create: `apps/web/components/auth/Authorized.tsx` — UI hint HOC

### UI
- Modify: `apps/web/components/layout/Sidebar.tsx` — DB 트리 사용 (props로 받음)
- Modify: `apps/web/app/(app)/layout.tsx` — RSC에서 트리 빌드 후 Sidebar에 props 전달
- Modify: `apps/web/components/layout/CommandPalette.tsx` — DB 액션 항목 사용
- Modify: `apps/web/lib/routes.ts` — `@deprecated` 마크 + 핵심 export만 호환성 유지 (NAV_ITEMS/ADMIN_ITEMS/ACTION_ITEMS는 시드 직후 deprecated 처리, 즉시 삭제는 X)
- Create: `apps/web/app/(app)/admin/menus/page.tsx` (또는 기존 보강) — 트리 편집 + 권한 매핑 UI (이번 plan은 read-only viewer까지만, 편집 UI는 후속 task로 분리)

### i18n
- Modify: `apps/web/messages/ko.json` — Admin.Menus.* 보강 (read-only viewer용)

### Tests
- Create: `apps/web/lib/server/__tests__/menu-tree.test.ts` — cascade/UNION 단위 테스트
- Create: `apps/web/e2e/sidebar-rbac.spec.ts` — admin vs viewer 메뉴 가시성 e2e

### Harness
- Modify: `.claude/skills/jarvis-architecture/SKILL.md` — "RBAC 메뉴 트리" 섹션 추가
- Modify: `CLAUDE.md` — 변경 이력 1줄

---

## 영향도 체크리스트

| 계층 | 변경 |
|------|------|
| DB 스키마 | ✅ menu.ts 확장 + menu-permission.ts 신규 |
| Validation | ✅ Zod 스키마 (입력 작은 admin/menus용) |
| 권한 (34) | ❌ 신규 권한 없음 — 기존 활용 |
| 세션 모델 | ❌ 변경 없음 |
| Sensitivity | ❌ 무관 |
| Ask AI | ❌ 무관 |
| Wiki-fs | ❌ 무관 |
| 검색 | ❌ 무관 |
| 서버 액션 | ✅ menu-tree.ts (RSC용 헬퍼) |
| API route | ❌ 변경 없음 |
| UI 라우트 | ✅ admin/menus (선택) |
| UI 컴포넌트 | ✅ Sidebar/Authorized/CommandPalette |
| i18n | ✅ Admin.Menus 추가 |
| 테스트 | ✅ unit(menu-tree) + e2e |
| 워커 잡 | ❌ 무관 |
| LLM 호출 | ❌ 무관 |
| Audit | ✅ 메뉴 권한 변경 시 audit (admin/menus 편집 task — 이 plan은 read-only) |

---

## Task 1: menu_item schema 보강 + menu_permission 신규

**Files:**
- Modify: `packages/db/schema/menu.ts`
- Create: `packages/db/schema/menu-permission.ts`
- Modify: `packages/db/schema/index.ts`

- [ ] **Step 1: menu.ts 보강**

```ts
// packages/db/schema/menu.ts
import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { workspace } from "./tenant.js";

export const menuKindEnum = pgEnum("menu_kind", ["menu", "action"]);

export const menuItem = pgTable(
  "menu_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspace.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => menuItem.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull(),  // 'admin.companies' 같은 도트 표기, ws 내 unique
    kind: menuKindEnum("kind").notNull().default("menu"),
    label: varchar("label", { length: 200 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    routePath: varchar("route_path", { length: 300 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    requiredRole: varchar("required_role", { length: 50 }),  // @deprecated — menu_permission으로 대체. 호환성 위해 보존
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsCodeUnique: uniqueIndex("menu_item_ws_code_unique").on(t.workspaceId, t.code),
  }),
);
```

- [ ] **Step 2: menu-permission.ts 신규**

```ts
// packages/db/schema/menu-permission.ts
import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { menuItem } from "./menu.js";
import { permission } from "./user.js";

export const menuPermission = pgTable(
  "menu_permission",
  {
    menuItemId: uuid("menu_item_id").notNull().references(() => menuItem.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permission.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.menuItemId, t.permissionId] }),
  }),
);
```

- [ ] **Step 3: index.ts re-export**

`packages/db/schema/index.ts`에 추가:
```ts
export * from "./menu.js";
export * from "./menu-permission.js";
```

- [ ] **Step 4: 마이그레이션 생성 + 적용**

```bash
pnpm db:generate
pnpm db:migrate
```

기존 menu_item 9건 데이터: `code`가 NOT NULL이라 마이그레이션 실패 가능. **Pre-step**: 마이그레이션 SQL 검토 후 `code` 컬럼을 임시 nullable로 추가 → 기존 행 임의 코드(`legacy.{id-prefix}`) 채움 → NOT NULL로 변경하는 2단계 처리. 또는 기존 9건 삭제 후 시드로 재생성 (사용자 합의 받기).

검증:
```bash
node scripts/check-schema-drift.mjs --precommit
PGPASSWORD=jarvispass psql -h localhost -p 5436 -U jarvis -d jarvis -c "\d menu_item"
PGPASSWORD=jarvispass psql -h localhost -p 5436 -U jarvis -d jarvis -c "\d menu_permission"
```

- [ ] **Step 5: 커밋**

```bash
git add packages/db/schema/menu.ts packages/db/schema/menu-permission.ts packages/db/schema/index.ts packages/db/drizzle/
git commit -m "feat(db): add menu_item.code/kind + menu_permission table"
```

---

## Task 2: routes.ts → menu_item 시드 함수

**Files:**
- Create: `packages/db/seed/menus.ts`
- Modify: `packages/db/seed/dev.ts`

`routes.ts`의 NAV_ITEMS 14 + ADMIN_ITEMS 13 + ACTION_ITEMS 4 = 31개를 시드. 각각:
- code: 도트 표기 (예: `nav.notices`, `admin.companies`, `action.new-notice`)
- kind: NAV/ADMIN_ITEMS = `menu`, ACTION_ITEMS = `action`
- icon: lucide 아이콘 이름 문자열 (예: `Megaphone`, `Building2`)
- routePath: href
- sortOrder: 배열 인덱스

권한 매핑 규칙:
- NAV_ITEMS 일반: 보편 접근 → 모든 role의 read 권한 매핑 (예: `nav.notices` → `NOTICE_READ`)
- ADMIN_ITEMS: `ADMIN_ALL` 필수 (admin/layout.tsx isAdmin 가드와 일관)
- ACTION_ITEMS: 해당 도메인 CREATE 권한 (예: `action.new-notice` → `NOTICE_CREATE`)
- 모든 메뉴에 추가로 `ADMIN_ALL` 매핑 → ADMIN role 자동 모두 보임

- [ ] **Step 1: seedMenuTree 작성**

```ts
// packages/db/seed/menus.ts
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { menuItem, menuPermission, permission } from "../schema/index.js";

type SeedItem = {
  code: string;
  kind: "menu" | "action";
  label: string;
  routePath: string;
  icon?: string;
  description?: string;
  sortOrder: number;
  permissions: string[];  // resource:action 또는 resource_action 형식 (실제 시드 PERMISSIONS와 일치 필요)
};

const MENU_SEEDS: SeedItem[] = [
  // NAV_ITEMS — 일반 사용자 메뉴 (read 권한 + ADMIN_ALL)
  { code: "nav.notices",      kind: "menu", label: "공지사항",       icon: "Megaphone",     routePath: "/notices",            sortOrder:  10, permissions: ["NOTICE_READ", "ADMIN_ALL"] },
  { code: "nav.ask",          kind: "menu", label: "AI 질문",        icon: "MessageSquare", routePath: "/ask",                sortOrder:  20, permissions: ["KNOWLEDGE_READ", "ADMIN_ALL"] },
  { code: "nav.search",       kind: "menu", label: "검색",           icon: "Search",        routePath: "/search",             sortOrder:  30, permissions: ["KNOWLEDGE_READ", "ADMIN_ALL"] },
  { code: "nav.wiki",         kind: "menu", label: "위키",           icon: "Library",       routePath: "/wiki",               sortOrder:  40, permissions: ["KNOWLEDGE_READ", "ADMIN_ALL"] },
  { code: "nav.wiki-graph",   kind: "menu", label: "위키 그래프",    icon: "GitFork",       routePath: "/wiki/graph",         sortOrder:  50, permissions: ["GRAPH_READ", "ADMIN_ALL"] },
  { code: "nav.wiki-ingest",  kind: "menu", label: "위키 수동수집",  icon: "FilePlus",      routePath: "/wiki/ingest/manual", sortOrder:  60, permissions: ["KNOWLEDGE_CREATE", "ADMIN_ALL"] },
  { code: "nav.knowledge",    kind: "menu", label: "Knowledge",      icon: "BookOpen",      routePath: "/knowledge",          sortOrder:  70, permissions: ["KNOWLEDGE_READ", "ADMIN_ALL"] },
  { code: "nav.projects",     kind: "menu", label: "프로젝트",       icon: "Server",        routePath: "/projects",           sortOrder:  80, permissions: ["PROJECT_READ", "ADMIN_ALL"] },
  { code: "nav.architecture", kind: "menu", label: "아키텍처",       icon: "Network",       routePath: "/architecture",       sortOrder:  90, permissions: ["GRAPH_READ", "ADMIN_ALL"] },
  { code: "nav.infra",        kind: "menu", label: "인프라",         icon: "HardDrive",     routePath: "/infra",              sortOrder: 100, permissions: ["SYSTEM_READ", "ADMIN_ALL"] },
  { code: "nav.add-dev",      kind: "menu", label: "추가개발",       icon: "ClipboardList", routePath: "/add-dev",            sortOrder: 110, permissions: ["ADDITIONAL_DEV_READ", "ADMIN_ALL"] },
  { code: "nav.contractors",  kind: "menu", label: "외주인력관리",   icon: "Users",         routePath: "/contractors",        sortOrder: 120, permissions: ["ATTENDANCE_READ", "ADMIN_ALL"] },
  { code: "nav.holidays",     kind: "menu", label: "공휴일 관리",    icon: "CalendarX",     routePath: "/holidays",           sortOrder: 130, permissions: ["ATTENDANCE_ADMIN", "ADMIN_ALL"] },
  { code: "nav.profile",      kind: "menu", label: "프로필",         icon: "User",          routePath: "/profile",            sortOrder: 140, permissions: ["ADMIN_ALL"] /* 모든 사용자 */ },

  // ADMIN_ITEMS — ADMIN_ALL 필수
  { code: "admin.companies",          kind: "menu", label: "회사",         icon: "Building2",   routePath: "/admin/companies",                sortOrder: 200, permissions: ["ADMIN_ALL"] },
  { code: "admin.users",              kind: "menu", label: "사용자",       icon: "Users",       routePath: "/admin/users",                    sortOrder: 210, permissions: ["ADMIN_ALL"] },
  { code: "admin.organizations",      kind: "menu", label: "조직",         icon: "Building",    routePath: "/admin/organizations",            sortOrder: 220, permissions: ["ADMIN_ALL"] },
  { code: "admin.menus",              kind: "menu", label: "메뉴",         icon: "ListTree",    routePath: "/admin/menus",                    sortOrder: 230, permissions: ["ADMIN_ALL"] },
  { code: "admin.codes",              kind: "menu", label: "코드",         icon: "Hash",        routePath: "/admin/codes",                    sortOrder: 240, permissions: ["ADMIN_ALL"] },
  { code: "admin.review-queue",       kind: "menu", label: "검토 대기",    icon: "Inbox",       routePath: "/admin/review-queue",             sortOrder: 250, permissions: ["ADMIN_ALL"] },
  { code: "admin.audit",              kind: "menu", label: "감사 로그",    icon: "ScrollText",  routePath: "/admin/audit",                    sortOrder: 260, permissions: ["ADMIN_ALL"] },
  { code: "admin.search-analytics",   kind: "menu", label: "검색 분석",    icon: "BarChart3",   routePath: "/admin/search-analytics",         sortOrder: 270, permissions: ["ADMIN_ALL"] },
  { code: "admin.settings",           kind: "menu", label: "설정",         icon: "Settings",    routePath: "/admin/settings",                 sortOrder: 280, permissions: ["ADMIN_ALL"] },
  { code: "admin.llm-cost",           kind: "menu", label: "LLM 비용",     icon: "Coins",       routePath: "/admin/llm-cost",                 sortOrder: 290, permissions: ["ADMIN_ALL"] },
  { code: "admin.wiki-observability", kind: "menu", label: "위키 운영",    icon: "Activity",    routePath: "/admin/observability/wiki",       sortOrder: 300, permissions: ["ADMIN_ALL"] },
  { code: "admin.wiki-violations",    kind: "menu", label: "경계 위반",    icon: "ShieldAlert", routePath: "/admin/wiki/boundary-violations", sortOrder: 310, permissions: ["ADMIN_ALL"] },
  { code: "admin.wiki-review",        kind: "menu", label: "위키 리뷰 큐", icon: "ListChecks",  routePath: "/admin/wiki/review-queue",        sortOrder: 320, permissions: ["ADMIN_ALL"] },

  // ACTION_ITEMS — 도메인 CREATE 권한
  { code: "action.new-notice",  kind: "action", label: "새 공지 작성", icon: "FileText", routePath: "/notices/new",   sortOrder: 400, permissions: ["NOTICE_CREATE", "ADMIN_ALL"] },
  { code: "action.new-kb",      kind: "action", label: "새 KB 페이지", icon: "FileText", routePath: "/knowledge/new", sortOrder: 410, permissions: ["KNOWLEDGE_CREATE", "ADMIN_ALL"] },
  { code: "action.new-project", kind: "action", label: "새 프로젝트",  icon: "Plus",     routePath: "/projects/new",  sortOrder: 420, permissions: ["PROJECT_CREATE", "ADMIN_ALL"] },
  { code: "action.settings",    kind: "action", label: "설정",         icon: "Settings", routePath: "/profile",       sortOrder: 430, permissions: ["ADMIN_ALL"] },
];

export async function seedMenuTree(workspaceId: string) {
  // 1) menu_item upsert
  for (const seed of MENU_SEEDS) {
    await db.insert(menuItem).values({
      workspaceId,
      code: seed.code,
      kind: seed.kind,
      label: seed.label,
      icon: seed.icon ?? null,
      routePath: seed.routePath,
      sortOrder: seed.sortOrder,
      description: seed.description ?? null,
    }).onConflictDoUpdate({
      target: [menuItem.workspaceId, menuItem.code],
      set: {
        kind: sql`excluded.kind`,
        label: sql`excluded.label`,
        icon: sql`excluded.icon`,
        routePath: sql`excluded.route_path`,
        sortOrder: sql`excluded.sort_order`,
        description: sql`excluded.description`,
      },
    });
  }

  // 2) menu_permission 매핑
  const items = await db.select({ id: menuItem.id, code: menuItem.code })
    .from(menuItem).where(sql`${menuItem.workspaceId} = ${workspaceId}`);
  const permsAll = await db.select({ id: permission.id, resource: permission.resource, action: permission.action }).from(permission);
  const permKey = (p: typeof permsAll[number]) => `${p.resource.toUpperCase()}_${p.action.toUpperCase()}`;
  const permByKey = new Map(permsAll.map((p) => [permKey(p), p]));

  for (const seed of MENU_SEEDS) {
    const item = items.find((i) => i.code === seed.code);
    if (!item) continue;
    for (const permName of seed.permissions) {
      const p = permByKey.get(permName);
      if (!p) {
        console.warn(`[seed/menus] permission not found: ${permName} for ${seed.code}`);
        continue;
      }
      await db.insert(menuPermission).values({
        menuItemId: item.id,
        permissionId: p.id,
      }).onConflictDoNothing();
    }
  }

  console.log(`[seed/menus] seeded ${MENU_SEEDS.length} menu items + permissions`);
}
```

- [ ] **Step 2: dev.ts 통합 호출**

`packages/db/seed/dev.ts`의 workspace 처리 직후에 추가 (모든 ws에 시드되도록 — `default`와 `jarvis` 둘 다):

```ts
// 모든 workspace에 시드
const allWs = await db.select({ id: workspace.id, code: workspace.code }).from(workspace);
const { seedMenuTree } = await import("./menus.js");
for (const ws of allWs) {
  console.log(`[seed/menus] seeding ws=${ws.code}`);
  await seedMenuTree(ws.id);
}
```

- [ ] **Step 3: 시드 실행 + 검증**

```bash
pnpm db:seed
PGPASSWORD=jarvispass psql -h localhost -p 5436 -U jarvis -d jarvis -c "SELECT count(*) FROM menu_item;"
PGPASSWORD=jarvispass psql -h localhost -p 5436 -U jarvis -d jarvis -c "SELECT count(*) FROM menu_permission;"
```
Expected: 31 × N(workspaces) menu_items, 매핑 수는 더 많음.

기존 9건 데이터 처리: `code`가 없을 테니 마이그레이션이 실패할 수 있음 — 사전 단계에서 9건 DELETE 후 시드 권장 (Task 1의 step 4 noted).

- [ ] **Step 4: 멱등성 (×2) + type-check**

```bash
pnpm db:seed && pnpm db:seed
pnpm --filter @jarvis/db type-check
```

- [ ] **Step 5: 커밋**

```bash
git add packages/db/seed/menus.ts packages/db/seed/dev.ts
git commit -m "feat(db/seed): seed menu_item tree + permissions from routes.ts (UNION model)"
```

---

## Task 3: getVisibleMenuTree server helper

**Files:**
- Create: `apps/web/lib/server/menu-tree.ts`
- Create: `apps/web/lib/server/__tests__/menu-tree.test.ts`

- [ ] **Step 1: 단위 테스트 작성**

```ts
// apps/web/lib/server/__tests__/menu-tree.test.ts
import { describe, expect, it } from "vitest";
import { buildMenuTree, type FlatMenuItem } from "../menu-tree.js";

describe("buildMenuTree", () => {
  it("builds tree with parent-child cascade", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 1 },
      { id: "b", parentId: "a", code: "a.b", kind: "menu", label: "B", routePath: "/a/b", icon: null, sortOrder: 2 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.code).toBe("a.b");
  });

  it("hides parent if no visible child (cascade)", () => {
    const flat: FlatMenuItem[] = [
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: null, icon: null, sortOrder: 1 },
    ];
    const tree = buildMenuTree(flat);
    // 부모 자체에 routePath가 없고 children 없으면 hidden
    expect(tree).toHaveLength(0);
  });

  it("sorts by sortOrder", () => {
    const flat: FlatMenuItem[] = [
      { id: "b", parentId: null, code: "b", kind: "menu", label: "B", routePath: "/b", icon: null, sortOrder: 20 },
      { id: "a", parentId: null, code: "a", kind: "menu", label: "A", routePath: "/a", icon: null, sortOrder: 10 },
    ];
    const tree = buildMenuTree(flat);
    expect(tree.map((n) => n.code)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: 헬퍼 구현**

```ts
// apps/web/lib/server/menu-tree.ts
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import type { Session } from "@jarvis/auth/session";

export type FlatMenuItem = {
  id: string;
  parentId: string | null;
  code: string;
  kind: "menu" | "action";
  label: string;
  icon: string | null;
  routePath: string | null;
  sortOrder: number;
};

export type MenuTreeNode = FlatMenuItem & { children: MenuTreeNode[] };

export function buildMenuTree(flat: FlatMenuItem[]): MenuTreeNode[] {
  const byId = new Map<string, MenuTreeNode>();
  for (const f of flat) byId.set(f.id, { ...f, children: [] });

  const roots: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      roots.push(node);
    }
  }

  function sortAndPrune(nodes: MenuTreeNode[]): MenuTreeNode[] {
    return nodes
      .map((n) => ({ ...n, children: sortAndPrune(n.children) }))
      .filter((n) => n.routePath !== null || n.children.length > 0)  // cascade: 라우트 없고 자식 없으면 hidden
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return sortAndPrune(roots);
}

export async function getVisibleMenuTree(session: Session, kind: "menu" | "action" = "menu"): Promise<MenuTreeNode[]> {
  // UNION: 사용자 권한 ∪ ADMIN_ALL이면 모두
  const rows = await db.execute(sql`
    SELECT DISTINCT mi.id, mi.parent_id AS "parentId", mi.code, mi.kind, mi.label, mi.icon, mi.route_path AS "routePath", mi.sort_order AS "sortOrder"
    FROM menu_item mi
    JOIN menu_permission mp ON mp.menu_item_id = mi.id
    JOIN role_permission rp ON rp.permission_id = mp.permission_id
    JOIN user_role ur     ON ur.role_id = rp.role_id
    WHERE ur.user_id = ${session.userId}
      AND mi.workspace_id = ${session.workspaceId}
      AND mi.kind = ${kind}
      AND mi.is_visible = true
    ORDER BY mi.sort_order
  `);

  return buildMenuTree(rows.rows as FlatMenuItem[]);
}
```

- [ ] **Step 3: 테스트 실행 ×2**

```bash
pnpm --filter @jarvis/web exec vitest run apps/web/lib/server/__tests__/menu-tree.test.ts && pnpm --filter @jarvis/web exec vitest run apps/web/lib/server/__tests__/menu-tree.test.ts
```

- [ ] **Step 4: 커밋**

```bash
git add apps/web/lib/server/menu-tree.ts apps/web/lib/server/__tests__/menu-tree.test.ts
git commit -m "feat(server): add getVisibleMenuTree helper with UNION + cascade"
```

---

## Task 4: Sidebar 재작성 (RSC 데이터 → client component)

**Files:**
- Modify: `apps/web/app/(app)/layout.tsx` — RSC, getVisibleMenuTree 호출 후 Sidebar에 props 전달
- Modify: `apps/web/components/layout/Sidebar.tsx` — props로 받은 트리 렌더 (lucide 아이콘 이름 → 컴포넌트 매핑)
- Create: `apps/web/components/layout/icon-map.ts` — 아이콘 이름 문자열 → lucide 컴포넌트

- [ ] **Step 1: icon-map**

```ts
// apps/web/components/layout/icon-map.ts
import {
  Activity, BarChart3, BookOpen, Building, Building2, CalendarX, ClipboardList, Coins,
  FilePlus, FileText, GitFork, HardDrive, Hash, Inbox, Library, ListChecks, ListTree,
  Megaphone, MessageSquare, Network, Plus, ScrollText, Search, Server, Settings,
  ShieldAlert, ShieldCheck, User, Users, type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  Activity, BarChart3, BookOpen, Building, Building2, CalendarX, ClipboardList, Coins,
  FilePlus, FileText, GitFork, HardDrive, Hash, Inbox, Library, ListChecks, ListTree,
  Megaphone, MessageSquare, Network, Plus, ScrollText, Search, Server, Settings,
  ShieldAlert, ShieldCheck, User, Users,
};

export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return ShieldCheck;  // default
}
```

- [ ] **Step 2: Sidebar.tsx props로 받기**

```tsx
// apps/web/components/layout/Sidebar.tsx (요약 — 기존 NAV_ITEMS/ADMIN_ITEMS 직접 import 제거하고 props로 받기)
"use client";
import type { MenuTreeNode } from "@/lib/server/menu-tree";
import { resolveIcon } from "./icon-map";
// ... (기존 NavButton 재사용)

type Props = { menus: MenuTreeNode[] };

export function Sidebar({ menus }: Props) {
  // group by sortOrder threshold — sortOrder < 200은 nav, >= 200은 admin (시드 컨벤션)
  const navItems = menus.filter((m) => m.sortOrder < 200);
  const adminItems = menus.filter((m) => m.sortOrder >= 200);
  // ... 렌더링
}
```

- 또는 더 안전하게: `code` prefix(`nav.*` vs `admin.*`)로 그룹 분리.
- DB 시드 sortOrder 컨벤션 + code prefix 둘 다 일치하므로 둘 중 하나 사용.

- [ ] **Step 3: (app)/layout.tsx에서 호출**

```tsx
// apps/web/app/(app)/layout.tsx
import { Sidebar } from "@/components/layout/Sidebar";
import { getSession } from "@jarvis/auth/session";
import { headers } from "next/headers";
import { getVisibleMenuTree } from "@/lib/server/menu-tree";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionId = (await headers()).get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  const menus = session ? await getVisibleMenuTree(session, "menu") : [];
  return (
    <>
      <Sidebar menus={menus} />
      <div /* 기존 main wrapper */>{children}</div>
    </>
  );
}
```

기존 `(app)/layout.tsx` 구조에 맞춰 적절히 통합.

- [ ] **Step 4: type-check + 동작 확인**

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check
```

dev server에서 admin 사용자 / viewer 사용자로 사이드바 비교.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/\(app\)/layout.tsx apps/web/components/layout/Sidebar.tsx apps/web/components/layout/icon-map.ts
git commit -m "feat(layout): sidebar reads visible menu tree from DB (UNION + cascade)"
```

---

## Task 5: routes.ts deprecate + CommandPalette 전환

**Files:**
- Modify: `apps/web/lib/routes.ts` — `@deprecated` JSDoc, 그러나 export 유지(테스트 호환)
- Modify: `apps/web/components/layout/CommandPalette.tsx` — DB 액션 메뉴 사용 (또는 props로 받기)

- [ ] **Step 1: routes.ts JSDoc**

```ts
/**
 * @deprecated 메뉴 데이터는 DB(`menu_item` 테이블)로 마이그레이션됨.
 * 이 파일의 NAV_ITEMS/ADMIN_ITEMS/ACTION_ITEMS는 테스트 호환과 시드 참조용으로만 유지된다.
 * 새 메뉴 추가는 `packages/db/seed/menus.ts`의 `MENU_SEEDS` 또는 admin/menus 화면에서.
 */
```

- [ ] **Step 2: CommandPalette도 props로 트리 받기 — 또는 별도 server action으로 액션 메뉴 fetch**

CommandPalette는 client component라 server action 호출 또는 props 전달 필요.
- 옵션: `(app)/layout.tsx`에서 `getVisibleMenuTree(session, "action")`도 호출 → CommandPalette에 props 전달
- 또는 CommandPalette가 mounted 시 server action으로 fetch

간단하게 props 전달 권장. 단 CommandPalette가 어디 mount되는지 확인 후 구조 결정.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/lib/routes.ts apps/web/components/layout/CommandPalette.tsx [관련 layout]
git commit -m "chore(layout): deprecate routes.ts in favor of DB menu_item; CommandPalette uses DB"
```

---

## Task 6: <Authorized> HOC + hasPermission util

**Files:**
- Create or Modify: `apps/web/components/auth/Authorized.tsx`
- Verify or Create: `packages/auth/src/permissions.ts` — `hasPermission(session, perm)` util

- [ ] **Step 1: hasPermission 위치 확인**

`packages/auth`에 이미 있을 가능성. grep으로 확인 후 없으면 추가:

```ts
// packages/auth/src/permissions.ts
import type { Session } from "./session.js";

export function hasPermission(session: Session | null | undefined, perm: string): boolean {
  if (!session) return false;
  return session.permissions?.includes(perm) ?? false;
}
```

session.permissions 필드가 이미 있는지 확인 — 있으면 재사용.

- [ ] **Step 2: <Authorized> client component**

```tsx
// apps/web/components/auth/Authorized.tsx
"use client";
import { useSession } from "@/lib/client/session";  // 또는 props로 받기
import { hasPermission } from "@jarvis/auth";

type Props = {
  perm: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

export function Authorized({ perm, fallback = null, children }: Props) {
  const session = useSession();
  const perms = Array.isArray(perm) ? perm : [perm];
  const ok = perms.some((p) => hasPermission(session, p));
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
```

`useSession` hook이 없으면 props로 session 받는 방식. 또는 Server Component에서 직접 hasPermission 사용 (Authorized HOC 안 써도 됨).

- [ ] **Step 3: 사용 예 (CompaniesGrid 툴바)**

`apps/web/app/(app)/admin/companies/_components/CompaniesGrid.tsx`의 [입력]/[저장] 버튼을 `<Authorized perm="ADMIN_ALL">` 로 wrap (선택 — admin 영역이라 이미 가드됨, 데모 차원).

- [ ] **Step 4: 커밋**

```bash
git add packages/auth/src/permissions.ts apps/web/components/auth/Authorized.tsx
git commit -m "feat(auth): add hasPermission util + Authorized client HOC for UI hint"
```

---

## Task 7: E2E — viewer vs admin 메뉴 가시성

**Files:**
- Create: `apps/web/e2e/sidebar-rbac.spec.ts`

- [ ] **Step 1: e2e 시나리오**

```ts
import { test, expect } from "@playwright/test";

test.describe("Sidebar RBAC", () => {
  test("ADMIN sees all menus (nav + admin group)", async ({ page }) => {
    // login admin@jarvis.dev
    // ...
    await expect(page.getByRole("link", { name: "회사" })).toBeVisible();
    await expect(page.getByRole("link", { name: "사용자" })).toBeVisible();
  });

  test("VIEWER sees only nav items, no admin group", async ({ page }) => {
    // login viewer user
    // ...
    await expect(page.getByRole("link", { name: "공지사항" })).toBeVisible();
    await expect(page.getByRole("link", { name: "회사" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "관리자" })).not.toBeVisible();
  });
});
```

- [ ] **Step 2: 실행 (×2)**

```bash
pnpm --filter @jarvis/web exec playwright test sidebar-rbac && pnpm --filter @jarvis/web exec playwright test sidebar-rbac
```

- [ ] **Step 3: 커밋**

---

## Task 8: 검증 게이트 일괄

```bash
pnpm --filter @jarvis/web type-check && pnpm --filter @jarvis/web type-check
pnpm --filter @jarvis/web lint
node scripts/check-schema-drift.mjs --precommit
pnpm audit:rsc
pnpm test
```

각 게이트 PASS 확인.

---

## Task 9: 하네스 갱신

**Files:**
- Modify: `.claude/skills/jarvis-architecture/SKILL.md` — "RBAC 메뉴 트리" 섹션 추가
- Modify: `CLAUDE.md` — 변경 이력

- [ ] **Step 1: SKILL.md 섹션 추가**

```markdown
## RBAC 메뉴 트리 (DB 기반)

사이드바·CommandPalette 메뉴는 `menu_item` 테이블에 저장되고 `menu_permission`로 권한 매핑된다. UNION 모델로 사용자가 가진 모든 권한의 메뉴 합집합 표시.

**핵심 규칙:**
- ADMIN_ALL은 모든 메뉴에 자동 매핑 → ADMIN role 자동 모든 메뉴 보임
- 부모 메뉴는 자식 가시성 cascade (server helper에서 빌드 시 처리)
- 메뉴-권한 N:M, ANY 매칭 (UNION)
- `menu_item.kind`: `menu`(사이드바) | `action`(CommandPalette)
- 페이지 내 버튼 권한: server action 가드 + UI는 `<Authorized perm>` HOC hint
- `routes.ts`는 deprecated, `packages/db/seed/menus.ts`의 `MENU_SEEDS`가 source of truth

**서버 헬퍼:** `apps/web/lib/server/menu-tree.ts`의 `getVisibleMenuTree(session, kind)`
**참고 plan:** `docs/superpowers/plans/2026-04-30-rbac-menu-tree.md`
```

- [ ] **Step 2: CLAUDE.md 변경 이력 1줄**

```markdown
| 2026-04-30 | RBAC 메뉴 트리 도입 (DB 기반 menu_item + menu_permission UNION 모델) | `packages/db/schema/menu*.ts`, `packages/db/seed/menus.ts`, `apps/web/lib/server/menu-tree.ts`, `apps/web/components/layout/Sidebar.tsx`, `apps/web/components/auth/Authorized.tsx`, `.claude/skills/jarvis-architecture/SKILL.md` | 사이드바를 hard-coded routes.ts에서 DB 기반으로 전환 + 권한별 메뉴 가시성 + 부모 cascade. routes.ts는 deprecated 표시, 추후 제거 |
```

- [ ] **Step 3: 커밋**

---

## Self-Review

- ✅ 6개 옵션 결정 모두 task에 반영 (1A, 2B, 3B, 4C, 5A, 6A)
- ✅ 기존 menu_item 9건 데이터 처리 방안 명시 (Task 1 step 4)
- ✅ workspace별 시드 — 모든 ws에 자동 (default + jarvis 둘 다)
- ✅ ADMIN_ALL 자동 매핑 → ADMIN 모든 메뉴 보임
- ✅ cascade 단위 테스트 포함
- ✅ routes.ts deprecate 명시 (즉시 삭제 X, 호환성)
- ⚠️ admin/menus 편집 UI는 별도 plan으로 분리 (이번 plan은 read 전용 + 시드만)
- ⚠️ session.permissions 필드 존재 여부 implementer가 사전 확인 필요
- ⚠️ 마이그레이션 시 기존 9건 처리 — 사용자 합의 후 진행 (DELETE vs `legacy.{id}` 코드 부여)

---

## Execution Handoff

Plan saved. Subagent-driven-development로 task별 dispatch.
