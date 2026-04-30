/**
 * packages/db/seed/menus.ts
 *
 * Seed the menu tree: `menu_item` rows + `menu_permission` links.
 *
 * Sources of truth:
 *   - PERMISSIONS const ........ packages/shared/constants/permissions.ts
 *   - menu schema .............. packages/db/schema/menu.ts (uniq on workspace_id, code)
 *   - menu_permission schema ... packages/db/schema/menu-permission.ts (PK on item+perm)
 *
 * Phase: rbac-menu-tree (Task 2/9). Plan:
 *   docs/superpowers/plans/2026-04-30-rbac-menu-tree.md
 *
 * Permission key replacements vs original plan:
 *   SYSTEM_READ          -> PROJECT_READ          (rename in 2026-04)
 *   SYSTEM_ACCESS_SECRET -> PROJECT_ACCESS_SECRET
 *   ATTENDANCE_READ      -> CONTRACTOR_READ       (semantic match: nav.contractors)
 *   ATTENDANCE_ADMIN     -> CONTRACTOR_ADMIN
 *
 * NOTE on `nav.profile`: only ADMIN_ALL is listed, so non-admin roles will not
 * see the profile menu item. This matches the original plan; if every logged-in
 * user should see Profile, expand its `permissions` set in a follow-up task.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { menuItem, menuPermission } from "../schema/index.js";
import {
  PERMISSIONS,
  type Permission,
} from "@jarvis/shared/constants/permissions";

type MenuKind = "menu" | "action";

interface MenuSeed {
  code: string;
  kind: MenuKind;
  label: string;
  icon: string;
  routePath: string;
  sortOrder: number;
  permissions: Permission[];
}

const MENU_SEEDS: MenuSeed[] = [
  // NAV (sortOrder < 200)
  { code: "nav.notices",      kind: "menu", label: "공지사항",       icon: "Megaphone",     routePath: "/notices",            sortOrder:  10, permissions: [PERMISSIONS.NOTICE_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.ask",          kind: "menu", label: "AI 질문",        icon: "MessageSquare", routePath: "/ask",                sortOrder:  20, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.search",       kind: "menu", label: "검색",           icon: "Search",        routePath: "/search",             sortOrder:  30, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.wiki",         kind: "menu", label: "위키",           icon: "Library",       routePath: "/wiki",               sortOrder:  40, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.wiki-graph",   kind: "menu", label: "위키 그래프",    icon: "GitFork",       routePath: "/wiki/graph",         sortOrder:  50, permissions: [PERMISSIONS.GRAPH_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.wiki-ingest",  kind: "menu", label: "위키 수동수집",  icon: "FilePlus",      routePath: "/wiki/ingest/manual", sortOrder:  60, permissions: [PERMISSIONS.KNOWLEDGE_CREATE, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.knowledge",    kind: "menu", label: "Knowledge",      icon: "BookOpen",      routePath: "/knowledge",          sortOrder:  70, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.projects",     kind: "menu", label: "프로젝트",       icon: "Server",        routePath: "/projects",           sortOrder:  80, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.architecture", kind: "menu", label: "아키텍처",       icon: "Network",       routePath: "/architecture",       sortOrder:  90, permissions: [PERMISSIONS.GRAPH_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.infra",        kind: "menu", label: "인프라",         icon: "HardDrive",     routePath: "/infra",              sortOrder: 100, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.add-dev",      kind: "menu", label: "추가개발",       icon: "ClipboardList", routePath: "/add-dev",            sortOrder: 110, permissions: [PERMISSIONS.ADDITIONAL_DEV_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.contractors",  kind: "menu", label: "외주인력관리",   icon: "Users",         routePath: "/contractors",        sortOrder: 120, permissions: [PERMISSIONS.CONTRACTOR_READ, PERMISSIONS.ADMIN_ALL] },
  { code: "nav.holidays",     kind: "menu", label: "공휴일 관리",    icon: "CalendarX",     routePath: "/holidays",           sortOrder: 130, permissions: [PERMISSIONS.CONTRACTOR_ADMIN, PERMISSIONS.ADMIN_ALL] },
  // NOTE: nav.profile only carries ADMIN_ALL — non-admin roles will not see it.
  // Per original plan; revisit in a follow-up if every logged-in user should see profile.
  { code: "nav.profile",      kind: "menu", label: "프로필",         icon: "User",          routePath: "/profile",            sortOrder: 140, permissions: [PERMISSIONS.ADMIN_ALL] },

  // SALES (150 ≤ sortOrder < 200)
  { code: "sales.customers",         kind: "menu", label: "고객사관리",   icon: "Users",       routePath: "/sales/customers",         sortOrder: 150, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL] },
  { code: "sales.customer-contacts", kind: "menu", label: "담당자관리",   icon: "Contact",     routePath: "/sales/customer-contacts", sortOrder: 155, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL] },
  { code: "sales.product-types",     kind: "menu", label: "제품군관리",   icon: "ShoppingBag", routePath: "/sales/product-types",     sortOrder: 160, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL] },
  { code: "sales.mail-persons",      kind: "menu", label: "메일담당자",   icon: "Mail",        routePath: "/sales/mail-persons",      sortOrder: 165, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL] },
  { code: "sales.licenses",          kind: "menu", label: "라이센스관리", icon: "Key",         routePath: "/sales/licenses",          sortOrder: 170, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL] },

  // ADMIN (200 ≤ sortOrder < 400)
  { code: "admin.companies",          kind: "menu", label: "회사",         icon: "Building2",   routePath: "/admin/companies",                sortOrder: 200, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.users",              kind: "menu", label: "사용자",       icon: "Users",       routePath: "/admin/users",                    sortOrder: 210, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.organizations",      kind: "menu", label: "조직",         icon: "Building",    routePath: "/admin/organizations",            sortOrder: 220, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.menus",              kind: "menu", label: "메뉴",         icon: "ListTree",    routePath: "/admin/menus",                    sortOrder: 230, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.codes",              kind: "menu", label: "코드",         icon: "Hash",        routePath: "/admin/codes",                    sortOrder: 240, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.review-queue",       kind: "menu", label: "검토 대기",    icon: "Inbox",       routePath: "/admin/review-queue",             sortOrder: 250, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.audit",              kind: "menu", label: "감사 로그",    icon: "ScrollText",  routePath: "/admin/audit",                    sortOrder: 260, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.search-analytics",   kind: "menu", label: "검색 분석",    icon: "BarChart3",   routePath: "/admin/search-analytics",         sortOrder: 270, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.settings",           kind: "menu", label: "설정",         icon: "Settings",    routePath: "/admin/settings",                 sortOrder: 280, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.llm-cost",           kind: "menu", label: "LLM 비용",     icon: "Coins",       routePath: "/admin/llm-cost",                 sortOrder: 290, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.wiki-observability", kind: "menu", label: "위키 운영",    icon: "Activity",    routePath: "/admin/observability/wiki",       sortOrder: 300, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.wiki-violations",    kind: "menu", label: "경계 위반",    icon: "ShieldAlert", routePath: "/admin/wiki/boundary-violations", sortOrder: 310, permissions: [PERMISSIONS.ADMIN_ALL] },
  { code: "admin.wiki-review",        kind: "menu", label: "위키 리뷰 큐", icon: "ListChecks",  routePath: "/admin/wiki/review-queue",        sortOrder: 320, permissions: [PERMISSIONS.ADMIN_ALL] },

  // ACTION (sortOrder >= 400) — for CommandPalette
  { code: "action.new-notice",  kind: "action", label: "새 공지 작성", icon: "FileText", routePath: "/notices/new",   sortOrder: 400, permissions: [PERMISSIONS.NOTICE_CREATE, PERMISSIONS.ADMIN_ALL] },
  { code: "action.new-kb",      kind: "action", label: "새 KB 페이지", icon: "FileText", routePath: "/knowledge/new", sortOrder: 410, permissions: [PERMISSIONS.KNOWLEDGE_CREATE, PERMISSIONS.ADMIN_ALL] },
  { code: "action.new-project", kind: "action", label: "새 프로젝트",  icon: "Plus",     routePath: "/projects/new",  sortOrder: 420, permissions: [PERMISSIONS.PROJECT_CREATE, PERMISSIONS.ADMIN_ALL] },
  { code: "action.settings",    kind: "action", label: "설정",         icon: "Settings", routePath: "/profile",       sortOrder: 430, permissions: [PERMISSIONS.ADMIN_ALL] },
];

/**
 * Idempotent seed for menu_item + menu_permission for the given workspace.
 *
 * - menu_item is upserted on (workspace_id, code) — fields refreshed from seed
 * - menu_permission rows are insert-or-skip on PK (menu_item_id, permission_id)
 */
export async function seedMenuTree(
  workspaceId: string,
  permKeyToId: Map<string, string>,
): Promise<void> {
  // 1) Upsert menu_item rows
  for (const seed of MENU_SEEDS) {
    await db
      .insert(menuItem)
      .values({
        workspaceId,
        code: seed.code,
        kind: seed.kind,
        label: seed.label,
        icon: seed.icon,
        routePath: seed.routePath,
        sortOrder: seed.sortOrder,
      })
      .onConflictDoUpdate({
        target: [menuItem.workspaceId, menuItem.code],
        set: {
          kind: sql`excluded.kind`,
          label: sql`excluded.label`,
          icon: sql`excluded.icon`,
          routePath: sql`excluded.route_path`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
  }

  // 2) Look up inserted ids so we can wire menu_permission
  const items = await db
    .select({ id: menuItem.id, code: menuItem.code })
    .from(menuItem)
    .where(eq(menuItem.workspaceId, workspaceId));
  const codeToId = new Map(items.map((i) => [i.code, i.id]));

  // 3) Insert menu_permission links (idempotent — composite PK)
  let linkCount = 0;
  for (const seed of MENU_SEEDS) {
    const itemId = codeToId.get(seed.code);
    if (!itemId) continue;
    for (const permKey of seed.permissions) {
      const permId = permKeyToId.get(permKey);
      if (!permId) {
        console.warn(`[seed/menus] permission not found: ${permKey} for ${seed.code}`);
        continue;
      }
      await db
        .insert(menuPermission)
        .values({ menuItemId: itemId, permissionId: permId })
        .onConflictDoNothing();
      linkCount++;
    }
  }
  console.log(
    `[seed/menus] seeded ${MENU_SEEDS.length} menu items + ${linkCount} permission links`,
  );
}
