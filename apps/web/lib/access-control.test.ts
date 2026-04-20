import { describe, expect, it } from "vitest";
import type { JarvisSession } from "@jarvis/auth/types";
import {
  buildLegacyKnowledgeSensitivitySqlFilter,
  canAccessKnowledgeSensitivity,
  canAccessProjectAccessEntry,
  canResolveProjectSecrets
} from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

function makeSession(permissions: string[], roles: string[] = ["VIEWER"]): JarvisSession {
  return {
    id: "session-1",
    userId: "user-1",
    workspaceId: "ws-1",
    employeeId: "EMP-1",
    name: "Test User",
    roles,
    permissions,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000
  };
}

describe("knowledge sensitivity access", () => {
  it("blocks read-only users from restricted knowledge", () => {
    const session = makeSession([PERMISSIONS.KNOWLEDGE_READ]);

    expect(canAccessKnowledgeSensitivity(session, "RESTRICTED")).toBe(false);
    expect(canAccessKnowledgeSensitivity(session, "SECRET_REF_ONLY")).toBe(false);
  });

  it("allows editors and reviewers to restricted knowledge", () => {
    const editor = makeSession([PERMISSIONS.KNOWLEDGE_UPDATE], ["DEVELOPER"]);
    const reviewer = makeSession([PERMISSIONS.KNOWLEDGE_REVIEW], ["MANAGER"]);

    expect(canAccessKnowledgeSensitivity(editor, "RESTRICTED")).toBe(true);
    expect(canAccessKnowledgeSensitivity(reviewer, "SECRET_REF_ONLY")).toBe(true);
  });

  it("builds a strict SQL filter for knowledge read-only sessions", () => {
    expect(
      buildLegacyKnowledgeSensitivitySqlFilter([PERMISSIONS.KNOWLEDGE_READ])
    ).toBe("AND sensitivity NOT IN ('RESTRICTED', 'SECRET_REF_ONLY')");
  });
});

describe("system access controls", () => {
  it("does not resolve secrets for read-only users", () => {
    expect(
      canResolveProjectSecrets([PERMISSIONS.PROJECT_READ], "INTERNAL")
    ).toBe(false);
  });

  it("applies requiredRole as a minimum role threshold", () => {
    expect(canAccessProjectAccessEntry(["VIEWER"], "DEVELOPER")).toBe(false);
    expect(canAccessProjectAccessEntry(["MANAGER"], "DEVELOPER")).toBe(true);
    expect(canAccessProjectAccessEntry(["ADMIN"], "ADMIN")).toBe(true);
  });
});
