import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "./types.js";

const PRIVILEGED_KNOWLEDGE_PERMISSIONS = [
  PERMISSIONS.KNOWLEDGE_UPDATE,
  PERMISSIONS.KNOWLEDGE_REVIEW,
  PERMISSIONS.ADMIN_ALL
] as const;

const KNOWLEDGE_RESTRICTED_SENSITIVITIES = [
  "RESTRICTED",
  "SECRET_REF_ONLY"
] as const;

const WIKI_SENSITIVITIES = [
  "PUBLIC",
  "INTERNAL",
  "RESTRICTED",
  "SECRET_REF_ONLY"
] as const;

const PROJECT_ROLE_ORDER = {
  VIEWER: 0,
  DEVELOPER: 1,
  MANAGER: 2,
  ADMIN: 3
} as const;

export function hasPermission(
  session: JarvisSession,
  permission: string
): boolean {
  return session.permissions.includes(permission);
}

export function hasRole(session: JarvisSession, roleCode: string): boolean {
  return session.roles.includes(roleCode);
}

export function isAdmin(session: JarvisSession): boolean {
  return session.permissions.includes(PERMISSIONS.ADMIN_ALL);
}

/**
 * Convenience wrapper that delegates to {@link canAccessKnowledgeSensitivityByPermissions}.
 *
 * **Scope: `knowledge_page` table only.**
 * For `wiki_page_index` (Karpathy-projection), use {@link canViewWikiPage} from
 * `wiki-acl.ts`, which additionally inspects `requiredPermission` and `publishedStatus`.
 */
export function canAccessKnowledgeSensitivity(
  session: Pick<JarvisSession, "permissions">,
  sensitivity: string | null | undefined
): boolean {
  return canAccessKnowledgeSensitivityByPermissions(
    session.permissions,
    sensitivity
  );
}

/**
 * Core access-check for the **`knowledge_page`** (legacy) table.
 *
 * **Boundary:** This helper evaluates `sensitivity` only — it does NOT inspect
 * `requiredPermission` or `publishedStatus`, which are `wiki_page_index`-only columns.
 *
 * Do NOT use this helper for `wiki_page_index` rows.
 * For `wiki_page_index` (Karpathy-projection), use {@link canViewWikiPage} from
 * `wiki-acl.ts` instead — it checks all three access dimensions:
 *   1. `publishedStatus` — only `'published'` exposed to non-admin
 *   2. `requiredPermission` — per-page permission gate
 *   3. `sensitivity` — delegates to {@link resolveAllowedWikiSensitivities}
 *
 * Sole production caller: `apps/web/lib/queries/knowledge.ts` (queries `knowledge_page`).
 */
export function canAccessKnowledgeSensitivityByPermissions(
  permissions: string[],
  sensitivity: string | null | undefined
): boolean {
  if (
    !sensitivity ||
    !KNOWLEDGE_RESTRICTED_SENSITIVITIES.includes(
      sensitivity as (typeof KNOWLEDGE_RESTRICTED_SENSITIVITIES)[number]
    )
  ) {
    return (
      permissions.includes(PERMISSIONS.KNOWLEDGE_READ) ||
      permissions.includes(PERMISSIONS.KNOWLEDGE_UPDATE) ||
      permissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW) ||
      permissions.includes(PERMISSIONS.ADMIN_ALL)
    );
  }

  return PRIVILEGED_KNOWLEDGE_PERMISSIONS.some((permission) =>
    permissions.includes(permission)
  );
}

/**
 * @deprecated legacy 권한 모델, knowledge_page 경로 전용.
 * wiki_page_index 경로에서는 `buildWikiSensitivitySqlFilter`를 사용.
 */
export function buildLegacyKnowledgeSensitivitySqlFilter(
  permissions: string[]
): string {
  if (
    PRIVILEGED_KNOWLEDGE_PERMISSIONS.some((permission) =>
      permissions.includes(permission)
    )
  ) {
    return "";
  }

  if (permissions.includes(PERMISSIONS.KNOWLEDGE_READ)) {
    return "AND sensitivity NOT IN ('RESTRICTED', 'SECRET_REF_ONLY')";
  }

  return "AND 1 = 0";
}

export function getAllowedWikiSensitivityValues(
  permissions: string[]
): Array<(typeof WIKI_SENSITIVITIES)[number]> {
  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return [...WIKI_SENSITIVITIES];
  }

  const allowed: Array<(typeof WIKI_SENSITIVITIES)[number]> = [];
  if (permissions.includes(PERMISSIONS.KNOWLEDGE_READ)) {
    allowed.push("PUBLIC", "INTERNAL");
  }
  if (permissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW)) {
    allowed.push("RESTRICTED");
  }
  if (permissions.includes(PERMISSIONS.PROJECT_ACCESS_SECRET)) {
    allowed.push("SECRET_REF_ONLY");
  }

  return allowed;
}

export function canResolveProjectSecrets(
  permissions: string[],
  _sensitivity: string | null | undefined
): boolean {
  return (
    permissions.includes(PERMISSIONS.ADMIN_ALL) ||
    permissions.includes(PERMISSIONS.PROJECT_ACCESS_SECRET)
  );
}

export function canAccessProjectAccessEntry(
  roles: string[],
  requiredRole: string | null | undefined
): boolean {
  if (!requiredRole) {
    return true;
  }

  const requiredRank =
    PROJECT_ROLE_ORDER[requiredRole as keyof typeof PROJECT_ROLE_ORDER];
  if (requiredRank === undefined) {
    return false;
  }

  const highestRank = roles.reduce((maxRank, role) => {
    const rank = PROJECT_ROLE_ORDER[role as keyof typeof PROJECT_ROLE_ORDER];
    return rank === undefined ? maxRank : Math.max(maxRank, rank);
  }, -1);

  return highestRank >= requiredRank;
}

const GRAPH_RESTRICTED_SENSITIVITIES = [
  "RESTRICTED",
  "SECRET_REF_ONLY"
] as const;

/**
 * Can the caller see a graph_snapshot with this sensitivity?
 * PUBLIC/INTERNAL require graph:read. RESTRICTED/SECRET_REF_ONLY require admin:all
 * in P0 (a graph:review permission may be added in P1).
 * null/undefined sensitivity is treated as INTERNAL.
 */
export function canAccessGraphSnapshotSensitivity(
  permissions: string[],
  sensitivity: string | null | undefined
): boolean {
  const effective = sensitivity ?? "INTERNAL";

  if (
    GRAPH_RESTRICTED_SENSITIVITIES.includes(
      effective as (typeof GRAPH_RESTRICTED_SENSITIVITIES)[number]
    )
  ) {
    return permissions.includes(PERMISSIONS.ADMIN_ALL);
  }

  return (
    permissions.includes(PERMISSIONS.GRAPH_READ) ||
    permissions.includes(PERMISSIONS.ADMIN_ALL)
  );
}

/**
 * SQL fragment to append to a WHERE clause that already references
 * `graph_snapshot`. Returns empty string for admin (no filter needed),
 * a sensitivity NOT IN clause for graph:read holders, or "AND 1 = 0"
 * for callers who lack graph:read entirely.
 */
export function buildGraphSnapshotSensitivitySqlFragment(
  permissions: string[]
): string {
  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return "";
  }
  if (permissions.includes(PERMISSIONS.GRAPH_READ)) {
    return "AND sensitivity NOT IN ('RESTRICTED', 'SECRET_REF_ONLY')";
  }
  return "AND 1 = 0";
}

/**
 * Phase-W3 PR3 — wiki_page_index sensitivity 접근 해석 단일 진입점.
 *
 * 호출자가 보유한 권한 배열에서 접근 가능한 wiki sensitivity 값 목록을 반환한다.
 * `canViewSensitivity`와 `buildWikiSensitivitySqlFilter` 모두 이 함수를 기반으로
 * 재구성하여 규칙 중복을 제거한다.
 *
 * 규칙:
 *   - ADMIN_ALL → 전체 4값
 *   - KNOWLEDGE_READ → PUBLIC, INTERNAL
 *   - KNOWLEDGE_REVIEW → +RESTRICTED
 *   - PROJECT_ACCESS_SECRET → +SECRET_REF_ONLY
 *   - 위 어디에도 해당 없음 → []
 */
export function resolveAllowedWikiSensitivities(permissions: string[]): string[] {
  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return ["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"];
  }
  if (!permissions.includes(PERMISSIONS.KNOWLEDGE_READ)) {
    return [];
  }
  const out: string[] = ["PUBLIC", "INTERNAL"];
  if (permissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW)) out.push("RESTRICTED");
  if (permissions.includes(PERMISSIONS.PROJECT_ACCESS_SECRET)) out.push("SECRET_REF_ONLY");
  return out;
}

/**
 * Phase-W3 T5 — wiki_page_index 전용 sensitivity SQL 필터.
 *
 * `resolveAllowedWikiSensitivities()` 기반으로 동작한다.
 * admin 은 빈 문자열, 권한 없으면 `"AND 1 = 0"`.
 *
 * @param permissions 호출자가 보유한 권한 문자열 배열
 * @param options.column  필터링할 sensitivity 컬럼 참조 (기본 `"sensitivity"`)
 * @returns SQL fragment 문자열 (예: `"AND sensitivity IN ('PUBLIC','INTERNAL')"`)
 */
export function buildWikiSensitivitySqlFilter(
  permissions: string[],
  options: { column?: string } = {}
): string {
  const col = options.column ?? "sensitivity";

  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return "";
  }

  const allowed = resolveAllowedWikiSensitivities(permissions);

  if (allowed.length === 0) {
    return "AND 1 = 0";
  }

  const quoted = allowed.map((v) => `'${v}'`).join(", ");
  return `AND ${col} IN (${quoted})`;
}

export function canManageContractors(session: JarvisSession): boolean {
  return hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
}

export function canAccessContractorData(
  session: JarvisSession,
  targetUserId: string
): boolean {
  if (canManageContractors(session)) return true;
  return (
    hasPermission(session, PERMISSIONS.CONTRACTOR_READ) &&
    session.userId === targetUserId
  );
}

/**
 * @deprecated legacy 권한 모델, wiki surface에서 사용 금지.
 * wiki_page_index 경로에서는 `resolveAllowedWikiSensitivities` 또는 `canViewSensitivity`를 사용.
 */
export function legacyCanAccessSensitivity(
  session: JarvisSession,
  sensitivity: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "SECRET_REF_ONLY"
): boolean {
  if (sensitivity === "PUBLIC") {
    return true;
  }
  if (sensitivity === "INTERNAL") {
    return session.permissions.length > 0;
  }
  if (sensitivity === "RESTRICTED") {
    return (
      session.permissions.includes(PERMISSIONS.PROJECT_READ) ||
      session.permissions.includes(PERMISSIONS.PROJECT_ACCESS_SECRET) ||
      session.permissions.includes(PERMISSIONS.ADMIN_ALL)
    );
  }
  // SECRET_REF_ONLY
  return (
    session.permissions.includes(PERMISSIONS.PROJECT_ACCESS_SECRET) ||
    session.permissions.includes(PERMISSIONS.ADMIN_ALL)
  );
}
