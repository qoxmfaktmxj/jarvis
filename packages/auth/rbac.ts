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

const SYSTEM_ROLE_ORDER = {
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

export function canAccessKnowledgeSensitivity(
  session: Pick<JarvisSession, "permissions">,
  sensitivity: string | null | undefined
): boolean {
  return canAccessKnowledgeSensitivityByPermissions(
    session.permissions,
    sensitivity
  );
}

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

export function buildKnowledgeSensitivitySqlFilter(
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

export function canResolveSystemSecrets(
  permissions: string[],
  _sensitivity: string | null | undefined
): boolean {
  return (
    permissions.includes(PERMISSIONS.ADMIN_ALL) ||
    permissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET)
  );
}

export function canAccessSystemAccessEntry(
  roles: string[],
  requiredRole: string | null | undefined
): boolean {
  if (!requiredRole) {
    return true;
  }

  const requiredRank =
    SYSTEM_ROLE_ORDER[requiredRole as keyof typeof SYSTEM_ROLE_ORDER];
  if (requiredRank === undefined) {
    return false;
  }

  const highestRank = roles.reduce((maxRank, role) => {
    const rank = SYSTEM_ROLE_ORDER[role as keyof typeof SYSTEM_ROLE_ORDER];
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
 * Phase-W3 T5 — wiki_page_index 전용 sensitivity SQL 필터.
 *
 * `apps/web/lib/server/wiki-sensitivity.ts` 의 `canViewSensitivity` 엄격 규약을
 * SQL 쪽에서 재현한다:
 *   - PUBLIC, INTERNAL    → KNOWLEDGE_READ 필요
 *   - RESTRICTED          → KNOWLEDGE_REVIEW 필요 (KNOWLEDGE_UPDATE 단독으로는 불가)
 *   - SECRET_REF_ONLY     → SYSTEM_ACCESS_SECRET 필요
 *   - ADMIN_ALL 은 모든 sensitivity 통과
 *
 * 기존 `buildKnowledgeSensitivitySqlFilter` 는 PRIVILEGED_KNOWLEDGE_PERMISSIONS
 * (KNOWLEDGE_UPDATE | REVIEW | ADMIN_ALL) 중 하나라도 있으면 RESTRICTED/SECRET 까지
 * 모두 통과시키는 "느슨한" 규약이었다. 본 함수는 이를 엄격하게 좁힌다.
 *
 * ## 역할 매트릭스 영향 (permissions.ts ROLE_PERMISSIONS 기준)
 * - ADMIN: ADMIN_ALL 보유 → 영향 없음 (항상 전체 허용)
 * - MANAGER: KNOWLEDGE_UPDATE + KNOWLEDGE_REVIEW 모두 보유 → 영향 없음 (REVIEW 로 RESTRICTED 허용 유지)
 * - DEVELOPER: KNOWLEDGE_UPDATE 단독 보유 (REVIEW 없음), SYSTEM_ACCESS_SECRET 보유
 *     → **실효 변경 있음**: 기존에는 느슨한 규약으로 RESTRICTED wiki_page_index 행을
 *       볼 수 있었으나, 본 엄격 규약에서는 RESTRICTED 는 차단됨.
 *       SECRET_REF_ONLY 는 SYSTEM_ACCESS_SECRET 으로 여전히 열람 가능.
 * - HR / VIEWER: KNOWLEDGE_READ 만 → PUBLIC/INTERNAL 만 허용 (기존 동일)
 *
 * ## 기존 함수와의 관계
 * - `buildKnowledgeSensitivitySqlFilter` 는 `knowledge_page` (legacy) 경로에서 계속 사용됨.
 *   본 함수는 `wiki_page_index` 경로 전용이며, 둘을 혼용하지 않는다.
 *
 * @param permissions 호출자가 보유한 권한 문자열 배열
 * @param options.column  필터링할 sensitivity 컬럼 참조 (기본 `"sensitivity"`,
 *                        wiki_page_index alias 사용 시 `"wpi.sensitivity"` 처럼 전달)
 * @returns SQL fragment 문자열 (예: `"AND wpi.sensitivity IN ('PUBLIC','INTERNAL')"`).
 *          admin 은 빈 문자열, 권한 없으면 `"AND 1 = 0"`.
 */
export function buildWikiSensitivitySqlFilter(
  permissions: string[],
  options: { column?: string } = {}
): string {
  const col = options.column ?? "sensitivity";

  if (permissions.includes(PERMISSIONS.ADMIN_ALL)) {
    return "";
  }

  const allowed: string[] = [];
  if (permissions.includes(PERMISSIONS.KNOWLEDGE_READ)) {
    allowed.push("PUBLIC", "INTERNAL");
  }
  if (permissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW)) {
    allowed.push("RESTRICTED");
  }
  if (permissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET)) {
    allowed.push("SECRET_REF_ONLY");
  }

  if (allowed.length === 0) {
    return "AND 1 = 0";
  }

  const quoted = allowed.map((v) => `'${v}'`).join(", ");
  return `AND ${col} IN (${quoted})`;
}

export function canAccessSensitivity(
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
      session.permissions.includes(PERMISSIONS.SYSTEM_READ) ||
      session.permissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET) ||
      session.permissions.includes(PERMISSIONS.ADMIN_ALL)
    );
  }
  // SECRET_REF_ONLY
  return (
    session.permissions.includes(PERMISSIONS.SYSTEM_ACCESS_SECRET) ||
    session.permissions.includes(PERMISSIONS.ADMIN_ALL)
  );
}
