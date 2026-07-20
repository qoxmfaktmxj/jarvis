import { ROLE_PERMISSIONS, type Permission, type RoleCode } from "@jarvis/shared/constants/permissions";
import type { AuthSession } from "./types.js";

export function can(roleCode: RoleCode, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[roleCode] as readonly Permission[]).includes(permission);
}

export function hasPermission(session: Pick<AuthSession, "permissions">, permission: Permission): boolean {
  return session.permissions.includes(permission);
}
