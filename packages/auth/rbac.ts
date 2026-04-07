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
