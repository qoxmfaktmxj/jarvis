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
  /** Sidebar label badge (e.g. "AI"). Optional. */
  badge?: string;
  /** CommandPalette fuzzy-match terms. Optional. */
  keywords?: string[];
}

const MENU_SEEDS: MenuSeed[] = [
  // NAV (sortOrder < 200)
  { code: "nav.notices",      kind: "menu", label: "공지사항",       icon: "Megaphone",     routePath: "/notices",            sortOrder:  10, permissions: [PERMISSIONS.NOTICE_READ, PERMISSIONS.ADMIN_ALL], keywords: ["공지", "공지사항", "notice"] },
  { code: "nav.ask",          kind: "menu", label: "AI 질문",        icon: "MessageSquare", routePath: "/ask",                sortOrder:  20, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL], badge: "AI", keywords: ["AI", "질문", "검색", "ask"] },
  { code: "nav.search",       kind: "menu", label: "검색",           icon: "Search",        routePath: "/search",             sortOrder:  30, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL], keywords: ["검색", "search"] },
  { code: "nav.wiki",         kind: "menu", label: "위키",           icon: "Library",       routePath: "/wiki",               sortOrder:  40, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL], keywords: ["위키", "wiki"] },
  { code: "nav.wiki-graph",   kind: "menu", label: "위키 그래프",    icon: "GitFork",       routePath: "/wiki/graph",         sortOrder:  50, permissions: [PERMISSIONS.GRAPH_READ, PERMISSIONS.ADMIN_ALL], keywords: ["그래프", "graph", "wiki"] },
  { code: "nav.wiki-ingest",  kind: "menu", label: "위키 수동수집",  icon: "FilePlus",      routePath: "/wiki/ingest/manual", sortOrder:  60, permissions: [PERMISSIONS.KNOWLEDGE_CREATE, PERMISSIONS.ADMIN_ALL], keywords: ["수집", "ingest", "wiki"] },
  { code: "nav.knowledge",    kind: "menu", label: "Knowledge",      icon: "BookOpen",      routePath: "/knowledge",          sortOrder:  70, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.ADMIN_ALL], keywords: ["지식", "knowledge", "kb"] },
  { code: "nav.projects",     kind: "menu", label: "프로젝트",       icon: "Server",        routePath: "/projects",           sortOrder:  80, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL], keywords: ["프로젝트", "project"] },
  { code: "nav.project-beacons", kind: "menu", label: "비콘관리",        icon: "RadioTower",    routePath: "/projects/beacons",   sortOrder:  81, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL], keywords: ["비콘", "beacon", "project"] },
  { code: "nav.project-history", kind: "menu", label: "프로젝트수행이력", icon: "History",       routePath: "/projects/history",   sortOrder:  82, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL], keywords: ["수행이력", "history", "project"] },
  { code: "nav.project-modules", kind: "menu", label: "프로젝트모듈관리", icon: "Package",       routePath: "/projects/modules",   sortOrder:  83, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL], keywords: ["모듈", "module", "project"] },
  { code: "nav.architecture", kind: "menu", label: "아키텍처",       icon: "Network",       routePath: "/architecture",       sortOrder:  90, permissions: [PERMISSIONS.GRAPH_READ, PERMISSIONS.ADMIN_ALL], keywords: ["아키텍처", "architecture"] },
  { code: "nav.infra",        kind: "menu", label: "인프라",         icon: "HardDrive",     routePath: "/infra",              sortOrder: 100, permissions: [PERMISSIONS.PROJECT_READ, PERMISSIONS.ADMIN_ALL], keywords: ["인프라", "infra"] },
  { code: "nav.add-dev",      kind: "menu", label: "추가개발",       icon: "ClipboardList", routePath: "/add-dev",            sortOrder: 110, permissions: [PERMISSIONS.ADDITIONAL_DEV_READ, PERMISSIONS.ADMIN_ALL], keywords: ["추가개발", "additional", "dev"] },
  { code: "nav.contractors",  kind: "menu", label: "외주인력관리",   icon: "Users",         routePath: "/contractors",        sortOrder: 120, permissions: [PERMISSIONS.CONTRACTOR_READ, PERMISSIONS.ADMIN_ALL], keywords: ["외주", "인력", "contractor"] },
  { code: "nav.holidays",     kind: "menu", label: "공휴일 관리",    icon: "CalendarX",     routePath: "/holidays",           sortOrder: 130, permissions: [PERMISSIONS.CONTRACTOR_ADMIN, PERMISSIONS.ADMIN_ALL], keywords: ["공휴일", "휴일", "holiday"] },
  // NOTE: nav.profile only carries ADMIN_ALL — non-admin roles will not see it.
  // Per original plan; revisit in a follow-up if every logged-in user should see profile.
  { code: "nav.profile",      kind: "menu", label: "프로필",         icon: "User",          routePath: "/profile",            sortOrder: 140, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["프로필", "profile"] },

  // SALES (150 ≤ sortOrder < 200)
  { code: "sales.customers",            kind: "menu", label: "고객사관리",     icon: "Users",       routePath: "/sales/customers",             sortOrder: 150, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["고객", "고객사", "customer", "sales"] },
  { code: "sales.customer-contacts",    kind: "menu", label: "담당자관리",     icon: "Contact",     routePath: "/sales/customer-contacts",     sortOrder: 155, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["담당자", "contact", "sales"] },
  { code: "sales.product-types",        kind: "menu", label: "제품군관리",     icon: "ShoppingBag", routePath: "/sales/product-types",         sortOrder: 160, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["제품", "product", "sales"] },
  { code: "sales.product-cost-mapping", kind: "menu", label: "제품-코스트 매핑", icon: "Coins",       routePath: "/sales/product-cost-mapping",  sortOrder: 162, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["코스트", "cost", "매핑", "sales"] },
  { code: "sales.mail-persons",         kind: "menu", label: "메일담당자",     icon: "Mail",        routePath: "/sales/mail-persons",          sortOrder: 165, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["메일", "mail", "sales"] },
  // Phase 2 — 영업기회/활동/대시보드
  { code: "sales.opportunities",            kind: "menu", label: "영업기회",       icon: "Target",      routePath: "/sales/opportunities",             sortOrder: 170, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["영업기회", "opportunity", "sales", "biz"] },
  { code: "sales.activities",               kind: "menu", label: "영업활동",       icon: "Activity",    routePath: "/sales/activities",                sortOrder: 175, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["영업활동", "activity", "sales", "biz"] },
  { code: "sales.opportunities.dashboard",  kind: "menu", label: "영업기회현황",   icon: "TrendingUp",  routePath: "/sales/opportunities/dashboard",   sortOrder: 180, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["대시보드", "dashboard", "현황", "sales"] },
  // Phase 3 — 계약 관리 (Task 13/14)
  { code: "sales.contracts",                kind: "menu", label: "계약 관리",      icon: "FileText",    routePath: "/sales/contracts",                 sortOrder: 181, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계약", "contract", "sales"] },
  { code: "sales.contract-months",          kind: "menu", label: "계약 월별",      icon: "CalendarDays",routePath: "/sales/contract-months",           sortOrder: 182, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계약", "월별", "contract", "sales"] },
  { code: "sales.contract-services",        kind: "menu", label: "서비스 인력",    icon: "Users",       routePath: "/sales/contract-services",         sortOrder: 183, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["서비스", "인력", "contract", "sales"] },
  // Group 6 — 통계 차트 (read-only Recharts)
  { code: "sales.charts.marketing",         kind: "menu", label: "영업 마케팅 차트", icon: "PieChart",    routePath: "/sales/charts/marketing",          sortOrder: 190, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["마케팅", "차트", "활동", "상품", "marketing", "chart", "sales"] },
  { code: "sales.charts.admin-perf",        kind: "menu", label: "관리자 실적 차트", icon: "BarChart3",   routePath: "/sales/charts/admin-perf",         sortOrder: 191, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["실적", "관리자", "차트", "admin", "perf", "chart", "sales"] },
  { code: "sales.charts.plan-perf",         kind: "menu", label: "계획대비 실적 차트", icon: "LineChart",   routePath: "/sales/charts/plan-perf",          sortOrder: 192, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계획", "실적", "전망", "plan", "perf", "chart", "sales"] },
  { code: "sales.charts.trend",             kind: "menu", label: "매출/이익 추이 차트", icon: "TrendingUp",  routePath: "/sales/charts/trend",              sortOrder: 193, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["매출", "이익", "추이", "trend", "chart", "sales"] },
  { code: "sales.dashboard",                kind: "menu", label: "영업본부 대시보드", icon: "LayoutDashboard", routePath: "/sales/dashboard",             sortOrder: 194, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["대시보드", "본부", "통계", "dashboard", "sales"] },
  { code: "sales.charts.plan-perf-upload",  kind: "menu", label: "계획/실적전망 업로드", icon: "Upload",      routePath: "/sales/charts/plan-perf-upload",   sortOrder: 195, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계획", "실적", "전망", "업로드", "엑셀", "upload", "chart", "sales"] },
  // Group 5 — people UI (sortOrder 196-198, kept inside SALES NAV zone <200; previously
  // 210-212 collided with ADMIN zone admin.users=210)
  { code: "sales.freelancers",              kind: "menu", label: "프리랜서투입현황", icon: "UserCheck",  routePath: "/sales/freelancers",              sortOrder: 196, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["프리랜서", "투입", "freelancer", "people", "sales"] },
  { code: "sales.cloud-people-base",        kind: "menu", label: "인원단가 기준관리", icon: "Cloud",      routePath: "/sales/cloud-people-base",        sortOrder: 197, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["인원", "단가", "기준", "cloud", "people", "sales"] },
  { code: "sales.cloud-people-calc",        kind: "menu", label: "인원단가현황",     icon: "Calculator", routePath: "/sales/cloud-people-calc",        sortOrder: 198, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["인원", "단가", "현황", "계산", "cloud", "people", "sales"] },
  // Group 2 — finance (sortOrder 220-229 reserved)
  { code: "sales.purchases",                kind: "menu", label: "매입관리",      icon: "Coins",       routePath: "/sales/purchases",                 sortOrder: 220, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["매입", "purchase", "finance", "sales"] },
  { code: "sales.tax-bills",                kind: "menu", label: "세금계산서",    icon: "FileText",    routePath: "/sales/tax-bills",                 sortOrder: 222, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["세금계산서", "tax", "bill", "finance", "sales"] },
  { code: "sales.month-exp-sga",            kind: "menu", label: "월별 경비/판관비", icon: "CalendarDays",routePath: "/sales/month-exp-sga",             sortOrder: 224, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["경비", "판관비", "expense", "sga", "finance", "sales"] },
  { code: "sales.plan-div-costs",           kind: "menu", label: "계획배부비",    icon: "Coins",       routePath: "/sales/plan-div-costs",            sortOrder: 226, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계획배부비", "cost", "finance", "sales"] },
  { code: "sales.companies",                 kind: "menu", label: "영업 회사",      icon: "Building2",   routePath: "/sales/companies",                 sortOrder: 230, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["회사", "기업", "company", "sales"] },
  { code: "sales.contract-uploads",          kind: "menu", label: "계약 업로드",    icon: "Upload",      routePath: "/sales/contract-uploads",          sortOrder: 231, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계약", "업로드", "upload", "sales"] },
  { code: "sales.plan-view-permissions",     kind: "menu", label: "계획 권한",      icon: "ShieldCheck", routePath: "/sales/plan-view-permissions",     sortOrder: 232, permissions: [PERMISSIONS.SALES_ALL, PERMISSIONS.ADMIN_ALL], keywords: ["계획", "전망", "실적", "권한", "sales"] },

  // ADMIN (200 ≤ sortOrder < 400)
  { code: "admin.companies",          kind: "menu", label: "회사",         icon: "Building2",   routePath: "/admin/companies",                sortOrder: 200, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["회사", "기업", "company"] },
  { code: "admin.users",              kind: "menu", label: "사용자",       icon: "Users",       routePath: "/admin/users",                    sortOrder: 210, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["사용자", "유저", "user"] },
  { code: "admin.organizations",      kind: "menu", label: "조직",         icon: "Building",    routePath: "/admin/organizations",            sortOrder: 220, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["조직", "organization", "org"] },
  { code: "admin.menus",              kind: "menu", label: "메뉴",         icon: "ListTree",    routePath: "/admin/menus",                    sortOrder: 230, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["메뉴", "menu"] },
  { code: "admin.codes",              kind: "menu", label: "코드",         icon: "Hash",        routePath: "/admin/codes",                    sortOrder: 240, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["코드", "공통코드", "code"] },
  { code: "admin.review-queue",       kind: "menu", label: "검토 대기",    icon: "Inbox",       routePath: "/admin/review-queue",             sortOrder: 250, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["검토", "review", "queue"] },
  { code: "admin.audit",              kind: "menu", label: "감사 로그",    icon: "ScrollText",  routePath: "/admin/audit",                    sortOrder: 260, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["감사", "audit", "log"] },
  { code: "admin.search-analytics",   kind: "menu", label: "검색 분석",    icon: "BarChart3",   routePath: "/admin/search-analytics",         sortOrder: 270, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["검색", "분석", "analytics"] },
  { code: "admin.settings",           kind: "menu", label: "설정",         icon: "Settings",    routePath: "/admin/settings",                 sortOrder: 280, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["설정", "settings"] },
  { code: "admin.llm-cost",           kind: "menu", label: "LLM 비용",     icon: "Coins",       routePath: "/admin/llm-cost",                 sortOrder: 290, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["LLM", "비용", "cost"] },
  { code: "admin.wiki-observability", kind: "menu", label: "위키 운영",    icon: "Activity",    routePath: "/admin/observability/wiki",       sortOrder: 300, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["위키", "운영", "observability"] },
  { code: "admin.wiki-violations",    kind: "menu", label: "경계 위반",    icon: "ShieldAlert", routePath: "/admin/wiki/boundary-violations", sortOrder: 310, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["위반", "violation", "boundary"] },
  { code: "admin.wiki-review",        kind: "menu", label: "위키 리뷰 큐", icon: "ListChecks",  routePath: "/admin/wiki/review-queue",        sortOrder: 320, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["위키", "리뷰", "review"] },
  { code: "admin.infra.licenses",     kind: "menu", label: "인프라 라이센스", icon: "ShieldCheck", routePath: "/admin/infra/licenses",        sortOrder: 330, permissions: [PERMISSIONS.ADMIN_ALL], keywords: ["라이센스", "license", "infra"] },

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
        badge: seed.badge ?? null,
        keywords: seed.keywords ?? null,
      })
      .onConflictDoUpdate({
        target: [menuItem.workspaceId, menuItem.code],
        set: {
          kind: sql`excluded.kind`,
          label: sql`excluded.label`,
          icon: sql`excluded.icon`,
          routePath: sql`excluded.route_path`,
          sortOrder: sql`excluded.sort_order`,
          badge: sql`excluded.badge`,
          keywords: sql`excluded.keywords`,
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
