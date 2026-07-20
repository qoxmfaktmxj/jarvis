import { describe, expect, it } from "vitest";
import { listUsersInput, saveUsersInput } from "../validation/admin/user.js";
import { saveMenusInput } from "../validation/admin/menu.js";
import { listCodeGroupsInput, saveCodeItemsInput } from "../validation/admin/code.js";
import { buildAuditRow } from "../audit.js";

describe("admin validation", () => {
  it("parses user queries and save payloads", () => {
    expect(listUsersInput.parse({})).toMatchObject({ accountType: "human", page: 1, limit: 50 });
    expect(
      saveUsersInput.parse({
        creates: [{
          id: "11111111-1111-1111-1111-111111111111",
          email: "ADMIN@EXAMPLE.INVALID",
          displayName: "Admin",
          role: "ADMIN",
          status: "active",
          initialPassword: "PublicJarvis2026",
        }],
      }).creates[0].email,
    ).toBe("admin@example.invalid");
  });

  it("rejects non-public page routes and invalid group routes", () => {
    const removedRoute = `/${["sa", "les"].join("")}/contracts`;
    expect(() => saveMenusInput.parse({
      creates: [{
        id: "11111111-1111-1111-1111-111111111111",
        parentId: null,
        code: "bad-page",
        label: "Bad Page",
        description: null,
        kind: "page",
        icon: null,
        routePath: removedRoute,
        sortOrder: 1,
        isVisible: true,
        permissionCodes: [],
      }],
    })).toThrow(/route/i);

    expect(() => saveMenusInput.parse({
      creates: [{
        id: "11111111-1111-1111-1111-111111111111",
        parentId: null,
        code: "bad-group",
        label: "Bad Group",
        description: null,
        kind: "group",
        icon: null,
        routePath: "/wiki",
        sortOrder: 1,
        isVisible: true,
        permissionCodes: [],
      }],
    })).toThrow(/group route/i);
  });

  it("parses code filters and item batches", () => {
    expect(listCodeGroupsInput.parse({})).toMatchObject({ page: 1, limit: 100 });
    expect(saveCodeItemsInput.parse({
      creates: [{
        id: "11111111-1111-1111-1111-111111111111",
        groupId: "22222222-2222-2222-2222-222222222222",
        code: "AVERAGE_WAGE",
        name: "Average Wage",
        description: null,
        sortOrder: 1,
        isActive: true,
        metadata: {},
      }],
    }).creates).toHaveLength(1);
  });

  it("redacts nested credential-shaped audit fields", () => {
    const sensitiveValue = ["do", "-not", "-store"].join("");
    const redacted = ["[", "REDACTED", "]"].join("");
    const row = buildAuditRow({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      userId: null,
      action: "test",
      resourceType: "test",
      details: {
        email: "demo@example.invalid",
        password: sensitiveValue,
        nested: { apiKey: sensitiveValue, label: "safe" },
      },
    });
    expect(row.details).toEqual({
      email: "demo@example.invalid",
      password: redacted,
      nested: { apiKey: redacted, label: "safe" },
    });
  });
});
