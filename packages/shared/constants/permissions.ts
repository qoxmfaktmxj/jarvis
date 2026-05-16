/**
 * RBAC Permissions — 23개 (2026-05-16 simplification)
 *
 * 변형 2-tier 패턴: 모든 도메인 {read, admin} + admin:all 마스터.
 * 폐기된 권한 47 → 23 매핑은 docs/superpowers/plans/2026-05-16-rbac-simplification.md 1.2 참조.
 *
 * owner check가 필요한 도메인 (knowledge·schedule)은 RBAC 밖 도메인 로직으로 처리.
 */
export const PERMISSIONS = {
  // Knowledge (지식 페이지·위키)
  KNOWLEDGE_READ: "knowledge:read",
  KNOWLEDGE_ADMIN: "knowledge:admin",

  // Project (프로젝트 + 추가개발 통합)
  PROJECT_READ: "project:read",
  PROJECT_ADMIN: "project:admin",

  // Notice (공지)
  NOTICE_READ: "notice:read",
  NOTICE_ADMIN: "notice:admin",

  // Maintenance (유지보수 + service-desk + month-report 통합)
  MAINTENANCE_READ: "maintenance:read",
  MAINTENANCE_ADMIN: "maintenance:admin",

  // Infra (인프라)
  INFRA_READ: "infra:read",
  INFRA_ADMIN: "infra:admin",

  // Doc-num (문서번호)
  DOC_NUM_READ: "doc-num:read",
  DOC_NUM_ADMIN: "doc-num:admin",

  // FAQ
  FAQ_READ: "faq:read",
  FAQ_ADMIN: "faq:admin",

  // Graph (지식 그래프)
  GRAPH_READ: "graph:read",
  GRAPH_ADMIN: "graph:admin",

  // User (사용자 + contractor 통합)
  USER_READ: "user:read",
  USER_ADMIN: "user:admin",

  // Schedule (개인 일정 — owner check 적용)
  SCHEDULE_READ: "schedule:read",
  SCHEDULE_ADMIN: "schedule:admin",

  // Sales (영업관리)
  SALES_READ: "sales:read",
  SALES_ADMIN: "sales:admin",

  // Admin 마스터 (audit:read + files:write 흡수)
  ADMIN_ALL: "admin:all"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role → Permission 매핑 (4역할).
 *
 * - ADMIN (관리자):  슈퍼유저, 23권한 전부
 * - MANAGER (매니저): 부서장/책임자, admin:all 제외 + user:admin 제외 = 20권한
 * - MEMBER (일반):   일반 사원, read + schedule:admin = 10권한
 * - YEAREND (연말정산): 외부 yearend 사이트용, jarvis 내부 권한 0개
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: Object.values(PERMISSIONS) as Permission[],
  MANAGER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.KNOWLEDGE_ADMIN,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_ADMIN,
    PERMISSIONS.NOTICE_READ,
    PERMISSIONS.NOTICE_ADMIN,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.MAINTENANCE_ADMIN,
    PERMISSIONS.INFRA_READ,
    PERMISSIONS.INFRA_ADMIN,
    PERMISSIONS.DOC_NUM_READ,
    PERMISSIONS.DOC_NUM_ADMIN,
    PERMISSIONS.FAQ_READ,
    PERMISSIONS.FAQ_ADMIN,
    PERMISSIONS.GRAPH_READ,
    PERMISSIONS.GRAPH_ADMIN,
    PERMISSIONS.USER_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.SCHEDULE_ADMIN,
    PERMISSIONS.SALES_READ,
    PERMISSIONS.SALES_ADMIN
  ],
  MEMBER: [
    PERMISSIONS.KNOWLEDGE_READ,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.NOTICE_READ,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.INFRA_READ,
    PERMISSIONS.DOC_NUM_READ,
    PERMISSIONS.FAQ_READ,
    PERMISSIONS.GRAPH_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.SCHEDULE_ADMIN
  ],
  YEAREND: []
};

/**
 * Role 한글 라벨 (UI 표시용).
 * 영문 code (ADMIN/MANAGER/MEMBER/YEAREND)는 그대로 유지.
 */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "관리자",
  MANAGER: "매니저",
  MEMBER: "일반",
  YEAREND: "연말정산"
};
