import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { JarvisSession } from "./types.js";

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
 * 외부 인력(contractor) 관리 권한.
 *
 * 2026-05-16 RBAC simplification: contractor 도메인이 user로 흡수됨.
 * 헬퍼 이름은 호환을 위해 유지하나 내부적으로 USER_ADMIN 권한을 검사.
 */
export function canManageContractors(session: JarvisSession): boolean {
  return hasPermission(session, PERMISSIONS.USER_ADMIN);
}

/**
 * 외부 인력 데이터 접근.
 * USER_ADMIN이면 모두 접근, USER_READ면 본인 데이터만.
 */
export function canAccessContractorData(
  session: JarvisSession,
  targetUserId: string
): boolean {
  if (canManageContractors(session)) return true;
  return (
    hasPermission(session, PERMISSIONS.USER_READ) &&
    session.userId === targetUserId
  );
}
