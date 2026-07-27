import { PERMISSIONS, type Permission } from "./permissions.js";

export const PUBLIC_ROUTE_ALLOWLIST = [
  "/dashboard",
  "/ask",
  "/wiki",
  "/search",
  "/profile",
  "/admin/sources",
  "/admin/wiki-reviews",
  "/admin/users",
  "/admin/menus",
  "/admin/codes",
  "/admin/llm-usage",
  "/admin/audit",
] as const;

export const FIXED_MENU_PERMISSION_CODES = Object.values(PERMISSIONS) as [Permission, ...Permission[]];
const CONTROL = /[\u0000-\u001f\u007f]/;

export type SystemMenu = {
  code: string;
  label: string;
  description: string;
  routePath: (typeof PUBLIC_ROUTE_ALLOWLIST)[number] | null;
  icon: string;
  sortOrder: number;
  isVisible: boolean;
  permissionCodes: readonly Permission[];
};

export const SYSTEM_MENUS = [
  { code: "dashboard", label: "대시보드", description: "서비스 현황", routePath: "/dashboard", icon: "LayoutDashboard", sortOrder: 10, isVisible: true, permissionCodes: [PERMISSIONS.WIKI_READ] },
  { code: "ask", label: "Ask AI", description: "근거 기반 AI 질의", routePath: "/ask", icon: "MessageSquare", sortOrder: 20, isVisible: true, permissionCodes: [PERMISSIONS.ASK_USE] },
  { code: "wiki", label: "HR Wiki", description: "HR 컴플라이언스 위키", routePath: "/wiki", icon: "BookOpen", sortOrder: 30, isVisible: true, permissionCodes: [PERMISSIONS.WIKI_READ] },
  { code: "search", label: "검색", description: "통합 근거 검색", routePath: "/search", icon: "Search", sortOrder: 40, isVisible: false, permissionCodes: [PERMISSIONS.WIKI_READ] },
  { code: "sources", label: "공식 자료", description: "공식 자료 수집", routePath: "/admin/sources", icon: "FileText", sortOrder: 50, isVisible: false, permissionCodes: [PERMISSIONS.SOURCE_INGEST] },
  { code: "wiki-reviews", label: "검토 대기열", description: "Wiki 변경 검토", routePath: "/admin/wiki-reviews", icon: "ListChecks", sortOrder: 60, isVisible: true, permissionCodes: [PERMISSIONS.REVIEW_MANAGE] },
  { code: "users", label: "사용자", description: "사용자와 고정 역할 관리", routePath: "/admin/users", icon: "Users", sortOrder: 70, isVisible: true, permissionCodes: [PERMISSIONS.USER_ADMIN] },
  { code: "menus", label: "메뉴", description: "공개 메뉴 관리", routePath: "/admin/menus", icon: "Menu", sortOrder: 80, isVisible: true, permissionCodes: [PERMISSIONS.MENU_ADMIN] },
  { code: "codes", label: "코드", description: "기준코드 관리", routePath: "/admin/codes", icon: "Braces", sortOrder: 90, isVisible: true, permissionCodes: [PERMISSIONS.CODE_ADMIN] },
  { code: "llm-usage", label: "LLM 사용량", description: "모델 사용량과 비용", routePath: "/admin/llm-usage", icon: "ChartNoAxesColumn", sortOrder: 100, isVisible: true, permissionCodes: [PERMISSIONS.LLM_USAGE_READ] },
  { code: "audit", label: "감사 로그", description: "관리 작업 감사", routePath: "/admin/audit", icon: "ShieldCheck", sortOrder: 110, isVisible: true, permissionCodes: [PERMISSIONS.AUDIT_READ] },
] as const satisfies readonly SystemMenu[];

function fullyDecode(value: string): string | null {
  let decoded = value;
  try {
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return decoded;
      }
      decoded = next;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function isAllowedRoutePath(value: string | null | undefined): value is string {
  if (typeof value !== "string" || value !== value.trim() || value.length === 0) {
    return false;
  }
  const decoded = fullyDecode(value);
  if (!decoded || !decoded.startsWith("/") || decoded.startsWith("//")) {
    return false;
  }
  if (decoded.includes("\\") || decoded.includes("?") || decoded.includes("#") || CONTROL.test(decoded)) {
    return false;
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    return false;
  }
  return PUBLIC_ROUTE_ALLOWLIST.some((prefix) => decoded === prefix || decoded.startsWith(`${prefix}/`));
}

export function normalizeAllowedRoutePath(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (!isAllowedRoutePath(value)) {
    throw new Error("routePath is not in the public allowlist");
  }
  return fullyDecode(value);
}
