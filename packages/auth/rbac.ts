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
