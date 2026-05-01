import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

describe("project module actions guards", () => {
  it("gates list and save with project permissions", () => {
    expect(source).toContain("PERMISSIONS.PROJECT_READ");
    expect(source).toContain("resolveProjectMutationContext(input)");
  });

  it("filters mutations and reads by workspaceId", () => {
    expect(source).toContain("eq(projectModule.workspaceId, ctx.workspaceId)");
    expect(source).toContain("workspaceId: ctx.workspaceId");
  });

  it("uses transaction, audit log, and Zod output parsing", () => {
    expect(source).toContain("db.transaction");
    expect(source).toContain("auditLog");
    expect(source).toContain("listProjectModulesOutput.parse");
    expect(source).toContain("saveProjectModulesOutput.parse");
  });
});
