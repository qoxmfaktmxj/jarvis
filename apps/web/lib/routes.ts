/**
 * @deprecated 메뉴 데이터는 DB(`menu_item` 테이블)로 마이그레이션됨.
 *
 * 현재 잔존 export의 실제 사용처:
 * - `NAV_ITEMS` / `ADMIN_ITEMS` / `ACTION_ITEMS`, `ADMIN_ITEM`,
 *   `NavItem` / `ActionItem`: `apps/web/lib/routes.test.ts`만 참조 (uniqueness/legacy
 *   redirect 검증용 픽스처 역할). 새 메뉴 추가는 절대 여기에 하지 말 것 —
 *   `packages/db/seed/menus.ts`의 `MENU_SEEDS`가 SoT.
 * - `ROUTE_LABELS`: `Topbar`가 breadcrumb 라벨에 사용 중. 후속 task에서
 *   `apps/web/lib/route-labels.ts`로 분리하여 routes.ts 삭제 가능하게 한다.
 * - `LEGACY_REDIRECTS`: `apps/web/middleware.ts`가 직접 사용하지는 않으며(미들웨어
 *   import 제약 때문에 in-line 처리), `routes.test.ts`에서 미들웨어 동작을 검증하는 용도.
 *
 * @see packages/db/seed/menus.ts — MENU_SEEDS (source of truth)
 * @see apps/web/lib/server/menu-tree.ts — getVisibleMenuTree (런타임 RBAC 필터)
 */
import {
  Activity,
  BarChart3,
  BookOpen,
  Building,
  Building2,
  CalendarX,
  ClipboardList,
  Coins,
  Contact,
  FilePlus,
  FileText,
  GitFork,
  HardDrive,
  Hash,
  Inbox,
  Key,
  Library,
  ListChecks,
  ListTree,
  Mail,
  Megaphone,
  MessageSquare,
  Network,
  Plus,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  description?: string;
  keywords?: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "nav-notices",      href: "/notices",            label: "공지사항",      icon: Megaphone,       description: "사내 공지사항",      keywords: ["notice", "공지"] },
  { id: "nav-ask",          href: "/ask",                label: "AI 질문",       icon: MessageSquare,   description: "AI에게 질문",        keywords: ["ai", "chat", "질문"], badge: "AI" },
  { id: "nav-search",       href: "/search",             label: "검색",          icon: Search,          description: "전체 리소스 검색",   keywords: ["search", "find"] },
  { id: "nav-wiki",         href: "/wiki",               label: "위키",          icon: Library,         description: "워크스페이스 지식",  keywords: ["wiki", "knowledge"] },
  { id: "nav-wiki-graph",   href: "/wiki/graph",         label: "위키 그래프",   icon: GitFork,         description: "지식 그래프 탐색",   keywords: ["graph", "network"] },
  { id: "nav-wiki-ingest",  href: "/wiki/ingest/manual", label: "위키 수동수집", icon: FilePlus,        description: "원문 수동 수집",     keywords: ["ingest", "manual"] },
  { id: "nav-knowledge",    href: "/knowledge",          label: "Knowledge",     icon: BookOpen,        description: "FAQ · 용어집 · HR",  keywords: ["kb", "faq", "glossary"] },
  { id: "nav-projects",     href: "/projects",           label: "프로젝트",      icon: Server,          description: "프로젝트 목록",      keywords: ["project", "system"] },
  { id: "nav-architecture", href: "/architecture",       label: "아키텍처",      icon: Network,         description: "아키텍처 그래프",    keywords: ["architecture", "graph"] },
  { id: "nav-infra",        href: "/infra",              label: "인프라",        icon: HardDrive,       description: "인프라 맵",          keywords: ["infra"] },
  { id: "nav-add-dev",      href: "/add-dev",            label: "추가개발",      icon: ClipboardList,   description: "개발 요청",          keywords: ["request", "dev"] },
  { id: "nav-contractors",  href: "/contractors",        label: "외주인력관리",  icon: Users,           description: "외주 인력",          keywords: ["contractor", "outsourcing"] },
  { id: "nav-holidays",     href: "/holidays",           label: "공휴일 관리",   icon: CalendarX,       description: "공휴일 설정",        keywords: ["holiday"] },
  { id: "nav-profile",      href: "/profile",            label: "프로필",        icon: User,            description: "내 계정",            keywords: ["profile", "me"] },
];

export const SALES_ITEM: NavItem = {
  id: "nav-sales",
  href: "/sales",
  label: "영업관리",
  icon: ShoppingBag,
  description: "영업 마스터 관리",
  keywords: ["sales", "영업"],
};

export const SALES_ITEMS: readonly NavItem[] = [
  { id: "nav-sales-companies",         href: "/admin/companies",              label: "거래처관리",   icon: Building2, description: "회사 마스터 (거래처)", keywords: ["company", "거래처"] },
  { id: "nav-sales-customers",         href: "/sales/customers",              label: "고객사관리",   icon: Users,     description: "고객사 마스터",       keywords: ["customer", "고객사"] },
  { id: "nav-sales-customer-contacts", href: "/sales/customer-contacts",      label: "담당자관리",   icon: Contact,   description: "고객 담당자 연락처",  keywords: ["contact", "담당자"] },
  { id: "nav-sales-product-types",     href: "/sales/product-types",          label: "제품군관리",   icon: ShoppingBag, description: "제품군 마스터",     keywords: ["product", "제품"] },
  { id: "nav-sales-mail-persons",      href: "/sales/mail-persons",           label: "메일담당자",   icon: Mail,      description: "메일 수신 담당자",    keywords: ["mail", "메일"] },
  { id: "nav-sales-licenses",          href: "/sales/licenses",               label: "라이센스관리", icon: Key,       description: "고객사별 라이센스",   keywords: ["license", "라이센스"] },
];

export const ADMIN_ITEM: NavItem = {
  id: "nav-admin",
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  description: "Admin 콘솔",
  keywords: ["admin"],
};

export const ADMIN_ITEMS: readonly NavItem[] = [
  { id: "nav-admin-companies",          href: "/admin/companies",                label: "회사",         icon: Building2,    description: "회사 마스터",        keywords: ["company", "회사"] },
  { id: "nav-admin-users",              href: "/admin/users",                    label: "사용자",       icon: Users,        description: "사용자 관리",        keywords: ["user", "사용자"] },
  { id: "nav-admin-organizations",      href: "/admin/organizations",            label: "조직",         icon: Building,     description: "조직 관리",          keywords: ["organization", "부서"] },
  { id: "nav-admin-menus",              href: "/admin/menus",                    label: "메뉴",         icon: ListTree,     description: "메뉴 마스터",        keywords: ["menu"] },
  { id: "nav-admin-codes",              href: "/admin/codes",                    label: "코드",         icon: Hash,         description: "공통 코드",          keywords: ["code", "코드"] },
  { id: "nav-admin-review-queue",       href: "/admin/review-queue",             label: "검토 대기",    icon: Inbox,        description: "검토 대기열",        keywords: ["review"] },
  { id: "nav-admin-audit",              href: "/admin/audit",                    label: "감사 로그",    icon: ScrollText,   description: "감사 로그",          keywords: ["audit", "log"] },
  { id: "nav-admin-search-analytics",   href: "/admin/search-analytics",         label: "검색 분석",    icon: BarChart3,    description: "검색 분석",          keywords: ["search", "analytics"] },
  { id: "nav-admin-settings",           href: "/admin/settings",                 label: "설정",         icon: Settings,     description: "시스템 설정",        keywords: ["settings"] },
  { id: "nav-admin-llm-cost",           href: "/admin/llm-cost",                 label: "LLM 비용",     icon: Coins,        description: "LLM 비용 모니터링",  keywords: ["llm", "cost"] },
  { id: "nav-admin-wiki-observability", href: "/admin/observability/wiki",       label: "위키 운영",    icon: Activity,     description: "위키 운영 지표",     keywords: ["wiki", "observability"] },
  { id: "nav-admin-wiki-violations",    href: "/admin/wiki/boundary-violations", label: "경계 위반",    icon: ShieldAlert,  description: "위키 경계 위반",     keywords: ["wiki", "violation"] },
  { id: "nav-admin-wiki-review",        href: "/admin/wiki/review-queue",        label: "위키 리뷰 큐", icon: ListChecks,   description: "위키 리뷰 대기열",   keywords: ["wiki", "review"] },
];

export interface ActionItem {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  keywords?: readonly string[];
}

export const ACTION_ITEMS: readonly ActionItem[] = [
  { id: "act-new-notice",  href: "/notices/new",   label: "새 공지 작성", icon: FileText,  keywords: ["create", "new"] },
  { id: "act-new-kb",      href: "/knowledge/new", label: "새 KB 페이지", icon: FileText,  keywords: ["create", "new"] },
  { id: "act-new-project", href: "/projects/new",  label: "새 프로젝트",  icon: Plus,      keywords: ["create", "new", "project"] },
  { id: "act-settings",    href: "/profile",       label: "설정",         icon: Settings,  keywords: ["settings"] },
];

export const ROUTE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/dashboard",    "대시보드"],
  ["/ask",          "AI 질문"],
  ["/search",       "검색"],
  ["/wiki",         "위키"],
  ["/knowledge",    "Knowledge Base"],
  ["/projects",     "프로젝트"],
  ["/admin",        "관리자"],
  ["/notices",      "공지"],
  ["/infra",        "인프라"],
  ["/architecture", "아키텍처"],
  ["/add-dev",      "추가개발"],
  ["/contractors",              "외주인력관리"],
  ["/holidays",                 "공휴일 관리"],
  ["/profile",                  "프로필"],
  ["/sales/customers",          "고객사관리"],
  ["/sales/customer-contacts",  "담당자관리"],
  ["/sales/product-types",      "제품군관리"],
  ["/sales/mail-persons",       "메일담당자"],
  ["/sales/licenses",           "라이센스관리"],
];

export const LEGACY_REDIRECTS: Record<string, string> = {
  "/systems": "/projects",
  "/attendance": "/contractors",
};
