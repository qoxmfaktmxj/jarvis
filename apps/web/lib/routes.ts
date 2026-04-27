import {
  BookOpen,
  CalendarX,
  ClipboardList,
  FilePlus,
  FileText,
  GitFork,
  HardDrive,
  Library,
  Megaphone,
  MessageSquare,
  Network,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
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

export const ADMIN_ITEM: NavItem = {
  id: "nav-admin",
  href: "/admin",
  label: "Admin",
  icon: ShieldCheck,
  description: "Admin 콘솔",
  keywords: ["admin"],
};

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
  ["/contractors",  "외주인력관리"],
  ["/holidays",     "공휴일 관리"],
  ["/profile",      "프로필"],
];

export const LEGACY_REDIRECTS: Record<string, string> = {
  "/systems": "/projects",
  "/attendance": "/contractors",
};
