import type { Permission, RoleCode } from "@jarvis/shared/constants/permissions";

export type AccountType = "human" | "demo";

export interface AuthSession {
  id: string;
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  roleCode: RoleCode;
  permissions: Permission[];
  accountType: AccountType;
  expiresAt: Date;
}

export interface SessionIssueResult {
  sessionId: string;
  expiresAt: Date;
}
