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
  return session.roles.includes("ADMIN");
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
    return session.roles.some((role) =>
      ["ADMIN", "MANAGER", "DEVELOPER"].includes(role)
    );
  }
  return session.roles.includes("ADMIN") || session.roles.includes("DEVELOPER");
}
