import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "./types.js";

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
