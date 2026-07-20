export const PERMISSIONS = {
  WIKI_READ: "wiki:read",
  WIKI_EDIT: "wiki:edit",
  ASK_USE: "ask:use",
  SOURCE_READ: "source:read",
  SOURCE_INGEST: "source:ingest",
  REVIEW_MANAGE: "review:manage",
  USER_ADMIN: "user:admin",
  MENU_ADMIN: "menu:admin",
  CODE_ADMIN: "code:admin",
  LLM_USAGE_READ: "llm-usage:read",
  AUDIT_READ: "audit:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_CODES = ["ADMIN", "EDITOR", "READER"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

const READER_PERMISSIONS = [
  PERMISSIONS.WIKI_READ,
  PERMISSIONS.ASK_USE,
  PERMISSIONS.SOURCE_READ,
] as const;

const EDITOR_PERMISSIONS = [
  ...READER_PERMISSIONS,
  PERMISSIONS.WIKI_EDIT,
  PERMISSIONS.SOURCE_INGEST,
  PERMISSIONS.REVIEW_MANAGE,
] as const;

export const ROLE_PERMISSIONS = {
  READER: READER_PERMISSIONS,
  EDITOR: EDITOR_PERMISSIONS,
  ADMIN: Object.values(PERMISSIONS),
} as const satisfies Record<RoleCode, readonly Permission[]>;

export function isPermission(value: string): value is Permission {
  return (Object.values(PERMISSIONS) as readonly string[]).includes(value);
}
